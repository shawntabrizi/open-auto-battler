//! Turn commitment and verification
//!
//! This module provides the core verification logic for committed turns.
//! Both the browser engine and the on-chain pallet use `verify_and_apply_turn`
//! to validate that a player's turn is legal.

use alloc::vec;
use alloc::vec::Vec;

use crate::error::{GameError, GameResult};
use crate::rng::{BattleRng, XorShiftRng};
use crate::state::{GameState, BOARD_SIZE};
use crate::types::{
    CardId, CommitTurnAction, CompareOp, ShopAbility, ShopCondition, ShopEffect, ShopMatcher,
    ShopScope, ShopTarget, ShopTrigger, StatType, TurnAction,
};

const SHOP_START_SALT: u64 = 0x5348_4f50_0000_0001;
const SHOP_BUY_SALT: u64 = 0x5348_4f50_0000_0002;
const SHOP_SELL_SALT: u64 = 0x5348_4f50_0000_0003;

#[derive(Clone)]
struct ShopPendingAbility {
    source_slot: Option<usize>,
    source_on_board: bool,
    ability: ShopAbility,
}

/// Apply `OnShopStart` triggers for all units currently on the board.
///
/// This should be called exactly once when entering a new shop phase.
pub fn apply_shop_start_triggers(state: &mut GameState) {
    state.shop_mana = state.shop_mana.clamp(0, state.mana_limit);
    let mut rng = shop_rng(state, SHOP_START_SALT);
    execute_shop_trigger(state, ShopTrigger::OnShopStart, None, None, &mut rng);
    state.shop_mana = state.shop_mana.clamp(0, state.mana_limit);
}

/// Apply `OnBuy` triggers for a successful shop buy action.
pub fn apply_on_buy_triggers(state: &mut GameState, action_index: usize, bought_slot: usize) {
    if bought_slot >= BOARD_SIZE {
        return;
    }

    let mut rng = shop_rng(state, SHOP_BUY_SALT.wrapping_add(action_index as u64));
    execute_shop_trigger(state, ShopTrigger::OnBuy, Some(bought_slot), None, &mut rng);
}

/// Apply `OnSell` triggers for a successful shop sell action.
pub fn apply_on_sell_triggers(
    state: &mut GameState,
    action_index: usize,
    sold_card_id: CardId,
    sold_slot: usize,
) {
    if sold_slot >= BOARD_SIZE {
        return;
    }

    let mut rng = shop_rng(state, SHOP_SELL_SALT.wrapping_add(action_index as u64));
    execute_shop_trigger(
        state,
        ShopTrigger::OnSell,
        None,
        Some((sold_card_id, sold_slot)),
        &mut rng,
    );
}

/// Verify and apply a committed turn action to the game state.
///
/// This function executes actions sequentially in order:
/// 1. Validates each action as it's processed
/// 2. Tracks mana changes (earned from pitches, spent on plays)
/// 3. Ensures mana never goes negative and respects mana_limit
/// 4. Updates board state as actions are applied
/// 5. Removes used hand cards at the end
pub fn verify_and_apply_turn(state: &mut GameState, action: &CommitTurnAction) -> GameResult<()> {
    let hand_size = state.hand.len();

    // Track mana and used cards
    let mut current_mana: i32 = state.shop_mana.clamp(0, state.mana_limit);
    let mut hand_used = vec![false; hand_size];

    // Process each action in order
    for (action_index, turn_action) in action.actions.iter().enumerate() {
        match turn_action {
            TurnAction::PitchFromHand { hand_index } => {
                let hi = *hand_index as usize;

                // Validate index
                if hi >= hand_size {
                    return Err(GameError::InvalidHandIndex { index: *hand_index });
                }

                // Check not already used
                if hand_used[hi] {
                    return Err(GameError::CardAlreadyUsed { index: *hand_index });
                }

                // Get pitch value and add mana (capped at mana_limit)
                let card_id = state.hand[hi];
                let pitch_value = state
                    .card_pool
                    .get(&card_id)
                    .map(|c| c.economy.pitch_value)
                    .unwrap_or(0);

                current_mana = (current_mana + pitch_value).min(state.mana_limit);
                hand_used[hi] = true;
            }

            TurnAction::PlayFromHand {
                hand_index,
                board_slot,
            } => {
                let hi = *hand_index as usize;
                let bs = *board_slot as usize;

                // Validate hand index
                if hi >= hand_size {
                    return Err(GameError::InvalidHandIndex { index: *hand_index });
                }

                // Check hand card not already used
                if hand_used[hi] {
                    return Err(GameError::CardAlreadyUsed { index: *hand_index });
                }

                // Validate board slot
                if bs >= BOARD_SIZE {
                    return Err(GameError::InvalidBoardSlot { index: *board_slot });
                }

                // Check slot is empty
                if state.board[bs].is_some() {
                    return Err(GameError::BoardSlotOccupied { index: *board_slot });
                }

                // Get card info
                let card_id = state.hand[hi];
                let play_cost = state
                    .card_pool
                    .get(&card_id)
                    .map(|c| c.economy.play_cost)
                    .unwrap_or(0);

                // Check we have enough mana
                if current_mana < play_cost {
                    return Err(GameError::NotEnoughMana {
                        have: current_mana,
                        need: play_cost,
                    });
                }

                // Deduct mana and place unit
                current_mana -= play_cost;
                hand_used[hi] = true;
                state.board[bs] = Some(crate::types::BoardUnit::new(card_id));

                state.shop_mana = current_mana;
                apply_on_buy_triggers(state, action_index, bs);
                current_mana = state.shop_mana;
            }

            TurnAction::PitchFromBoard { board_slot } => {
                let bs = *board_slot as usize;

                // Validate board slot
                if bs >= BOARD_SIZE {
                    return Err(GameError::InvalidBoardPitch { index: *board_slot });
                }

                // Check slot has a unit
                let sold_unit = state.board[bs]
                    .take()
                    .ok_or(GameError::InvalidBoardPitch { index: *board_slot })?;

                // Get pitch value and add mana (capped at mana_limit)
                let pitch_value = state
                    .card_pool
                    .get(&sold_unit.card_id)
                    .map(|c| c.economy.pitch_value)
                    .unwrap_or(0);

                current_mana = (current_mana + pitch_value).min(state.mana_limit);

                state.shop_mana = current_mana;
                apply_on_sell_triggers(state, action_index, sold_unit.card_id, bs);
                current_mana = state.shop_mana;
            }

            TurnAction::SwapBoard { slot_a, slot_b } => {
                let sa = *slot_a as usize;
                let sb = *slot_b as usize;

                // Validate both slots
                if sa >= BOARD_SIZE {
                    return Err(GameError::InvalidBoardSlot { index: *slot_a });
                }
                if sb >= BOARD_SIZE {
                    return Err(GameError::InvalidBoardSlot { index: *slot_b });
                }

                // Swap positions
                state.board.swap(sa, sb);
            }
        }
    }

    // Remove used hand cards (sort descending to preserve indices)
    let mut hand_indices_to_remove: Vec<usize> = hand_used
        .iter()
        .enumerate()
        .filter(|(_, &used)| used)
        .map(|(i, _)| i)
        .collect();

    hand_indices_to_remove.sort_unstable_by(|a, b| b.cmp(a));

    for idx in hand_indices_to_remove {
        state.hand.remove(idx);
    }

    state.shop_mana = current_mana;

    Ok(())
}

fn shop_rng(state: &GameState, salt: u64) -> XorShiftRng {
    let round_mix = (state.round.max(0) as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15);
    XorShiftRng::seed_from_u64(state.game_seed ^ round_mix ^ salt)
}

fn execute_shop_trigger<R: BattleRng>(
    state: &mut GameState,
    trigger: ShopTrigger,
    trigger_source_slot: Option<usize>,
    sold_source: Option<(CardId, usize)>,
    rng: &mut R,
) {
    let mut pending = Vec::new();

    for (slot, board_unit) in state.board.iter().enumerate() {
        let Some(board_unit) = board_unit else {
            continue;
        };

        let Some(card) = state.card_pool.get(&board_unit.card_id) else {
            continue;
        };

        for ability in &card.shop_abilities {
            if ability.trigger == trigger {
                pending.push(ShopPendingAbility {
                    source_slot: Some(slot),
                    source_on_board: true,
                    ability: ability.clone(),
                });
            }
        }
    }

    if let Some((sold_card_id, sold_slot)) = sold_source {
        if let Some(card) = state.card_pool.get(&sold_card_id) {
            for ability in &card.shop_abilities {
                if ability.trigger == trigger {
                    pending.push(ShopPendingAbility {
                        source_slot: Some(sold_slot),
                        source_on_board: false,
                        ability: ability.clone(),
                    });
                }
            }
        }
    }

    for pending_ability in pending {
        if !shop_conditions_pass(
            state,
            &pending_ability.ability.conditions,
            pending_ability.source_slot,
            pending_ability.source_on_board,
            trigger_source_slot,
        ) {
            continue;
        }

        apply_shop_effect(
            state,
            &pending_ability.ability.effect,
            pending_ability.source_slot,
            pending_ability.source_on_board,
            trigger_source_slot,
            rng,
        );
    }
}

fn apply_shop_effect<R: BattleRng>(
    state: &mut GameState,
    effect: &ShopEffect,
    source_slot: Option<usize>,
    source_on_board: bool,
    trigger_source_slot: Option<usize>,
    rng: &mut R,
) {
    match effect {
        ShopEffect::ModifyStatsPermanent {
            health,
            attack,
            target,
        } => {
            let targets = resolve_shop_targets(
                state,
                target,
                source_slot,
                source_on_board,
                trigger_source_slot,
                rng,
            );
            for slot in targets {
                if let Some(unit) = state.board.get_mut(slot).and_then(|s| s.as_mut()) {
                    unit.perm_health = unit.perm_health.saturating_add(*health);
                    unit.perm_attack = unit.perm_attack.saturating_add(*attack);
                }
            }
            cleanup_dead_units(state);
        }
        ShopEffect::SpawnUnit { card_id } => {
            let Some(_spawn_card) = state.card_pool.get(card_id) else {
                return;
            };
            let Some(empty_slot) = state.board.iter().position(|s| s.is_none()) else {
                return;
            };

            state.board[empty_slot] = Some(crate::types::BoardUnit::new(*card_id));
        }
        ShopEffect::Destroy { target } => {
            let targets = resolve_shop_targets(
                state,
                target,
                source_slot,
                source_on_board,
                trigger_source_slot,
                rng,
            );
            for slot in targets {
                state.board[slot] = None;
            }
        }
        ShopEffect::GainMana { amount } => {
            state.shop_mana = state
                .shop_mana
                .saturating_add(*amount)
                .clamp(0, state.mana_limit);
        }
    }
}

fn resolve_shop_targets<R: BattleRng>(
    state: &GameState,
    target: &ShopTarget,
    source_slot: Option<usize>,
    source_on_board: bool,
    trigger_source_slot: Option<usize>,
    rng: &mut R,
) -> Vec<usize> {
    match target {
        ShopTarget::Position { scope, index } => {
            if *scope == ShopScope::SelfUnit {
                resolve_self_position_target(state, source_slot, source_on_board, *index)
            } else {
                resolve_absolute_position_target(
                    state,
                    *scope,
                    source_slot,
                    source_on_board,
                    trigger_source_slot,
                    *index,
                )
            }
        }
        ShopTarget::Random { scope, count } => {
            let mut candidates = resolve_scope_slots(
                state,
                *scope,
                source_slot,
                source_on_board,
                trigger_source_slot,
            );
            if candidates.is_empty() {
                return Vec::new();
            }

            rng.shuffle(&mut candidates);
            candidates.truncate((*count as usize).min(candidates.len()));
            candidates
        }
        ShopTarget::Standard {
            scope,
            stat,
            order,
            count,
        } => {
            let mut candidates = resolve_scope_slots(
                state,
                *scope,
                source_slot,
                source_on_board,
                trigger_source_slot,
            );
            candidates.sort_by(|a, b| {
                let a_val = shop_stat_value(state, *a, *stat).unwrap_or(0);
                let b_val = shop_stat_value(state, *b, *stat).unwrap_or(0);
                let cmp = match order {
                    crate::types::SortOrder::Ascending => a_val.cmp(&b_val),
                    crate::types::SortOrder::Descending => b_val.cmp(&a_val),
                };
                if cmp == core::cmp::Ordering::Equal {
                    a.cmp(b)
                } else {
                    cmp
                }
            });
            candidates.truncate((*count as usize).min(candidates.len()));
            candidates
        }
        ShopTarget::All { scope } => resolve_scope_slots(
            state,
            *scope,
            source_slot,
            source_on_board,
            trigger_source_slot,
        ),
    }
}

fn resolve_self_position_target(
    state: &GameState,
    source_slot: Option<usize>,
    source_on_board: bool,
    index: i32,
) -> Vec<usize> {
    let Some(source_slot) = source_slot else {
        return Vec::new();
    };

    let candidate = if index == 0 {
        if source_on_board {
            Some(source_slot)
        } else {
            None
        }
    } else {
        let offset = source_slot as i32 + index;
        if offset < 0 {
            None
        } else {
            Some(offset as usize)
        }
    };

    let Some(slot) = candidate else {
        return Vec::new();
    };

    if slot >= BOARD_SIZE {
        return Vec::new();
    }

    if state.board[slot].is_some() {
        vec![slot]
    } else {
        Vec::new()
    }
}

fn resolve_absolute_position_target(
    state: &GameState,
    scope: ShopScope,
    source_slot: Option<usize>,
    source_on_board: bool,
    trigger_source_slot: Option<usize>,
    index: i32,
) -> Vec<usize> {
    let candidates = resolve_scope_slots(
        state,
        scope,
        source_slot,
        source_on_board,
        trigger_source_slot,
    );
    if candidates.is_empty() {
        return Vec::new();
    }

    if index == -1 {
        return candidates
            .last()
            .copied()
            .map(|s| vec![s])
            .unwrap_or_default();
    }

    let idx = index as usize;
    if idx >= BOARD_SIZE {
        return Vec::new();
    }

    if candidates.contains(&idx) {
        vec![idx]
    } else {
        Vec::new()
    }
}

fn resolve_scope_slots(
    state: &GameState,
    scope: ShopScope,
    source_slot: Option<usize>,
    source_on_board: bool,
    trigger_source_slot: Option<usize>,
) -> Vec<usize> {
    let occupied: Vec<usize> = state
        .board
        .iter()
        .enumerate()
        .filter_map(|(i, slot)| slot.as_ref().map(|_| i))
        .collect();

    match scope {
        ShopScope::SelfUnit => {
            if source_on_board {
                source_slot
                    .filter(|idx| state.board[*idx].is_some())
                    .map(|idx| vec![idx])
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        }
        ShopScope::Allies => occupied,
        ShopScope::All => occupied,
        ShopScope::AlliesOther => {
            if source_on_board {
                occupied
                    .into_iter()
                    .filter(|idx| Some(*idx) != source_slot)
                    .collect()
            } else {
                occupied
            }
        }
        ShopScope::TriggerSource => trigger_source_slot
            .filter(|idx| state.board[*idx].is_some())
            .map(|idx| vec![idx])
            .unwrap_or_default(),
    }
}

fn shop_conditions_pass(
    state: &GameState,
    conditions: &[ShopCondition],
    source_slot: Option<usize>,
    source_on_board: bool,
    trigger_source_slot: Option<usize>,
) -> bool {
    for condition in conditions {
        match condition {
            ShopCondition::Is(matcher) => {
                if !shop_matcher_pass(
                    state,
                    matcher,
                    source_slot,
                    source_on_board,
                    trigger_source_slot,
                ) {
                    return false;
                }
            }
            ShopCondition::AnyOf(matchers) => {
                if !matchers.iter().any(|matcher| {
                    shop_matcher_pass(
                        state,
                        matcher,
                        source_slot,
                        source_on_board,
                        trigger_source_slot,
                    )
                }) {
                    return false;
                }
            }
        }
    }
    true
}

fn shop_matcher_pass(
    state: &GameState,
    matcher: &ShopMatcher,
    source_slot: Option<usize>,
    source_on_board: bool,
    trigger_source_slot: Option<usize>,
) -> bool {
    match matcher {
        ShopMatcher::UnitCount { scope, op, value } => {
            let count = resolve_scope_slots(
                state,
                *scope,
                source_slot,
                source_on_board,
                trigger_source_slot,
            )
            .len() as u32;
            compare_u32(count, *op, *value)
        }
        ShopMatcher::StatValueCompare {
            scope,
            stat,
            op,
            value,
        } => {
            let targets = resolve_scope_slots(
                state,
                *scope,
                source_slot,
                source_on_board,
                trigger_source_slot,
            );
            if targets.is_empty() {
                return false;
            }

            targets.iter().any(|slot| {
                shop_stat_value(state, *slot, *stat)
                    .map(|actual| compare_i32(actual, *op, *value))
                    .unwrap_or(false)
            })
        }
        ShopMatcher::IsPosition { scope, index } => {
            let targets = resolve_scope_slots(
                state,
                *scope,
                source_slot,
                source_on_board,
                trigger_source_slot,
            );
            if targets.is_empty() {
                return false;
            }

            let desired = if *index == -1 {
                targets.last().copied()
            } else if *index >= 0 {
                Some(*index as usize)
            } else {
                None
            };

            desired.map(|idx| targets.contains(&idx)).unwrap_or(false)
        }
    }
}

fn shop_stat_value(state: &GameState, slot: usize, stat: StatType) -> Option<i32> {
    let unit = state.board.get(slot)?.as_ref()?;
    let card = state.card_pool.get(&unit.card_id)?;

    match stat {
        StatType::Health => Some(card.stats.health.saturating_add(unit.perm_health)),
        StatType::Attack => Some(card.stats.attack.saturating_add(unit.perm_attack)),
        StatType::Mana => Some(card.economy.play_cost),
    }
}

fn cleanup_dead_units(state: &mut GameState) {
    for idx in 0..state.board.len() {
        let should_remove = state.board[idx]
            .as_ref()
            .and_then(|unit| state.card_pool.get(&unit.card_id).map(|card| (unit, card)))
            .map(|(unit, card)| card.stats.health.saturating_add(unit.perm_health) <= 0)
            .unwrap_or(false);
        if should_remove {
            state.board[idx] = None;
        };
    }
}

fn compare_i32(actual: i32, op: CompareOp, expected: i32) -> bool {
    match op {
        CompareOp::GreaterThan => actual > expected,
        CompareOp::LessThan => actual < expected,
        CompareOp::Equal => actual == expected,
        CompareOp::GreaterThanOrEqual => actual >= expected,
        CompareOp::LessThanOrEqual => actual <= expected,
    }
}

fn compare_u32(actual: u32, op: CompareOp, expected: u32) -> bool {
    match op {
        CompareOp::GreaterThan => actual > expected,
        CompareOp::LessThan => actual < expected,
        CompareOp::Equal => actual == expected,
        CompareOp::GreaterThanOrEqual => actual >= expected,
        CompareOp::LessThanOrEqual => actual <= expected,
    }
}
