//! Error types for game operations
//!
//! This module provides no_std compatible error types using enums
//! instead of String-based errors for Substrate compatibility.

use parity_scale_codec::{Decode, Encode};
use scale_info::TypeInfo;

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

/// Game errors that can occur during gameplay
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", rename_all = "camelCase"))]
pub enum GameError {
    /// Not enough mana to perform action
    NotEnoughMana { have: i32, need: i32 },
    /// Board is full, cannot place more units
    BoardFull,
    /// Invalid board slot index
    InvalidBoardSlot { index: u8 },
    /// Attempted to interact with empty slot
    EmptySlot,
    /// Action not allowed in current phase
    WrongPhase,
    /// Unit template not found
    TemplateNotFound,
    /// Battle limit exceeded
    LimitExceeded,
    /// Invalid hand index (out of bounds)
    InvalidHandIndex { index: u32 },
    /// Card was already used this turn (double-use of same hand index)
    CardAlreadyUsed { index: u32 },
    /// Invalid board slot pitched (empty or out of bounds)
    InvalidBoardPitch { index: u32 },
    /// Board state mismatch: a unit in new_board doesn't match any valid source
    BoardMismatch,
    /// Wrong board size submitted
    WrongBoardSize,
    /// Mana limit exceeded
    ManaLimitExceeded { earned: i32, limit: i32 },
}

/// Result type alias for game operations
pub type GameResult<T> = Result<T, GameError>;
