//! Turn commitment and verification
//!
//! This module provides the core verification logic for committed turns.
//! Both the browser engine and the on-chain pallet use `verify_and_apply_turn`
//! to validate that a player's turn is legal.

use alloc::vec;
use alloc::vec::Vec;

use crate::error::{GameError, GameResult};
use crate::state::{GameState, BOARD_SIZE};
use crate::types::{CommitTurnAction, TurnAction};

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
    let mut current_mana: i32 = 0;
    let mut hand_used = vec![false; hand_size];

    // Process each action in order
    for turn_action in &action.actions {
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
                let (play_cost, health) = state
                    .card_pool
                    .get(&card_id)
                    .map(|c| (c.economy.play_cost, c.stats.health))
                    .unwrap_or((0, 0));

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
                state.board[bs] = Some(crate::types::BoardUnit::new(card_id, health));
            }

            TurnAction::PitchFromBoard { board_slot } => {
                let bs = *board_slot as usize;

                // Validate board slot
                if bs >= BOARD_SIZE {
                    return Err(GameError::InvalidBoardPitch { index: *board_slot });
                }

                // Check slot has a unit
                let unit = state.board[bs]
                    .take()
                    .ok_or(GameError::InvalidBoardPitch { index: *board_slot })?;

                // Get pitch value and add mana (capped at mana_limit)
                let pitch_value = state
                    .card_pool
                    .get(&unit.card_id)
                    .map(|c| c.economy.pitch_value)
                    .unwrap_or(0);

                current_mana = (current_mana + pitch_value).min(state.mana_limit);
                // Unit is already removed by .take()
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

    Ok(())
}
