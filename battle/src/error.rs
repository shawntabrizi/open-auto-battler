//! Error types for game operations
//!
//! This module provides no_std compatible error types using enums
//! instead of String-based errors for Substrate compatibility.

use crate::types::{IndexValue, ManaValue};
use parity_scale_codec::{Decode, Encode};
use scale_info::TypeInfo;

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

/// Game errors that can occur during gameplay
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type"))]
pub enum GameError {
    /// Not enough mana to perform action
    NotEnoughMana { have: ManaValue, need: ManaValue },
    /// Board is full, cannot place more units
    BoardFull,
    /// Invalid board slot index (out of bounds)
    InvalidBoardSlot { index: IndexValue },
    /// Board slot is already occupied
    BoardSlotOccupied { index: IndexValue },
    /// Board slot is empty
    BoardSlotEmpty { index: IndexValue },
    /// Attempted to interact with empty slot
    EmptySlot,
    /// Action not allowed in current phase
    WrongPhase,
    /// Unit template not found
    TemplateNotFound,
    /// Battle limit exceeded
    LimitExceeded,
    /// Invalid hand index (out of bounds)
    InvalidHandIndex { index: IndexValue },
    /// Card was already used this turn (double-use of same hand index)
    CardAlreadyUsed { index: IndexValue },
    /// Invalid board slot burned (empty or out of bounds)
    InvalidBoardBurn { index: IndexValue },
    /// Invalid board move action
    InvalidBoardMove {
        from_slot: IndexValue,
        to_slot: IndexValue,
    },
    /// Board state mismatch: a unit in new_board doesn't match any valid source
    BoardMismatch,
    /// Wrong board size submitted
    WrongBoardSize,
    /// Mana limit exceeded
    ManaLimitExceeded { earned: ManaValue, limit: ManaValue },
}

/// Result type alias for game operations
pub type GameResult<T> = Result<T, GameError>;
