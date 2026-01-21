use crate::types::*;
use serde::{Deserialize, Serialize};

/// Number of shop slots
pub const SHOP_SIZE: usize = 5;
/// Number of bench slots
pub const BENCH_SIZE: usize = 5;
/// Number of board slots
pub const BOARD_SIZE: usize = 5;
/// Starting lives
pub const STARTING_LIVES: i32 = 3;
/// Starting mana limit
pub const STARTING_MANA_LIMIT: i32 = 3;
/// Maximum mana limit
pub const MAX_MANA_LIMIT: i32 = 10;
/// Wins needed for victory
pub const WINS_TO_VICTORY: i32 = 10;

/// Current phase of the game
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GamePhase {
    Shop,
    Battle,
    Victory,
    Defeat,
}

/// The complete game state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    /// Cards remaining in the deck
    pub deck: Vec<UnitCard>,
    /// Cards displayed in the shop (5 slots)
    pub shop: Vec<ShopSlot>,
    /// Cards on the bench (5 slots)
    pub bench: Vec<Option<UnitCard>>,
    /// Units on the player's board (5 slots, index 0 is front)
    pub board: Vec<Option<BoardUnit>>,
    /// Current mana available
    pub mana: i32,
    /// Maximum mana that can be held (increases each round)
    pub mana_limit: i32,
    /// Current round number (1-indexed)
    pub round: i32,
    /// Lives remaining
    pub lives: i32,
    /// Wins accumulated
    pub wins: i32,
    /// Current game phase
    pub phase: GamePhase,
    /// Counter for generating unique card IDs
    pub next_card_id: CardId,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            deck: Vec::new(),
            shop: vec![ShopSlot::empty(); SHOP_SIZE],
            bench: vec![None; BENCH_SIZE],
            board: vec![None; BOARD_SIZE],
            mana: 0,
            mana_limit: STARTING_MANA_LIMIT,
            round: 1,
            lives: STARTING_LIVES,
            wins: 0,
            phase: GamePhase::Shop,
            next_card_id: 1,
        }
    }

    /// Generate a unique card ID
    pub fn generate_card_id(&mut self) -> CardId {
        let id = self.next_card_id;
        self.next_card_id += 1;
        id
    }

    /// Calculate mana limit for the current round
    pub fn calculate_mana_limit(&self) -> i32 {
        (STARTING_MANA_LIMIT + self.round - 1).min(MAX_MANA_LIMIT)
    }

    /// Add mana, respecting the limit
    pub fn add_mana(&mut self, amount: i32) {
        self.mana = (self.mana + amount).min(self.mana_limit);
    }

    /// Check if player can afford a cost
    pub fn can_afford(&self, cost: i32) -> bool {
        self.mana >= cost
    }

    /// Spend mana
    pub fn spend_mana(&mut self, amount: i32) -> Result<(), String> {
        if self.mana < amount {
            return Err(format!(
                "Not enough mana: have {}, need {}",
                self.mana, amount
            ));
        }
        self.mana -= amount;
        Ok(())
    }

    /// Find an empty bench slot
    pub fn find_empty_bench_slot(&self) -> Option<usize> {
        self.bench.iter().position(|slot| slot.is_none())
    }

    /// Find an empty board slot
    pub fn find_empty_board_slot(&self) -> Option<usize> {
        self.board.iter().position(|slot| slot.is_none())
    }

    /// Count units on the board
    pub fn board_unit_count(&self) -> usize {
        self.board.iter().filter(|slot| slot.is_some()).count()
    }

    /// Count units on the bench
    pub fn bench_unit_count(&self) -> usize {
        self.bench.iter().filter(|slot| slot.is_some()).count()
    }
}

impl Default for GameState {
    fn default() -> Self {
        Self::new()
    }
}
