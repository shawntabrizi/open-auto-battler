//! Open Auto Battler
//!
//! Umbrella crate that re-exports the core OAB crates:
//!
//! - [`battle`] – deterministic battle engine, cards, state, and types
//! - [`game`] – game-mode rules, session management, and validation

#![cfg_attr(not(feature = "std"), no_std)]

pub use oab_battle as battle;
pub use oab_game as game;
