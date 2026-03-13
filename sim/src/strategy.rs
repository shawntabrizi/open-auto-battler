use std::collections::BTreeMap;

use oab_core::state::GameState;
use oab_core::types::{
    Ability, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit, CardId, CommitTurnAction,
    Condition, Matcher, TargetScope, TurnAction, UnitCard,
};

#[derive(Debug, Clone, Copy)]
pub enum StrategyKind {
    Greedy,
    Random,
    Heuristic,
    Tactician,
}

// ---------------------------------------------------------------------------
// Original scoring (used by Greedy / Heuristic / Random)
// ---------------------------------------------------------------------------

/// Score a card by attack + health + ability bonus.
fn card_score_from_pool(state: &GameState, card_id: CardId) -> i32 {
    state
        .card_pool
        .get(&card_id)
        .map(|c| c.stats.attack + c.stats.health + c.battle_abilities.len() as i32 * 2)
        .unwrap_or(0)
}

/// Score a board unit including its permanent stat bonuses.
fn board_unit_score(state: &GameState, unit: &BoardUnit) -> i32 {
    state
        .card_pool
        .get(&unit.card_id)
        .map(|c| {
            (c.stats.attack + unit.perm_attack)
                + (c.stats.health + unit.perm_health)
                + c.battle_abilities.len() as i32 * 2
        })
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Tactician scoring — ability-aware card valuation
// ---------------------------------------------------------------------------

fn tactician_card_score(card: &UnitCard, card_pool: &BTreeMap<CardId, UnitCard>) -> i32 {
    let base = card.stats.attack + card.stats.health;
    let ability_value: i32 = card
        .battle_abilities
        .iter()
        .map(|a| score_ability(a, card_pool))
        .sum();
    base + ability_value
}

fn tactician_board_unit_score(
    unit: &BoardUnit,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> i32 {
    card_pool
        .get(&unit.card_id)
        .map(|c| {
            let base = (c.stats.attack + unit.perm_attack) + (c.stats.health + unit.perm_health);
            let ability_value: i32 = c
                .battle_abilities
                .iter()
                .map(|a| score_ability(a, card_pool))
                .sum();
            base + ability_value
        })
        .unwrap_or(0)
}

fn score_ability(ability: &Ability, card_pool: &BTreeMap<CardId, UnitCard>) -> i32 {
    let raw = score_effect(&ability.effect, card_pool);
    let trigger_mult = trigger_multiplier(&ability.trigger);
    if trigger_mult == 0 {
        return 0; // shop-phase triggers have no combat value
    }
    let scope_mult = scope_multiplier(&ability.effect);
    let cond_factor = condition_discount(&ability.conditions);
    let cap = ability.max_triggers.map(|n| n as i32).unwrap_or(trigger_mult);
    let effective_triggers = trigger_mult.min(cap);

    ((raw as f64 * scope_mult * cond_factor) as i32) * effective_triggers
}

fn score_effect(effect: &AbilityEffect, card_pool: &BTreeMap<CardId, UnitCard>) -> i32 {
    match effect {
        AbilityEffect::Damage { amount, .. } => {
            // Damage removes enemy stats permanently — worth ~1.5x stat points
            (*amount as f64 * 1.5) as i32
        }
        AbilityEffect::ModifyStats {
            health, attack, ..
        } => {
            // Buffs/debuffs: attack slightly more valuable
            health.abs() + (*attack as f64 * 1.2).abs() as i32
        }
        AbilityEffect::ModifyStatsPermanent {
            health, attack, ..
        } => {
            // Permanent buffs worth more
            (*health as f64 * 1.3).abs() as i32 + (*attack as f64 * 1.5).abs() as i32
        }
        AbilityEffect::SpawnUnit { card_id } => {
            // Value of the spawned token
            card_pool
                .get(card_id)
                .map(|c| c.stats.attack + c.stats.health)
                .unwrap_or(4)
        }
        AbilityEffect::Destroy { target } => {
            // Destroy bypasses health — kills an average unit worth ~12 stat points
            // Destroying an ally is negative value (sacrifice effect)
            if target_is_ally(target) {
                -12
            } else {
                12
            }
        }
        AbilityEffect::GainMana { amount } => *amount,
        // Status effects — minor combat value
        AbilityEffect::GrantStatusThisBattle { .. }
        | AbilityEffect::GrantStatusPermanent { .. } => 3,
        AbilityEffect::RemoveStatusPermanent { .. } => 2,
    }
}

fn trigger_multiplier(trigger: &AbilityTrigger) -> i32 {
    match trigger {
        AbilityTrigger::OnStart => 1,
        AbilityTrigger::OnFaint => 1,
        AbilityTrigger::OnAllyFaint => 2,
        AbilityTrigger::OnHurt => 3,
        AbilityTrigger::BeforeUnitAttack => 3,
        AbilityTrigger::AfterUnitAttack => 3,
        AbilityTrigger::BeforeAnyAttack => 4,
        AbilityTrigger::AfterAnyAttack => 4,
        AbilityTrigger::OnSpawn => 1,
        AbilityTrigger::OnAllySpawn => 2,
        AbilityTrigger::OnEnemySpawn => 2,
    }
}

fn scope_multiplier(effect: &AbilityEffect) -> f64 {
    let target = match effect {
        AbilityEffect::Damage { target, .. } => target,
        AbilityEffect::ModifyStats { target, .. } => target,
        AbilityEffect::ModifyStatsPermanent { target, .. } => target,
        AbilityEffect::Destroy { target } => target,
        AbilityEffect::SpawnUnit { .. } | AbilityEffect::GainMana { .. } => return 1.0,
        AbilityEffect::GrantStatusThisBattle { target, .. }
        | AbilityEffect::GrantStatusPermanent { target, .. }
        | AbilityEffect::RemoveStatusPermanent { target, .. } => target,
    };

    match target {
        AbilityTarget::All { scope } => match scope {
            TargetScope::Enemies => 3.0,
            TargetScope::Allies | TargetScope::AlliesOther => 3.0,
            TargetScope::All => 2.0, // hits both sides — net positive but discounted
            TargetScope::SelfUnit => 1.0,
            _ => 1.0,
        },
        AbilityTarget::Position { .. } => 1.0,
        AbilityTarget::Adjacent { .. } => 2.0,
        AbilityTarget::Random { count, .. } => *count as f64,
        AbilityTarget::Standard { count, .. } => *count as f64,
    }
}

fn condition_discount(conditions: &[Condition]) -> f64 {
    if conditions.is_empty() {
        return 1.0;
    }
    // Each condition reduces expected probability of firing
    0.65_f64.powi(conditions.len() as i32)
}

/// Check if a target refers to an allied unit
fn target_is_ally(target: &AbilityTarget) -> bool {
    match target {
        AbilityTarget::Position {
            scope: TargetScope::SelfUnit,
            index,
        } => *index != 0, // index 0 = self, negative = in front (ally)
        AbilityTarget::All {
            scope: TargetScope::Allies | TargetScope::AlliesOther,
        } => true,
        AbilityTarget::Standard {
            scope: TargetScope::Allies | TargetScope::AlliesOther,
            ..
        } => true,
        AbilityTarget::Random {
            scope: TargetScope::Allies | TargetScope::AlliesOther,
            ..
        } => true,
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Synergy detection
// ---------------------------------------------------------------------------

fn synergy_bonus(projected_board: &[CardId], card_pool: &BTreeMap<CardId, UnitCard>) -> i32 {
    let cards: Vec<&UnitCard> = projected_board
        .iter()
        .filter_map(|id| card_pool.get(id))
        .collect();

    let mut bonus = 0i32;

    // Pairwise synergies
    for i in 0..cards.len() {
        for j in (i + 1)..cards.len() {
            bonus += pair_synergy(cards[i], cards[j], card_pool);
        }
    }

    // Board-wide synergies
    bonus += board_wide_synergy(&cards, card_pool);

    bonus
}

fn pair_synergy(
    a: &UnitCard,
    b: &UnitCard,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> i32 {
    let mut bonus = 0;

    // Pattern 1: Sacrifice combo — one destroys ally, other has OnFaint
    if has_destroy_ally_effect(a) && has_on_faint_ability(b) {
        let faint_value: i32 = b
            .battle_abilities
            .iter()
            .filter(|ab| ab.trigger == AbilityTrigger::OnFaint)
            .map(|ab| {
                let raw = score_effect(&ab.effect, card_pool);
                let scope = scope_multiplier(&ab.effect);
                (raw as f64 * scope) as i32
            })
            .sum();
        bonus += faint_value + 5; // +5 for guaranteed trigger
    }
    if has_destroy_ally_effect(b) && has_on_faint_ability(a) {
        let faint_value: i32 = a
            .battle_abilities
            .iter()
            .filter(|ab| ab.trigger == AbilityTrigger::OnFaint)
            .map(|ab| {
                let raw = score_effect(&ab.effect, card_pool);
                let scope = scope_multiplier(&ab.effect);
                (raw as f64 * scope) as i32
            })
            .sum();
        bonus += faint_value + 5;
    }

    // Pattern 2: Spawn + OnAllySpawn (spawner + spawn reactor)
    let a_spawns = a
        .battle_abilities
        .iter()
        .any(|ab| matches!(ab.effect, AbilityEffect::SpawnUnit { .. }));
    let b_spawns = b
        .battle_abilities
        .iter()
        .any(|ab| matches!(ab.effect, AbilityEffect::SpawnUnit { .. }));
    let a_on_ally_spawn = a
        .battle_abilities
        .iter()
        .any(|ab| ab.trigger == AbilityTrigger::OnAllySpawn);
    let b_on_ally_spawn = b
        .battle_abilities
        .iter()
        .any(|ab| ab.trigger == AbilityTrigger::OnAllySpawn);

    if a_spawns && b_on_ally_spawn {
        let spawn_count = a
            .battle_abilities
            .iter()
            .filter(|ab| matches!(ab.effect, AbilityEffect::SpawnUnit { .. }))
            .count() as i32;
        let spawn_buff: i32 = b
            .battle_abilities
            .iter()
            .filter(|ab| ab.trigger == AbilityTrigger::OnAllySpawn)
            .map(|ab| score_effect(&ab.effect, card_pool))
            .sum();
        bonus += spawn_count * spawn_buff;
    }
    if b_spawns && a_on_ally_spawn {
        let spawn_count = b
            .battle_abilities
            .iter()
            .filter(|ab| matches!(ab.effect, AbilityEffect::SpawnUnit { .. }))
            .count() as i32;
        let spawn_buff: i32 = a
            .battle_abilities
            .iter()
            .filter(|ab| ab.trigger == AbilityTrigger::OnAllySpawn)
            .map(|ab| score_effect(&ab.effect, card_pool))
            .sum();
        bonus += spawn_count * spawn_buff;
    }

    // Pattern 3: OnFaint + OnAllyFaint — one dying triggers the other's ability
    if has_on_faint_ability(a) {
        let ally_faint_value: i32 = b
            .battle_abilities
            .iter()
            .filter(|ab| ab.trigger == AbilityTrigger::OnAllyFaint)
            .map(|ab| {
                let raw = score_effect(&ab.effect, card_pool);
                let scope = scope_multiplier(&ab.effect);
                (raw as f64 * scope) as i32
            })
            .sum();
        bonus += ally_faint_value;
    }
    if has_on_faint_ability(b) {
        let ally_faint_value: i32 = a
            .battle_abilities
            .iter()
            .filter(|ab| ab.trigger == AbilityTrigger::OnAllyFaint)
            .map(|ab| {
                let raw = score_effect(&ab.effect, card_pool);
                let scope = scope_multiplier(&ab.effect);
                (raw as f64 * scope) as i32
            })
            .sum();
        bonus += ally_faint_value;
    }

    bonus
}

fn board_wide_synergy(cards: &[&UnitCard], card_pool: &BTreeMap<CardId, UnitCard>) -> i32 {
    let mut bonus = 0;
    let board_size = cards.len();

    // Pattern: Unit-count conditionals — restore discounted value
    // when the projected board actually meets the condition
    for card in cards {
        for ability in &card.battle_abilities {
            for condition in &ability.conditions {
                if let Condition::Is(Matcher::UnitCount {
                    scope: TargetScope::Allies,
                    op: oab_core::types::CompareOp::GreaterThanOrEqual,
                    value,
                }) = condition
                {
                    if board_size as u32 >= *value {
                        let raw = score_effect(&ability.effect, card_pool);
                        let scope = scope_multiplier(&ability.effect);
                        // Restore the value that condition_discount removed (add back ~0.35)
                        bonus += ((raw as f64 * scope) * 0.35) as i32;
                    }
                }
            }
        }
    }

    // Pattern: Multiple spawners + spawn reactor — compounding value
    let spawn_count: usize = cards
        .iter()
        .flat_map(|c| c.battle_abilities.iter())
        .filter(|a| matches!(a.effect, AbilityEffect::SpawnUnit { .. }))
        .count();
    let has_ally_spawn_reactor = cards.iter().any(|c| {
        c.battle_abilities
            .iter()
            .any(|a| a.trigger == AbilityTrigger::OnAllySpawn)
    });
    if has_ally_spawn_reactor && spawn_count >= 2 {
        bonus += (spawn_count as i32 - 1) * 4;
    }

    bonus
}

fn has_destroy_ally_effect(card: &UnitCard) -> bool {
    card.battle_abilities.iter().any(|a| {
        matches!(
            &a.effect,
            AbilityEffect::Destroy { target } if target_is_ally(target)
        )
    })
}

fn has_on_faint_ability(card: &UnitCard) -> bool {
    card.battle_abilities
        .iter()
        .any(|a| a.trigger == AbilityTrigger::OnFaint)
}

// ---------------------------------------------------------------------------
// Role-based board placement
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum BoardRole {
    SacrificeTarget, // OnFaint units → front (slot 0), die first
    Tank,            // High HP, self-buff on attack/hurt → slots 0-1
    DamageDealer,    // High ATK, OnStart targeted effects → slots 1-2
    SacrificeMaster, // Destroy-ally effect: place behind sacrifice target
    Support,         // Buffs allies, BeforeAnyAttack → slots 3-4
}

fn classify_role(card: &UnitCard) -> BoardRole {
    let has_on_faint = card
        .battle_abilities
        .iter()
        .any(|a| a.trigger == AbilityTrigger::OnFaint);
    let has_destroy_ally = has_destroy_ally_effect(card);
    let has_repeating_support = card.battle_abilities.iter().any(|a| {
        matches!(
            a.trigger,
            AbilityTrigger::BeforeAnyAttack | AbilityTrigger::AfterAnyAttack
        ) && is_ally_buff(&a.effect)
    });
    let has_on_ally_spawn = card
        .battle_abilities
        .iter()
        .any(|a| a.trigger == AbilityTrigger::OnAllySpawn);
    let has_on_ally_faint = card
        .battle_abilities
        .iter()
        .any(|a| a.trigger == AbilityTrigger::OnAllyFaint);
    let has_on_enemy_spawn = card
        .battle_abilities
        .iter()
        .any(|a| a.trigger == AbilityTrigger::OnEnemySpawn);

    if has_destroy_ally {
        BoardRole::SacrificeMaster
    } else if has_on_faint {
        BoardRole::SacrificeTarget
    } else if has_repeating_support || has_on_ally_spawn || has_on_ally_faint || has_on_enemy_spawn
    {
        BoardRole::Support
    } else if card.stats.health >= 6 {
        BoardRole::Tank
    } else if card.stats.attack > card.stats.health {
        BoardRole::DamageDealer
    } else {
        BoardRole::Tank
    }
}

fn is_ally_buff(effect: &AbilityEffect) -> bool {
    match effect {
        AbilityEffect::ModifyStats {
            target,
            health,
            attack,
        }
        | AbilityEffect::ModifyStatsPermanent {
            target,
            health,
            attack,
        } => {
            let targets_allies = matches!(
                target,
                AbilityTarget::All {
                    scope: TargetScope::Allies | TargetScope::AlliesOther
                } | AbilityTarget::Position {
                    scope: TargetScope::SelfUnit | TargetScope::Allies,
                    ..
                }
            );
            targets_allies && (*health > 0 || *attack > 0)
        }
        _ => false,
    }
}

/// Assign played cards to board slots by role.
/// Returns (hand_index, board_slot) pairs.
fn tactician_placement(
    play_indices: &[usize],
    available_slots: &mut Vec<u32>,
    state: &GameState,
) -> Vec<(usize, u32)> {
    if play_indices.is_empty() || available_slots.is_empty() {
        return Vec::new();
    }

    // Classify each card being played
    let mut plays_with_role: Vec<(usize, BoardRole)> = play_indices
        .iter()
        .filter_map(|&hi| {
            let card = state.card_pool.get(&state.hand[hi])?;
            Some((hi, classify_role(card)))
        })
        .collect();

    // Sort by role priority: SacrificeTarget first, Support last
    plays_with_role.sort_by_key(|&(_, role)| role);

    // Sort slots ascending (front to back)
    available_slots.sort();

    let mut slot_used = vec![false; available_slots.len()];
    let mut assignments = Vec::new();

    // Track where we placed the sacrifice target for SacrificeMaster positioning
    let mut sacrifice_slot: Option<u32> = None;

    for &(hi, role) in &plays_with_role {
        let slot_idx = match role {
            BoardRole::SacrificeTarget | BoardRole::Tank => {
                // Take frontmost available
                (0..available_slots.len()).find(|&i| !slot_used[i])
            }
            BoardRole::SacrificeMaster => {
                // Place behind the sacrifice target if one was placed
                if let Some(sac) = sacrifice_slot {
                    (0..available_slots.len())
                        .find(|&i| !slot_used[i] && available_slots[i] > sac)
                        .or_else(|| (0..available_slots.len()).find(|&i| !slot_used[i]))
                } else {
                    // No sacrifice target — place mid-board
                    let mid = available_slots.len() / 2;
                    (mid..available_slots.len())
                        .find(|&i| !slot_used[i])
                        .or_else(|| (0..mid).find(|&i| !slot_used[i]))
                }
            }
            BoardRole::DamageDealer => {
                // Middle slots preferred
                let mid = available_slots.len() / 2;
                (mid..available_slots.len())
                    .chain(0..mid)
                    .find(|&i| !slot_used[i])
            }
            BoardRole::Support => {
                // Take backmost available
                (0..available_slots.len())
                    .rev()
                    .find(|&i| !slot_used[i])
            }
        };

        if let Some(idx) = slot_idx {
            slot_used[idx] = true;
            let slot = available_slots[idx];
            assignments.push((hi, slot));

            if role == BoardRole::SacrificeTarget && sacrifice_slot.is_none() {
                sacrifice_slot = Some(slot);
            }
        }
    }

    assignments
}

/// Generate SwapBoard actions to reposition existing board units by role.
fn compute_swaps(state: &GameState, actions: &[TurnAction]) -> Vec<TurnAction> {
    // Build projected board after current actions
    let mut board: Vec<Option<CardId>> = state
        .board
        .iter()
        .map(|s| s.as_ref().map(|u| u.card_id))
        .collect();

    for action in actions {
        match action {
            TurnAction::BurnFromBoard { board_slot } => {
                board[*board_slot as usize] = None;
            }
            TurnAction::PlayFromHand {
                hand_index,
                board_slot,
            } => {
                board[*board_slot as usize] = Some(state.hand[*hand_index as usize]);
            }
            _ => {}
        }
    }

    // Classify all units on the projected board
    let units: Vec<(usize, CardId, BoardRole)> = board
        .iter()
        .enumerate()
        .filter_map(|(i, s)| {
            let card_id = (*s)?;
            let card = state.card_pool.get(&card_id)?;
            Some((i, card_id, classify_role(card)))
        })
        .collect();

    if units.len() <= 1 {
        return Vec::new();
    }

    // Compute ideal ordering: sort by role, keeping the same occupied slots
    let mut occupied_slots: Vec<usize> = units.iter().map(|&(i, _, _)| i).collect();
    occupied_slots.sort();

    let mut ideal_order = units.clone();
    ideal_order.sort_by(|a, b| a.2.cmp(&b.2).then(a.0.cmp(&b.0)));

    // Generate swaps using a simple selection sort approach
    let mut current: Vec<(usize, CardId)> = units.iter().map(|&(i, cid, _)| (i, cid)).collect();
    let mut swaps = Vec::new();

    for (target_pos, ideal) in ideal_order.iter().enumerate() {
        if target_pos >= occupied_slots.len() {
            break;
        }
        let target_slot = occupied_slots[target_pos];
        let desired_card_id = ideal.1;

        // Find where this card currently sits
        if let Some(cur_idx) = current.iter().position(|&(_, cid)| cid == desired_card_id) {
            let current_slot = current[cur_idx].0;
            if current_slot != target_slot {
                // Find what's currently at the target slot
                if let Some(other_idx) = current.iter().position(|&(s, _)| s == target_slot) {
                    swaps.push(TurnAction::SwapBoard {
                        slot_a: current_slot as u32,
                        slot_b: target_slot as u32,
                    });
                    // Update tracking
                    current[other_idx].0 = current_slot;
                    current[cur_idx].0 = target_slot;
                }
            }
        }
    }

    swaps
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/// Enumerate valid turn plans including board pitching when beneficial.
///
/// Optimization: board pitch combos (2^occupied) are only explored when needed:
///   - Board is full (no empty slots) — must sell to play anything
///   - Hand contains cards too expensive for mana + hand pitches alone
/// Otherwise, only 3^hand_len combos are evaluated (fast path).
pub fn plan_turn(state: &GameState, kind: StrategyKind, rng_seed: u64) -> CommitTurnAction {
    let hand_len = state.hand.len();
    let is_tactician = matches!(kind, StrategyKind::Tactician);

    // Pre-fetch hand card data: (play_cost, burn_value, score)
    let hand_data: Vec<(i32, i32, i32)> = (0..hand_len)
        .map(|i| {
            let card_id = state.hand[i];
            state
                .card_pool
                .get(&card_id)
                .map(|c| {
                    let score = if is_tactician {
                        tactician_card_score(c, &state.card_pool)
                    } else {
                        card_score_from_pool(state, card_id)
                    };
                    (c.economy.play_cost, c.economy.burn_value, score)
                })
                .unwrap_or((0, 0, 0))
        })
        .collect();

    // Occupied board slots: (slot_index, burn_value, unit_score)
    let occupied: Vec<(u32, i32, i32)> = state
        .board
        .iter()
        .enumerate()
        .filter_map(|(i, slot)| {
            let unit = slot.as_ref()?;
            let pitch_val = state
                .card_pool
                .get(&unit.card_id)
                .map(|c| c.economy.burn_value)
                .unwrap_or(0);
            let score = if is_tactician {
                tactician_board_unit_score(unit, &state.card_pool)
            } else {
                board_unit_score(state, unit)
            };
            Some((i as u32, pitch_val, score))
        })
        .collect();

    let empty_count = 5 - occupied.len();
    let occupied_count = occupied.len();

    if hand_len == 0 {
        // Even with empty hand, Tactician should still reorder the board
        if is_tactician {
            let swaps = compute_swaps(state, &[]);
            if !swaps.is_empty() {
                return CommitTurnAction { actions: swaps };
            }
        }
        return CommitTurnAction {
            actions: Vec::new(),
        };
    }

    // Determine if we need to explore board pitches.
    let max_hand_pitch_mana: i32 = hand_data.iter().map(|d| d.1).sum::<i32>();
    let max_mana_without_board = (state.shop_mana + max_hand_pitch_mana).min(state.mana_limit);
    let max_hand_cost = hand_data.iter().map(|d| d.0).max().unwrap_or(0);

    let need_board_pitches = empty_count == 0
        || (occupied_count > 0 && max_hand_cost > max_mana_without_board);

    let board_combos: u32 = if need_board_pitches {
        1u32 << occupied_count
    } else {
        1
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
        let mut board_pitches = vec![false; occupied_count];
        let mut board_pitch_mana = 0i32;
        let mut board_kept_score = 0i32;
        let mut slots_freed = 0usize;

        // Pre-collect kept board card IDs for synergy (Tactician only)
        let mut kept_board_ids: Vec<CardId> = Vec::new();

        for j in 0..occupied_count {
            if (board_combo >> j) & 1 == 1 {
                board_pitches[j] = true;
                board_pitch_mana += occupied[j].1;
                slots_freed += 1;
            } else {
                board_kept_score += occupied[j].2;
                if is_tactician {
                    if let Some(unit) = state.board[occupied[j].0 as usize].as_ref() {
                        kept_board_ids.push(unit.card_id);
                    }
                }
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

            if plays as usize > available_slots {
                continue;
            }

            if slots_freed > 0 && plays == 0 {
                continue;
            }

            let mut mana = (state.shop_mana + board_pitch_mana).min(state.mana_limit);

            for i in 0..hand_len {
                if hand_assignment[i] == 1 {
                    mana = (mana + hand_data[i].1).min(state.mana_limit);
                }
            }

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

            let mut total_score = board_kept_score + play_score;

            // Tactician: add synergy bonus for the projected board
            if is_tactician {
                let mut projected = kept_board_ids.clone();
                for i in 0..hand_len {
                    if hand_assignment[i] == 2 {
                        projected.push(state.hand[i]);
                    }
                }
                total_score += synergy_bonus(&projected, &state.card_pool);
            }

            valid_count += 1;

            let should_pick = match kind {
                StrategyKind::Greedy
                | StrategyKind::Heuristic
                | StrategyKind::Tactician => total_score > best_score,
                StrategyKind::Random => next_rand(&mut rng_state) % valid_count < 1,
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
            actions.push(TurnAction::BurnFromBoard {
                board_slot: occupied[j].0,
            });
        }
    }

    // 2. Hand pitches (gains mana before plays)
    for (i, &a) in hand_assignment.iter().enumerate() {
        if a == 1 {
            actions.push(TurnAction::BurnFromHand {
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
    let play_indices: Vec<usize> = hand_assignment
        .iter()
        .enumerate()
        .filter(|(_, &a)| a == 2)
        .map(|(i, _)| i)
        .collect();

    // 5. Strategy-specific placement
    match kind {
        StrategyKind::Tactician => {
            let assignments = tactician_placement(&play_indices, &mut available_slots, state);
            for (hand_idx, slot) in assignments {
                actions.push(TurnAction::PlayFromHand {
                    hand_index: hand_idx as u32,
                    board_slot: slot,
                });
            }

            // 6. Reorder existing board units by role
            let swap_actions = compute_swaps(state, &actions);
            actions.extend(swap_actions);
        }
        StrategyKind::Heuristic => {
            let mut sorted_plays = play_indices;
            sorted_plays.sort_by(|&a, &b| {
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

            for (slot_idx, &hand_idx) in sorted_plays.iter().enumerate() {
                if slot_idx < available_slots.len() {
                    actions.push(TurnAction::PlayFromHand {
                        hand_index: hand_idx as u32,
                        board_slot: available_slots[slot_idx],
                    });
                }
            }
        }
        _ => {
            // Greedy / Random: sequential assignment
            for (slot_idx, &hand_idx) in play_indices.iter().enumerate() {
                if slot_idx < available_slots.len() {
                    actions.push(TurnAction::PlayFromHand {
                        hand_index: hand_idx as u32,
                        board_slot: available_slots[slot_idx],
                    });
                }
            }
        }
    }

    CommitTurnAction { actions }
}
