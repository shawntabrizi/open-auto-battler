//! Weight functions for pallet-oab-tournament.
//!
//! This file is intended to be regenerated with the benchmark CLI after updating
//! benchmark scenarios in `benchmarking.rs`.

#![cfg_attr(rustfmt, rustfmt_skip)]
#![allow(unused_parens)]
#![allow(unused_imports)]

use core::marker::PhantomData;
use frame::{deps::frame_support::weights::constants::RocksDbWeight, prelude::*};

/// Weight functions needed for pallet-oab-tournament.
pub trait WeightInfo {
    fn create_tournament() -> Weight;
    fn join_tournament() -> Weight;
    fn submit_tournament_turn() -> Weight;
    fn abandon_tournament() -> Weight;
    fn claim_prize() -> Weight;
    fn end_tournament_game() -> Weight;
}

/// Weights for pallet-oab-tournament using runtime database weights.
pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn create_tournament() -> Weight {
        Weight::from_parts(100_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(2))
            .saturating_add(T::DbWeight::get().writes(3))
    }

    fn join_tournament() -> Weight {
        Weight::from_parts(180_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(7))
            .saturating_add(T::DbWeight::get().writes(5))
    }

    fn submit_tournament_turn() -> Weight {
        Weight::from_parts(400_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(12))
            .saturating_add(T::DbWeight::get().writes(6))
    }

    fn abandon_tournament() -> Weight {
        Weight::from_parts(100_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(2))
            .saturating_add(T::DbWeight::get().writes(2))
    }

    fn claim_prize() -> Weight {
        Weight::from_parts(220_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(106))
            .saturating_add(T::DbWeight::get().writes(2))
    }

    fn end_tournament_game() -> Weight {
        // Same as end_game + 2 tournament stat mutates
        Weight::from_parts(140_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(6))
            .saturating_add(T::DbWeight::get().writes(10))
    }
}

// For backwards compatibility and tests.
impl WeightInfo for () {
    fn create_tournament() -> Weight {
        Weight::from_parts(100_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(2))
            .saturating_add(RocksDbWeight::get().writes(3))
    }

    fn join_tournament() -> Weight {
        Weight::from_parts(180_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(7))
            .saturating_add(RocksDbWeight::get().writes(5))
    }

    fn submit_tournament_turn() -> Weight {
        Weight::from_parts(400_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(12))
            .saturating_add(RocksDbWeight::get().writes(6))
    }

    fn abandon_tournament() -> Weight {
        Weight::from_parts(100_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(2))
            .saturating_add(RocksDbWeight::get().writes(2))
    }

    fn claim_prize() -> Weight {
        Weight::from_parts(220_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(106))
            .saturating_add(RocksDbWeight::get().writes(2))
    }

    fn end_tournament_game() -> Weight {
        Weight::from_parts(140_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(6))
            .saturating_add(RocksDbWeight::get().writes(10))
    }
}
