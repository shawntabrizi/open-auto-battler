//! Default game assets for Open Auto Battler.
//!
//! This crate provides statically compiled card, set, and style data
//! generated at build time from JSON definitions. It depends on `oab-battle`
//! for the core types but can be swapped for a dynamic asset loader.
//!
//! - [`cards`] – card definitions and metadata
//! - [`sets`] – card set definitions and metadata
//! - [`styles`] – NFT style collections

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub mod cards {
    include!(concat!(env!("OUT_DIR"), "/cards_generated.rs"));
}

pub mod sets {
    include!(concat!(env!("OUT_DIR"), "/sets_generated.rs"));
}

pub mod styles {
    include!(concat!(env!("OUT_DIR"), "/styles_generated.rs"));
}
