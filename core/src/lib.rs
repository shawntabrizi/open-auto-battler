//! Manalimit Core - Auto-battler game engine
//!
//! This crate provides the core game logic for the Manalimit auto-battler.
//! It is designed to be no_std compatible for Substrate SDK pallet integration
//! while maintaining browser WASM functionality via feature flags.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

#[cfg(feature = "browser")]
use wasm_bindgen::prelude::*;

mod battle;
mod commit;
mod error;
mod limits;
mod log;
mod opponents;
mod rng;
mod state;
mod types;
mod units;
mod view;

#[cfg(feature = "browser")]
mod engine;
#[cfg(feature = "browser")]
mod sandbox;

#[cfg(test)]
mod tests;

// Core exports (always available)
pub use battle::{resolve_battle, BattlePhase, BattleResult, CombatEvent, CombatUnit, UnitId, UnitView};
pub use commit::verify_and_apply_turn;
pub use error::{GameError, GameResult};
pub use limits::{BattleLimits, LimitReason, Team};
pub use rng::{BattleRng, XorShiftRng};
pub use state::*;
pub use types::*;
pub use units::get_starter_templates;
pub use view::*;

// Browser exports (wasm-bindgen)
#[cfg(feature = "browser")]
pub use engine::GameEngine;

#[cfg(feature = "browser")]
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[cfg(feature = "browser")]
#[wasm_bindgen]
pub fn greet() -> alloc::string::String {
    alloc::string::String::from("Hello from Manalimit WASM!")
}
