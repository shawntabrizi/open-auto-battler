use oab_core::state::GameState;
use oab_core::types::{CommitTurnAction, TurnAction};

#[derive(Debug, Clone, Copy)]
pub enum StrategyKind {
    Greedy,
    Random,
    Heuristic,
}

/// Score a card by attack + health + ability bonus.
fn card_score_from_pool(state: &GameState, card_id: oab_core::types::CardId) -> i32 {
    state
        .card_pool
        .get(&card_id)
        .map(|c| c.stats.attack + c.stats.health + c.abilities.len() as i32 * 2)
        .unwrap_or(0)
}

/// Score a board unit including its permanent stat bonuses.
fn board_unit_score(state: &GameState, unit: &oab_core::types::BoardUnit) -> i32 {
    state
        .card_pool
        .get(&unit.card_id)
        .map(|c| {
            (c.stats.attack + unit.perm_attack)
                + (c.stats.health + unit.perm_health)
                + c.abilities.len() as i32 * 2
        })
        .unwrap_or(0)
}

/// Enumerate valid turn plans including board pitching when beneficial.
///
/// Optimization: board pitch combos (2^occupied) are only explored when needed:
///   - Board is full (no empty slots) — must sell to play anything
///   - Hand contains cards too expensive for mana + hand pitches alone
/// Otherwise, only 3^hand_len combos are evaluated (fast path).
pub fn plan_turn(state: &GameState, kind: StrategyKind, rng_seed: u64) -> CommitTurnAction {
    let hand_len = state.hand.len();

    // Pre-fetch hand card data: (play_cost, pitch_value, score)
    let hand_data: Vec<(i32, i32, i32)> = (0..hand_len)
        .map(|i| {
            let card_id = state.hand[i];
            state
                .card_pool
                .get(&card_id)
                .map(|c| {
                    (
                        c.economy.play_cost,
                        c.economy.pitch_value,
                        card_score_from_pool(state, card_id),
                    )
                })
                .unwrap_or((0, 0, 0))
        })
        .collect();

    // Occupied board slots: (slot_index, pitch_value, unit_score)
    let occupied: Vec<(u32, i32, i32)> = state
        .board
        .iter()
        .enumerate()
        .filter_map(|(i, slot)| {
            let unit = slot.as_ref()?;
            let pitch_val = state
                .card_pool
                .get(&unit.card_id)
                .map(|c| c.economy.pitch_value)
                .unwrap_or(0);
            let score = board_unit_score(state, unit);
            Some((i as u32, pitch_val, score))
        })
        .collect();

    let empty_count = 5 - occupied.len();
    let occupied_count = occupied.len();

    if hand_len == 0 {
        return CommitTurnAction {
            actions: Vec::new(),
        };
    }

    // Determine if we need to explore board pitches.
    // Max mana achievable from hand pitches alone:
    let max_hand_pitch_mana: i32 = hand_data.iter().map(|d| d.1).sum::<i32>();
    let max_mana_without_board = (state.shop_mana + max_hand_pitch_mana).min(state.mana_limit);
    // Most expensive card in hand:
    let max_hand_cost = hand_data.iter().map(|d| d.0).max().unwrap_or(0);

    let need_board_pitches = empty_count == 0 // board full — must sell to play
        || (occupied_count > 0 && max_hand_cost > max_mana_without_board); // expensive card needs board sell mana

    let board_combos: u32 = if need_board_pitches {
        1u32 << occupied_count
    } else {
        1 // only combo 0 = keep everything
    };

    let hand_combos = if hand_len > 0 {
        3u32.pow(hand_len as u32)
    } else {
        1
    };

    let mut best_score = i32::MIN;
    let mut best_hand_assignment: Vec<u8> = vec![0; hand_len];
    let mut best_board_assignment: Vec<bool> = vec![false; occupied_count];

    // Simple LCG for random strategy
    let mut rng_state = rng_seed;
    let next_rand = |s: &mut u64| -> u64 {
        *s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *s >> 33
    };

    let mut valid_count = 0u64;

    for board_combo in 0..board_combos {
        // Decode board assignment
        let mut board_pitches = vec![false; occupied_count];
        let mut board_pitch_mana = 0i32;
        let mut board_kept_score = 0i32;
        let mut slots_freed = 0usize;

        for j in 0..occupied_count {
            if (board_combo >> j) & 1 == 1 {
                board_pitches[j] = true;
                board_pitch_mana += occupied[j].1;
                slots_freed += 1;
            } else {
                board_kept_score += occupied[j].2;
            }
        }

        let available_slots = empty_count + slots_freed;

        for hand_combo in 0..hand_combos {
            let mut hand_assignment = vec![0u8; hand_len];
            let mut plays = 0u32;
            let mut tmp = hand_combo;
            for i in 0..hand_len {
                hand_assignment[i] = (tmp % 3) as u8;
                tmp /= 3;
                if hand_assignment[i] == 2 {
                    plays += 1;
                }
            }

            // Check: enough slots for plays
            if plays as usize > available_slots {
                continue;
            }

            // Skip: sold board units but not playing anything (pure downgrade)
            if slots_freed > 0 && plays == 0 {
                continue;
            }

            // Simulate mana: start + board pitches + hand pitches
            let mut mana = (state.shop_mana + board_pitch_mana).min(state.mana_limit);

            for i in 0..hand_len {
                if hand_assignment[i] == 1 {
                    mana = (mana + hand_data[i].1).min(state.mana_limit);
                }
            }

            // Hand plays (check affordability)
            let mut valid = true;
            let mut play_score = 0i32;
            for i in 0..hand_len {
                if hand_assignment[i] == 2 {
                    if mana < hand_data[i].0 {
                        valid = false;
                        break;
                    }
                    mana -= hand_data[i].0;
                    play_score += hand_data[i].2;
                }
            }

            if !valid {
                continue;
            }

            // Total board score = kept units + newly played units
            let total_score = board_kept_score + play_score;

            valid_count += 1;

            let should_pick = match kind {
                StrategyKind::Greedy | StrategyKind::Heuristic => total_score > best_score,
                StrategyKind::Random => {
                    // Reservoir sampling
                    next_rand(&mut rng_state) % valid_count < 1
                }
            };

            if should_pick {
                best_score = total_score;
                best_hand_assignment = hand_assignment;
                best_board_assignment = board_pitches.clone();
            }
        }
    }

    build_turn_action(
        &best_hand_assignment,
        &best_board_assignment,
        &occupied,
        state,
        kind,
    )
}

fn build_turn_action(
    hand_assignment: &[u8],
    board_assignment: &[bool],
    occupied: &[(u32, i32, i32)],
    state: &GameState,
    kind: StrategyKind,
) -> CommitTurnAction {
    let mut actions = Vec::new();

    // 1. Board pitches first (frees slots + gains mana)
    for (j, &should_pitch) in board_assignment.iter().enumerate() {
        if should_pitch {
            actions.push(TurnAction::PitchFromBoard {
                board_slot: occupied[j].0,
            });
        }
    }

    // 2. Hand pitches (gains mana before plays)
    for (i, &a) in hand_assignment.iter().enumerate() {
        if a == 1 {
            actions.push(TurnAction::PitchFromHand {
                hand_index: i as u32,
            });
        }
    }

    // 3. Collect available slots: originally empty + just freed
    let mut available_slots: Vec<u32> = state
        .board
        .iter()
        .enumerate()
        .filter(|(_, s)| s.is_none())
        .map(|(i, _)| i as u32)
        .collect();

    for (j, &should_pitch) in board_assignment.iter().enumerate() {
        if should_pitch {
            available_slots.push(occupied[j].0);
        }
    }

    // 4. Collect play indices from hand
    let mut play_indices: Vec<usize> = hand_assignment
        .iter()
        .enumerate()
        .filter(|(_, &a)| a == 2)
        .map(|(i, _)| i)
        .collect();

    // For heuristic: sort plays by health descending (tanky units to front slots)
    if matches!(kind, StrategyKind::Heuristic) {
        play_indices.sort_by(|&a, &b| {
            let a_hp = state
                .card_pool
                .get(&state.hand[a])
                .map(|c| c.stats.health)
                .unwrap_or(0);
            let b_hp = state
                .card_pool
                .get(&state.hand[b])
                .map(|c| c.stats.health)
                .unwrap_or(0);
            b_hp.cmp(&a_hp)
        });
        available_slots.sort();
    }

    // 5. Assign plays to available slots
    for (slot_idx, &hand_idx) in play_indices.iter().enumerate() {
        if slot_idx < available_slots.len() {
            actions.push(TurnAction::PlayFromHand {
                hand_index: hand_idx as u32,
                board_slot: available_slots[slot_idx],
            });
        }
    }

    CommitTurnAction { actions }
}
