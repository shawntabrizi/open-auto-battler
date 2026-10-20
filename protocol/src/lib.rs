//! SCALE types that cross an Open Auto Battler contract boundary.
//!
//! M1 added the `@oab/content` types; M3 added the mode types (`ModeGame`,
//! `BattleReport`). Later milestones add the run and
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

// ── Mode types (M3: `@oab/arena`) ────────────────────────────────────────────

pub use oab_battle::battle::BattleResult;
use oab_battle::types::SetIdValue;
pub use oab_game::{GameConfig, LocalGameState};

/// One player's game in a mode (`getGame(player)`). The client decodes it
/// as it is: it carries the config, so the client needs no hard-coded rules.
#[derive(Debug, Clone, PartialEq, Encode, Decode)]
pub struct ModeGame {
    pub run_id: u64,
    /// The engine that runs this game (`oab_engine::ENGINE_VERSION` of the
    /// mode build). The client picks its WASM build by it.
    pub engine_version: u32,
    pub set_id: SetIdValue,
    /// keccak256(SCALE(SetBundle)); equals Content's `setHash(set_id)`.
    pub set_hash: [u8; 32],
    pub config: GameConfig,
    pub state: LocalGameState,
    /// Personhood alias. Always `None` in the casual Arena.
    pub alias: Option<[u8; 32]>,
    pub started_block: u64,
}

/// The payload of `BattleReported(player, runId, report)`. It holds all that
/// a replay needs besides the set bundle: `oab_engine::replay_battle(
/// player_board, opponent, battle_seed, bundle.card_pool(), board_size)`.
#[derive(Debug, Clone, PartialEq, Encode, Decode)]
pub struct BattleReport {
    pub engine_version: u32,
    pub set_id: SetIdValue,
    /// The round that was fought.
    pub round: RoundValue,
    pub result: BattleResult,
    /// Wins and lives after the battle.
    pub wins: RoundValue,
    pub lives: RoundValue,
    pub battle_seed: u64,
    /// The board that fought (after the shop actions).
    pub player_board: Vec<GhostBoardUnit>,
    pub opponent: Vec<GhostBoardUnit>,
}
