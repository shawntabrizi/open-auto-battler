//! Turn commitment and verification
//!
//! This module provides the core verification logic for committed turns.
//! Both the browser engine and the on-chain pallet use `verify_and_apply_turn`
//! to validate that a player's turn is legal.

use alloc::vec;
use alloc::vec::Vec;

use crate::error::{GameError, GameResult};
use crate::state::{GameState, BOARD_SIZE};
use crate::types::CommitTurnAction;

/// Verify and apply a committed turn action to the game state.
///
/// This function:
/// 1. Re-derives the hand from (game_seed, round) -- fully deterministic
/// 2. Validates all indices (no out-of-bounds, no double-use)
/// 3. Mana check: pitched values >= played costs, capped by mana_limit
/// 4. Board check: every unit in new_board came from old board or played hand cards
/// 5. Apply: update board, remove played+pitched cards from bag
pub fn verify_and_apply_turn(state: &mut GameState, action: &CommitTurnAction) -> GameResult<()> {
    // 1. Re-derive hand
    let hand_indices = state.derive_hand_indices();
    let hand_size = hand_indices.len();

    // 2. Validate new_board size
    if action.new_board.len() != BOARD_SIZE {
        return Err(GameError::WrongBoardSize);
    }

    // Track which hand indices have been used (pitched or played)
    let mut hand_used = vec![false; hand_size];

    // Validate pitched_from_hand indices
    for &hi_u32 in &action.pitched_from_hand {
        let hi = hi_u32 as usize;
        if hi >= hand_size {
            return Err(GameError::InvalidHandIndex { index: hi_u32 });
        }
        if hand_used[hi] {
            return Err(GameError::CardAlreadyUsed { index: hi_u32 });
        }
        hand_used[hi] = true;
    }

    // Validate played_from_hand indices
    for &hi_u32 in &action.played_from_hand {
        let hi = hi_u32 as usize;
        if hi >= hand_size {
            return Err(GameError::InvalidHandIndex { index: hi_u32 });
        }
        if hand_used[hi] {
            return Err(GameError::CardAlreadyUsed { index: hi_u32 });
        }
        hand_used[hi] = true;
    }

    // Validate pitched_from_board indices
    for &bi_u32 in &action.pitched_from_board {
        let bi = bi_u32 as usize;
        if bi >= BOARD_SIZE {
            return Err(GameError::InvalidBoardPitch { index: bi_u32 });
        }
        if state.board[bi].is_none() {
            return Err(GameError::InvalidBoardPitch { index: bi_u32 });
        }
    }

    let total_mana_earned_unfiltered: i32 = action
        .pitched_from_hand
        .iter()
        .map(|&hi_u32| {
            let bag_idx = hand_indices[hi_u32 as usize];
            state.bag[bag_idx].economy.pitch_value
        })
        .sum::<i32>()
        + action
            .pitched_from_board
            .iter()
            .map(|&bi_u32| {
                state.board[bi_u32 as usize]
                    .as_ref()
                    .map(|u| u.card.economy.pitch_value)
                    .unwrap_or(0)
            })
            .sum::<i32>();

    let total_play_cost: i32 = action
        .played_from_hand
        .iter()
        .map(|&hi_u32| {
            let bag_idx = hand_indices[hi_u32 as usize];
            let cost = state.bag[bag_idx].economy.play_cost;
            cost
        })
        .sum();

    // Verification:
    // 1. Total spent cannot exceed total earned (from all pitches)
    if total_mana_earned_unfiltered < total_play_cost {
        return Err(GameError::NotEnoughMana {
            have: total_mana_earned_unfiltered,
            need: total_play_cost,
        });
    }

    // 2. Each individual card must be affordable (cost <= mana_limit)
    // This matches the engine's incremental logic where you can never hold more than the limit.
    for &hi_u32 in &action.played_from_hand {
        let bag_idx = hand_indices[hi_u32 as usize];
        let cost = state.bag[bag_idx].economy.play_cost;
        if cost > state.mana_limit {
            return Err(GameError::NotEnoughMana {
                have: state.mana_limit,
                need: cost,
            });
        }
    }

    // 4. Board check: every unit in new_board must come from either:
    //    - The old board (not pitched), matched by CardId
    //    - A played hand card, matched by CardId
    let pitched_board_set: Vec<usize> = action
        .pitched_from_board
        .iter()
        .map(|&b| b as usize)
        .collect();

    let mut available_from_board: Vec<Option<u32>> = state
        .board
        .iter()
        .enumerate()
        .map(|(i, slot)| {
            if pitched_board_set.contains(&i) {
                None // pitched, not available
            } else {
                slot.as_ref().map(|u| u.card.id)
            }
        })
        .collect();

    let mut available_from_hand: Vec<Option<u32>> = action
        .played_from_hand
        .iter()
        .map(|&hi_u32| {
            let bag_idx = hand_indices[hi_u32 as usize];
            Some(state.bag[bag_idx].id)
        })
        .collect();

    for slot in &action.new_board {
        if let Some(unit) = slot {
            let card_id = unit.card.id;

            // Try to find in old board first
            let found_board = available_from_board
                .iter_mut()
                .find(|x| **x == Some(card_id));
            if let Some(found) = found_board {
                *found = None; // consumed
                continue;
            }

            // Try to find in played hand cards
            let found_hand = available_from_hand
                .iter_mut()
                .find(|x| **x == Some(card_id));
            if let Some(found) = found_hand {
                *found = None; // consumed
                continue;
            }

            return Err(GameError::BoardMismatch);
        }
    }

    // 5. Apply: remove played and pitched cards from bag (unused hand cards stay)
    let mut bag_indices_to_remove: Vec<usize> = Vec::new();

    for &hi_u32 in &action.pitched_from_hand {
        bag_indices_to_remove.push(hand_indices[hi_u32 as usize]);
    }
    for &hi_u32 in &action.played_from_hand {
        bag_indices_to_remove.push(hand_indices[hi_u32 as usize]);
    }

    // Sort descending so we can remove from back to front without index shifting
    bag_indices_to_remove.sort_unstable();
    bag_indices_to_remove.dedup();
    bag_indices_to_remove.reverse();

    for idx in bag_indices_to_remove {
        state.bag.swap_remove(idx);
    }

    // Apply board state
    state.board = action.new_board.clone();

    Ok(())
}
