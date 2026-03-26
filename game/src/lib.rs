//! Open Auto Battler Game Modes
//!
//! Game-mode rules, session management, and validation built on top of
//! the oab-battle engine. This crate is no_std compatible for use in blockchain pallets.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod constructed;
pub mod opponents;
pub mod sealed;
pub mod state;
pub mod view;

// Re-export key types for convenience
pub use state::{
    derive_hand_indices_logic, GamePhase, GameSession, GameState, LocalGameState, HAND_SIZE,
    STARTING_BAG_SIZE,
};
pub use view::*;

/// Configuration for a game mode.
///
/// Controls mana progression, lives, win conditions, and other per-mode rules.
/// The battle engine validates turns against whatever values are in ShopState;
/// this config determines what those values are set to.
#[derive(Debug, Clone)]
pub struct GameConfig {
    /// Starting lives for the player.
    pub starting_lives: i32,
    /// Wins needed for victory.
    pub wins_to_victory: i32,
    /// Mana limit at round 1.
    pub starting_mana_limit: i32,
    /// Maximum mana limit (cap for progression).
    pub max_mana_limit: i32,
    /// If true, shop_mana is set to mana_limit at the start of each round
    /// (players don't need to burn cards for mana).
    pub full_mana_each_round: bool,
    /// Number of board slots.
    pub board_size: usize,
    /// Number of cards drawn per round as the player's hand.
    pub hand_size: usize,
    /// Number of cards in the starting bag/deck.
    pub bag_size: usize,
}

impl GameConfig {
    /// Calculate the mana limit for a given round.
    pub fn mana_limit_for_round(&self, round: i32) -> i32 {
        (self.starting_mana_limit + round - 1).min(self.max_mana_limit)
    }
}

#[cfg(feature = "bounded")]
pub mod bounded;

#[cfg(test)]
mod tests;
