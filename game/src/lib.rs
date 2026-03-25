//! Open Auto Battler Game Modes
//!
//! Game-mode rules and validation built on top of oab-core engine primitives.
//! This crate is no_std compatible for use in blockchain pallets.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod constructed;
pub mod sealed;
