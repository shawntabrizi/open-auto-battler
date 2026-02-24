//! Weight functions for pallet-auto-battle.
//!
//! This file is intended to be regenerated with the benchmark CLI after updating
//! benchmark scenarios in `benchmarking.rs`.

#![cfg_attr(rustfmt, rustfmt_skip)]
#![allow(unused_parens)]
#![allow(unused_imports)]

use core::marker::PhantomData;
use frame::{deps::frame_support::weights::constants::RocksDbWeight, prelude::*};

/// Weight functions needed for pallet-auto-battle.
pub trait WeightInfo {
    fn start_game() -> Weight;
    fn submit_turn() -> Weight;
    fn submit_card() -> Weight;
    fn set_card_metadata() -> Weight;
    fn create_card_set() -> Weight;
    fn set_set_metadata() -> Weight;
    fn create_tournament() -> Weight;
    fn join_tournament() -> Weight;
    fn submit_tournament_turn() -> Weight;
    fn abandon_game() -> Weight;
    fn abandon_tournament() -> Weight;
    fn claim_prize() -> Weight;
}

/// Weights for pallet-auto-battle using runtime database weights.
pub struct SubstrateWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for SubstrateWeight<T> {
    fn start_game() -> Weight {
        Weight::from_parts(100_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(5))
            .saturating_add(T::DbWeight::get().writes(1))
    }

    fn submit_turn() -> Weight {
        Weight::from_parts(400_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(10))
            .saturating_add(T::DbWeight::get().writes(5))
    }

    fn submit_card() -> Weight {
        Weight::from_parts(120_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(2))
            .saturating_add(T::DbWeight::get().writes(4))
    }

    fn set_card_metadata() -> Weight {
        Weight::from_parts(80_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(1))
            .saturating_add(T::DbWeight::get().writes(1))
    }

    fn create_card_set() -> Weight {
        Weight::from_parts(180_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(102))
            .saturating_add(T::DbWeight::get().writes(4))
    }

    fn set_set_metadata() -> Weight {
        Weight::from_parts(80_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(1))
            .saturating_add(T::DbWeight::get().writes(1))
    }

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

    fn abandon_game() -> Weight {
        Weight::from_parts(60_000_000, 0)
            .saturating_add(T::DbWeight::get().reads(1))
            .saturating_add(T::DbWeight::get().writes(1))
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
}

// For backwards compatibility and tests.
impl WeightInfo for () {
    fn start_game() -> Weight {
        Weight::from_parts(100_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(5))
            .saturating_add(RocksDbWeight::get().writes(1))
    }

    fn submit_turn() -> Weight {
        Weight::from_parts(400_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(10))
            .saturating_add(RocksDbWeight::get().writes(5))
    }

    fn submit_card() -> Weight {
        Weight::from_parts(120_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(2))
            .saturating_add(RocksDbWeight::get().writes(4))
    }

    fn set_card_metadata() -> Weight {
        Weight::from_parts(80_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(1))
            .saturating_add(RocksDbWeight::get().writes(1))
    }

    fn create_card_set() -> Weight {
        Weight::from_parts(180_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(102))
            .saturating_add(RocksDbWeight::get().writes(4))
    }

    fn set_set_metadata() -> Weight {
        Weight::from_parts(80_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(1))
            .saturating_add(RocksDbWeight::get().writes(1))
    }

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

    fn abandon_game() -> Weight {
        Weight::from_parts(60_000_000, 0)
            .saturating_add(RocksDbWeight::get().reads(1))
            .saturating_add(RocksDbWeight::get().writes(1))
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
}
