//! Manalimit Core - Auto-battler game engine
//!
//! This crate provides the core game logic for the Manalimit auto-battler.
//! It is designed to be no_std compatible for Substrate SDK pallet integration.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod battle;
pub mod commit;
pub mod error;
pub mod limits;
pub mod log;
pub mod opponents;
pub mod rng;
pub mod state;
pub mod types;
pub mod units;
pub mod view;

#[cfg(test)]
mod tests;

#[cfg(feature = "bounded")]
pub mod bounded;

// Core exports
pub use battle::{
    resolve_battle, BattlePhase, BattleResult, CombatEvent, CombatUnit, UnitId, UnitView,
};
pub use commit::verify_and_apply_turn;
pub use error::{GameError, GameResult};
pub use limits::{BattleLimits, LimitReason, Team};
pub use opponents::{
    generate_genesis_ghosts, get_opponent_for_round, GenesisMatchmakingBracket, GhostBoard,
    GhostBoardUnitSimple,
};
pub use rng::{BattleRng, XorShiftRng};
pub use state::*;
pub use types::*;
pub use units::{create_genesis_bag, get_starter_templates};
pub use view::*;
