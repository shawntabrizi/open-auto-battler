//! Game state management
//!
//! This module defines the shop/battle state used by the engine,
//! and the full game state that wraps it with session management fields.

use alloc::collections::BTreeMap;
use alloc::vec;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
use scale_info::TypeInfo;

use crate::rng::{BattleRng, XorShiftRng};
use crate::types::*;

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

/// Number of cards drawn per round as the player's hand
pub const HAND_SIZE: usize = 5;
/// Number of board slots
pub const BOARD_SIZE: usize = 5;
/// Number of cards in the initial bag
pub const STARTING_BAG_SIZE: usize = 50;

/// Current phase of the game
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum GamePhase {
    Shop,
    Battle,
    Completed,
}

/// An entry in a card set, mapping a card to its rarity.
#[derive(
    Debug, Clone, Encode, Decode, DecodeWithMemTracking, TypeInfo, PartialEq, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct CardSetEntry {
    pub card_id: CardId,
    pub rarity: u32,
}

/// A set of cards available for a game
#[derive(Debug, Clone, Encode, Decode, DecodeWithMemTracking, TypeInfo, PartialEq)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct CardSet {
    /// List of cards in the set and their relative rarity (weight).
    /// Rarity 0 means the card is a token and cannot be drafted into a bag.
    pub cards: Vec<CardSetEntry>,
}

// ── Shop State (what the battle engine operates on) ──

/// The state that the shop/battle engine needs to validate turns and run triggers.
///
/// This is the boundary type for `verify_and_apply_turn` and shop triggers.
/// Game session fields (bag, lives, wins, phase) are NOT included here.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct ShopState {
    /// Global pool of all card definitions
    pub card_pool: BTreeMap<CardId, UnitCard>,
    /// Set ID used for this game
    pub set_id: u32,
    /// Player's current hand for the shop phase
    pub hand: Vec<CardId>,
    /// Units on the player's board (index 0 is front)
    pub board: Vec<Option<BoardUnit>>,
    /// Maximum mana that can be held
    pub mana_limit: i32,
    /// Current mana available during the shop turn
    pub shop_mana: i32,
    /// Current round number (1-indexed, used for deterministic shop RNG)
    pub round: i32,
    /// Seed for deterministic shop trigger RNG
    pub game_seed: u64,
}

/// Find an empty board slot
pub fn find_empty_board_slot(board: &[Option<BoardUnit>]) -> Option<usize> {
    board.iter().position(|slot| slot.is_none())
}

// ── Full Game State (shop state + session management) ──

/// The user-specific game state for serialization (flat layout for SCALE encoding).
///
/// This is used for on-chain storage and session persistence.
/// At runtime, use `GameState` instead.
#[derive(Debug, Clone, Encode, Decode, DecodeWithMemTracking, TypeInfo, PartialEq)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct LocalGameState {
    /// Cards remaining in the bag (unordered pool)
    pub bag: Vec<CardId>,
    /// Player's current hand for the shop phase
    pub hand: Vec<CardId>,
    /// Units on the player's board (5 slots, index 0 is front)
    pub board: Vec<Option<BoardUnit>>,
    /// Maximum mana that can be held (increases each round)
    pub mana_limit: i32,
    /// Current mana available during the shop turn
    pub shop_mana: i32,
    /// Current round number (1-indexed)
    pub round: i32,
    /// Lives remaining
    pub lives: i32,
    /// Wins accumulated
    pub wins: i32,
    /// Current game phase
    pub phase: GamePhase,
    /// Counter for generating unique card IDs
    pub next_card_id: u32,
    /// Seed for deterministic hand derivation
    pub game_seed: u64,
}

/// A resumable game session (for on-chain SCALE encoding).
#[derive(Debug, Clone, Encode, Decode, DecodeWithMemTracking, TypeInfo, PartialEq)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct GameSession {
    pub state: LocalGameState,
    pub set_id: u32,
}

/// The complete game state used at runtime.
///
/// Contains the `ShopState` (what the battle engine operates on) plus
/// game session fields (bag, lives, wins, phase, etc.).
///
/// Derefs to `ShopState` so that `verify_and_apply_turn(&mut game_state, ...)`
/// auto-derefs and works seamlessly.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct GameState {
    /// The shop/battle engine state
    #[cfg_attr(feature = "std", serde(flatten))]
    pub shop: ShopState,
    /// Cards remaining in the bag (unordered pool)
    pub bag: Vec<CardId>,
    /// Lives remaining
    pub lives: i32,
    /// Wins accumulated
    pub wins: i32,
    /// Current game phase
    pub phase: GamePhase,
    /// Counter for generating unique card IDs
    pub next_card_id: u32,
}

impl core::ops::Deref for GameState {
    type Target = ShopState;
    fn deref(&self) -> &Self::Target {
        &self.shop
    }
}

impl core::ops::DerefMut for GameState {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.shop
    }
}

impl GameState {
    pub fn new(game_seed: u64) -> Self {
        Self {
            shop: ShopState {
                card_pool: BTreeMap::new(),
                set_id: 0,
                hand: Vec::new(),
                board: vec![None; BOARD_SIZE],
                mana_limit: 0,
                shop_mana: 0,
                round: 1,
                game_seed,
            },
            bag: Vec::new(),
            lives: 0,
            wins: 0,
            phase: GamePhase::Shop,
            next_card_id: 1,
        }
    }

    /// Create a completely empty GameState placeholder
    pub fn empty() -> Self {
        Self {
            shop: ShopState {
                card_pool: BTreeMap::new(),
                set_id: 0,
                hand: Vec::new(),
                board: Vec::new(),
                mana_limit: 0,
                shop_mana: 0,
                round: 0,
                game_seed: 0,
            },
            bag: Vec::new(),
            lives: 0,
            wins: 0,
            phase: GamePhase::Shop,
            next_card_id: 0,
        }
    }

    /// Construct a full GameState from card_pool and a flat LocalGameState
    pub fn reconstruct(
        card_pool: BTreeMap<CardId, UnitCard>,
        set_id: u32,
        local: LocalGameState,
    ) -> Self {
        Self {
            shop: ShopState {
                card_pool,
                set_id,
                hand: local.hand,
                board: local.board,
                mana_limit: local.mana_limit,
                shop_mana: local.shop_mana,
                round: local.round,
                game_seed: local.game_seed,
            },
            bag: local.bag,
            lives: local.lives,
            wins: local.wins,
            phase: local.phase,
            next_card_id: local.next_card_id,
        }
    }

    /// Decompose GameState into card_pool and a flat LocalGameState
    pub fn decompose(self) -> (BTreeMap<CardId, UnitCard>, u32, LocalGameState) {
        let local = LocalGameState {
            bag: self.bag,
            hand: self.shop.hand,
            board: self.shop.board,
            mana_limit: self.shop.mana_limit,
            shop_mana: self.shop.shop_mana,
            round: self.shop.round,
            lives: self.lives,
            wins: self.wins,
            phase: self.phase,
            next_card_id: self.next_card_id,
            game_seed: self.shop.game_seed,
        };
        (self.shop.card_pool, self.shop.set_id, local)
    }

    /// Populate the hand by drawing from the bag.
    pub fn draw_hand(&mut self) {
        // Return unused hand cards to the bag
        self.bag.append(&mut self.shop.hand);

        let indices = self.derive_hand_indices();
        if indices.is_empty() {
            return;
        }

        // Sort indices descending to remove from bag without shifting issues
        let mut sorted_indices = indices;
        sorted_indices.sort_unstable_by(|a, b| b.cmp(a));

        let mut drawn_hand = Vec::with_capacity(sorted_indices.len());
        for idx in sorted_indices {
            drawn_hand.push(self.bag.remove(idx));
        }

        // reverse to maintain original derived order (aesthetic)
        drawn_hand.reverse();
        self.shop.hand = drawn_hand;
    }

    /// Generate a unique card ID
    pub fn generate_card_id(&mut self) -> CardId {
        let id = self.next_card_id;
        self.next_card_id += 1;
        CardId(id)
    }

    /// Derive hand indices from bag using deterministic RNG
    pub fn derive_hand_indices(&self) -> Vec<usize> {
        derive_hand_indices_logic(
            self.bag.len(),
            self.shop.game_seed,
            self.shop.round,
        )
    }

    /// Find an empty board slot
    pub fn find_empty_board_slot(&self) -> Option<usize> {
        find_empty_board_slot(&self.shop.board)
    }

    /// Count units on the board
    pub fn board_unit_count(&self) -> usize {
        self.shop.board.iter().filter(|slot| slot.is_some()).count()
    }
}

/// Shared logic to derive hand indices
pub fn derive_hand_indices_logic(bag_len: usize, game_seed: u64, round: i32) -> Vec<usize> {
    if bag_len == 0 {
        return Vec::new();
    }

    let hand_count = HAND_SIZE.min(bag_len);
    let seed = game_seed ^ (round as u64);
    let mut rng = XorShiftRng::seed_from_u64(seed);

    // Partial Fisher-Yates: select hand_count unique indices
    let mut indices: Vec<usize> = (0..bag_len).collect();
    for i in 0..hand_count {
        let j = i + rng.gen_range(bag_len - i);
        indices.swap(i, j);
    }

    indices.truncate(hand_count);
    indices
}

impl Default for GameState {
    fn default() -> Self {
        Self::new(42)
    }
}
