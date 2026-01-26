//! Game state management
//!
//! This module defines the game state and phase tracking.

use alloc::vec;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, Encode};
use scale_info::TypeInfo;

use crate::rng::{BattleRng, XorShiftRng};
use crate::types::*;

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

/// Number of cards drawn per round as the player's hand
pub const HAND_SIZE: usize = 7;
/// Number of board slots
pub const BOARD_SIZE: usize = 5;
/// Starting lives
pub const STARTING_LIVES: i32 = 3;
/// Starting mana limit
pub const STARTING_MANA_LIMIT: i32 = 3;
/// Maximum mana limit
pub const MAX_MANA_LIMIT: i32 = 10;
/// Wins needed for victory
pub const WINS_TO_VICTORY: i32 = 10;

/// Current phase of the game
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "camelCase"))]
pub enum GamePhase {
    Shop,
    Battle,
    Victory,
    Defeat,
}

/// The complete game state
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "camelCase"))]
pub struct GameState {
    /// Cards remaining in the bag (unordered pool)
    pub bag: Vec<UnitCard>,
    /// Units on the player's board (5 slots, index 0 is front)
    pub board: Vec<Option<BoardUnit>>,
    /// Maximum mana that can be held (increases each round)
    pub mana_limit: i32,
    /// Current round number (1-indexed)
    pub round: i32,
    /// Lives remaining
    pub lives: i32,
    /// Wins accumulated
    pub wins: i32,
    /// Current game phase
    pub phase: GamePhase,
    /// Counter for generating unique card IDs
    pub next_card_id: CardId,
    /// Seed for deterministic hand derivation
    pub game_seed: u64,
}

impl GameState {
    pub fn new(game_seed: u64) -> Self {
        Self {
            bag: Vec::new(),
            board: vec![None; BOARD_SIZE],
            mana_limit: STARTING_MANA_LIMIT,
            round: 1,
            lives: STARTING_LIVES,
            wins: 0,
            phase: GamePhase::Shop,
            next_card_id: 1,
            game_seed,
        }
    }

    /// Generate a unique card ID
    pub fn generate_card_id(&mut self) -> CardId {
        let id = self.next_card_id;
        self.next_card_id += 1;
        id
    }

    /// Calculate mana limit for the current round
    pub fn calculate_mana_limit(&self) -> i32 {
        (STARTING_MANA_LIMIT + self.round - 1).min(MAX_MANA_LIMIT)
    }

    /// Derive hand indices from bag using deterministic RNG
    /// Uses game_seed XOR round to produce repeatable hand selection
    pub fn derive_hand_indices(&self) -> Vec<usize> {
        let bag_len = self.bag.len();
        if bag_len == 0 {
            return Vec::new();
        }

        let hand_count = HAND_SIZE.min(bag_len);
        let seed = self.game_seed ^ (self.round as u64);
        let mut rng = XorShiftRng::seed_from_u64(seed);

        // Partial Fisher-Yates: select hand_count unique indices
        let mut indices: Vec<usize> = (0..bag_len).collect();
        for i in 0..hand_count {
            let j = i + rng.gen_range(bag_len - i);
            indices.swap(i, j);
        }

        indices.truncate(hand_count);
        indices
    }

    /// Derive the hand as (bag_index, card_ref) pairs
    pub fn derive_hand(&self) -> Vec<(usize, &UnitCard)> {
        self.derive_hand_indices()
            .into_iter()
            .map(|idx| (idx, &self.bag[idx]))
            .collect()
    }

    /// Find an empty board slot
    pub fn find_empty_board_slot(&self) -> Option<usize> {
        self.board.iter().position(|slot| slot.is_none())
    }

    /// Count units on the board
    pub fn board_unit_count(&self) -> usize {
        self.board.iter().filter(|slot| slot.is_some()).count()
    }
}

impl Default for GameState {
    fn default() -> Self {
        Self::new(42)
    }
}
