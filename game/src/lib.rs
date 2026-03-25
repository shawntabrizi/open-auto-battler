//! Open Auto Battler Game Modes
//!
//! Game-mode rules and validation built on top of oab-core engine primitives.
//! This crate is no_std compatible for use in blockchain pallets.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod constructed;
pub mod sealed;

/// Configuration for a game mode.
///
/// Controls mana progression, lives, win conditions, and other per-mode rules.
/// The core engine validates turns against whatever values are in GameState;
/// this config determines what those values are.
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
}

impl GameConfig {
    /// Calculate the mana limit for a given round.
    pub fn mana_limit_for_round(&self, round: i32) -> i32 {
        (self.starting_mana_limit + round - 1).min(self.max_mana_limit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_mana_limit_progression() {
        let config = sealed::default_config();
        assert_eq!(config.mana_limit_for_round(1), 3);
        assert_eq!(config.mana_limit_for_round(5), 7);
        assert_eq!(config.mana_limit_for_round(8), 10);
        assert_eq!(config.mana_limit_for_round(20), 10, "caps at max");
    }

    #[test]
    fn custom_config_mana_limit() {
        let config = GameConfig {
            starting_lives: 3,
            wins_to_victory: 10,
            starting_mana_limit: 5,
            max_mana_limit: 15,
            full_mana_each_round: true,
        };
        assert_eq!(config.mana_limit_for_round(1), 5);
        assert_eq!(config.mana_limit_for_round(6), 10);
        assert_eq!(config.mana_limit_for_round(11), 15);
        assert_eq!(config.mana_limit_for_round(20), 15);
    }
}
