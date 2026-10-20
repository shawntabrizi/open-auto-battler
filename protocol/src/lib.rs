//! SCALE types that cross an Open Auto Battler contract boundary.
//!
//! M1 holds the `@oab/content` types. Later milestones add the mode, run, and
//! records types here (`docs/CONTRACT_ARCHITECTURE.md` section 5).

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, Encode};

use oab_battle::types::{GhostBoardUnit, RoundValue};
pub use oab_engine::{keccak256, SetBundle};

/// Card ids from here up are reserved for community cards (extension point,
/// not open in M1). `publishCard` rejects them.
pub const COMMUNITY_CARD_ID_START: u16 = 0x8000;

/// At most this many house ghosts per set.
pub const MAX_HOUSE_GHOSTS: usize = 64;

/// At most this many units on a house ghost board (the board size of every
/// current mode config).
pub const MAX_HOUSE_GHOST_UNITS: usize = 5;

/// At most this many bytes in a set name.
pub const MAX_SET_NAME_LEN: usize = 64;

/// Where a card came from.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub enum CardOrigin {
    /// Published by an OAB curator.
    Curated,
    /// Reserved: a user-made card (ids from [`COMMUNITY_CARD_ID_START`]).
    Community { creator: [u8; 20] },
}

/// Who published a card, and when.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub struct CardMeta {
    pub publisher: [u8; 20],
    pub block: u64,
    pub origin: CardOrigin,
}

/// A designer-made opponent board, published with its set (decision Q1). A
/// mode seeds its ghost pools from these: a ghost of round `r` fits every
/// bracket of round `r`.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub struct HouseGhost {
    pub round: RoundValue,
    pub board: Vec<GhostBoardUnit>,
}

/// Content's record of a published set. The bundle and the house ghosts are
/// stored apart (`getSetBundle`, `getHouseGhosts`); this holds their hashes.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub struct SetRecord {
    pub name: String,
    /// keccak256(SCALE(SetBundle)), see [`SetBundle::hash`].
    pub hash: [u8; 32],
    /// keccak256(SCALE(Vec<HouseGhost>)), see [`ghosts_hash`].
    pub ghosts_hash: [u8; 32],
    pub publisher: [u8; 20],
    pub block: u64,
}

/// keccak256(SCALE(ghosts)): pins the house ghosts of a set.
pub fn ghosts_hash(ghosts: &[HouseGhost]) -> [u8; 32] {
    keccak256(&ghosts.encode())
}
