//! Battle/shop state types
//!
//! This module defines the state types that the battle engine operates on.
//! Game session types (GameState, GamePhase, LocalGameState) live in the `game` crate.

use alloc::collections::BTreeMap;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
use scale_info::TypeInfo;

use crate::types::{BoardUnit, CardId, ManaValue, RarityValue, RoundValue, SetIdValue, UnitCard};

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

/// An entry in a card set, mapping a card to its rarity.
#[derive(
    Debug, Clone, Encode, Decode, DecodeWithMemTracking, TypeInfo, PartialEq, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct CardSetEntry {
    pub card_id: CardId,
    pub rarity: RarityValue,
}

/// A set of cards available for a game
#[derive(Debug, Clone, Encode, Decode, DecodeWithMemTracking, TypeInfo, PartialEq)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct CardSet {
    /// List of cards in the set and their relative rarity (weight).
    /// Rarity 0 means the card is a token and cannot be drafted into a bag.
    pub cards: Vec<CardSetEntry>,
}

/// The state that the shop/battle engine needs to validate turns and run triggers.
///
/// This is the boundary type for `verify_and_apply_turn` and shop triggers.
/// Game session fields (bag, lives, wins, phase) are NOT included here —
/// those live in `oab_game::GameState`.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct ShopState {
    /// Global pool of all card definitions
    pub card_pool: BTreeMap<CardId, UnitCard>,
    /// Set ID used for this game
    pub set_id: SetIdValue,
    /// Player's current hand for the shop phase
    pub hand: Vec<CardId>,
    /// Units on the player's board (index 0 is front)
    pub board: Vec<Option<BoardUnit>>,
    /// Maximum mana that can be held
    pub mana_limit: ManaValue,
    /// Current mana available during the shop turn
    pub shop_mana: ManaValue,
    /// Current round number (1-indexed, used for deterministic shop RNG)
    pub round: RoundValue,
    /// Seed for deterministic shop trigger RNG
    pub game_seed: u64,
}

/// Find an empty board slot
pub fn find_empty_board_slot(board: &[Option<BoardUnit>]) -> Option<usize> {
    board.iter().position(|slot| slot.is_none())
}
