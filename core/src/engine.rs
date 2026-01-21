use crate::battle::{BattleResult, BattleSimulator, CombatEvent, CombatUnit};
use crate::opponents::get_opponent_for_round;
use crate::state::*;
use crate::types::*;
use crate::view::{BattleResultView, GameView};
use rand::seq::SliceRandom;
use rand::SeedableRng;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Card template for creating starter deck cards
struct CardTemplate {
    template_id: &'static str,
    name: &'static str,
    attack: i32,
    health: i32,
    play_cost: i32,
    pitch_value: i32,
}

/// The 10 unique unit cards for the starter deck
const STARTER_TEMPLATES: &[CardTemplate] = &[
    CardTemplate {
        template_id: "goblin_scout",
        name: "Goblin Scout",
        attack: 1,
        health: 2,
        play_cost: 1,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "goblin_looter",
        name: "Goblin Looter",
        attack: 1,
        health: 1,
        play_cost: 1,
        pitch_value: 3,
    },
    CardTemplate {
        template_id: "militia",
        name: "Militia",
        attack: 2,
        health: 2,
        play_cost: 2,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "shield_bearer",
        name: "Shield Bearer",
        attack: 1,
        health: 4,
        play_cost: 2,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "wolf_rider",
        name: "Wolf Rider",
        attack: 3,
        health: 2,
        play_cost: 3,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "orc_warrior",
        name: "Orc Warrior",
        attack: 3,
        health: 3,
        play_cost: 3,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "troll_brute",
        name: "Troll Brute",
        attack: 4,
        health: 5,
        play_cost: 5,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "ogre_mauler",
        name: "Ogre Mauler",
        attack: 5,
        health: 6,
        play_cost: 6,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "giant_crusher",
        name: "Giant Crusher",
        attack: 6,
        health: 8,
        play_cost: 8,
        pitch_value: 2,
    },
    CardTemplate {
        template_id: "dragon_tyrant",
        name: "Dragon Tyrant",
        attack: 8,
        health: 10,
        play_cost: 10,
        pitch_value: 3,
    },
];

/// Result of starting a battle (events for playback)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleOutput {
    pub events: Vec<CombatEvent>,
    pub result: BattleResultView,
    pub enemy_board: Vec<String>,
}

/// The main game engine exposed to WASM
#[wasm_bindgen]
pub struct GameEngine {
    state: GameState,
    last_battle_output: Option<BattleOutput>,
}

#[wasm_bindgen]
impl GameEngine {
    /// Create a new game engine with a fresh game state
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut engine = Self {
            state: GameState::new(),
            last_battle_output: None,
        };
        engine.initialize_deck();
        engine.fill_shop();
        engine
    }

    /// Get the current game view as JSON
    #[wasm_bindgen]
    pub fn get_view(&self) -> JsValue {
        let view = GameView::from(&self.state);
        serde_wasm_bindgen::to_value(&view).unwrap_or(JsValue::NULL)
    }

    /// Get the last battle output as JSON (events + result)
    #[wasm_bindgen]
    pub fn get_battle_output(&self) -> JsValue {
        match &self.last_battle_output {
            Some(output) => serde_wasm_bindgen::to_value(output).unwrap_or(JsValue::NULL),
            None => JsValue::NULL,
        }
    }

    /// Pitch a card from the shop to generate mana
    #[wasm_bindgen]
    pub fn pitch_shop_card(&mut self, index: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        if index >= SHOP_SIZE {
            return Err(format!("Invalid shop index: {}", index));
        }

        let slot = &mut self.state.shop[index];
        let card = slot
            .card
            .take()
            .ok_or_else(|| "Shop slot is empty".to_string())?;

        // Add mana from pitch value (capped at limit)
        self.state.add_mana(card.economy.pitch_value);

        // Refill the slot from deck
        if let Some(new_card) = self.state.deck.pop() {
            self.state.shop[index] = ShopSlot::with_card(new_card);
        }

        Ok(())
    }

    /// Buy a card from the shop
    #[wasm_bindgen]
    pub fn buy_card(&mut self, shop_index: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only buy during shop phase".to_string());
        }

        if shop_index >= SHOP_SIZE {
            return Err(format!("Invalid shop index: {}", shop_index));
        }

        // Check if slot has a card
        let card = self.state.shop[shop_index]
            .card
            .as_ref()
            .ok_or_else(|| "Shop slot is empty".to_string())?;

        // Check if we can afford it
        let cost = card.economy.play_cost;
        if !self.state.can_afford(cost) {
            return Err(format!(
                "Not enough mana: have {}, need {}",
                self.state.mana, cost
            ));
        }

        // Check if bench has space
        let bench_slot = self
            .state
            .find_empty_bench_slot()
            .ok_or_else(|| "Bench is full".to_string())?;

        // Take the card and spend mana
        let card = self.state.shop[shop_index].card.take().unwrap();
        self.state.spend_mana(cost)?;

        // Place on bench
        self.state.bench[bench_slot] = Some(card);

        Ok(())
    }

    /// Freeze/unfreeze a shop slot
    #[wasm_bindgen]
    pub fn toggle_freeze(&mut self, shop_index: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only freeze during shop phase".to_string());
        }

        if shop_index >= SHOP_SIZE {
            return Err(format!("Invalid shop index: {}", shop_index));
        }

        let slot = &mut self.state.shop[shop_index];
        if slot.card.is_some() {
            slot.frozen = !slot.frozen;
            Ok(())
        } else {
            Err("Cannot freeze empty slot".to_string())
        }
    }

    /// Place a unit from bench to board
    #[wasm_bindgen]
    pub fn place_unit(&mut self, bench_index: usize, board_slot: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only place units during shop phase".to_string());
        }

        if bench_index >= BENCH_SIZE {
            return Err(format!("Invalid bench index: {}", bench_index));
        }

        if board_slot >= BOARD_SIZE {
            return Err(format!("Invalid board slot: {}", board_slot));
        }

        // Check if bench slot has a unit
        let card = self.state.bench[bench_index]
            .take()
            .ok_or_else(|| "Bench slot is empty".to_string())?;

        // Check if board slot is empty
        if self.state.board[board_slot].is_some() {
            // Put the card back
            self.state.bench[bench_index] = Some(card);
            return Err("Board slot is occupied".to_string());
        }

        // Place on board
        self.state.board[board_slot] = Some(BoardUnit::from_card(card));

        Ok(())
    }

    /// Return a unit from board to bench
    #[wasm_bindgen]
    pub fn return_unit(&mut self, board_slot: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only return units during shop phase".to_string());
        }

        if board_slot >= BOARD_SIZE {
            return Err(format!("Invalid board slot: {}", board_slot));
        }

        // Check if board slot has a unit
        let unit = self.state.board[board_slot]
            .take()
            .ok_or_else(|| "Board slot is empty".to_string())?;

        // Check if bench has space
        let bench_slot = self
            .state
            .find_empty_bench_slot()
            .ok_or_else(|| "Bench is full".to_string())?;

        // Move to bench (reset to full health)
        let card = unit.card;
        self.state.bench[bench_slot] = Some(card);

        Ok(())
    }

    /// Swap two board positions
    #[wasm_bindgen]
    pub fn swap_board_positions(&mut self, slot_a: usize, slot_b: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only swap during shop phase".to_string());
        }

        if slot_a >= BOARD_SIZE || slot_b >= BOARD_SIZE {
            return Err("Invalid board slot".to_string());
        }

        self.state.board.swap(slot_a, slot_b);
        Ok(())
    }

    /// Pitch a unit from the board
    #[wasm_bindgen]
    pub fn pitch_board_unit(&mut self, board_slot: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        if board_slot >= BOARD_SIZE {
            return Err(format!("Invalid board slot: {}", board_slot));
        }

        let unit = self.state.board[board_slot]
            .take()
            .ok_or_else(|| "Board slot is empty".to_string())?;

        // Add mana from pitch value
        self.state.add_mana(unit.card.economy.pitch_value);

        Ok(())
    }

    /// Pitch a unit from the bench
    #[wasm_bindgen]
    pub fn pitch_bench_unit(&mut self, bench_index: usize) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        if bench_index >= BENCH_SIZE {
            return Err(format!("Invalid bench index: {}", bench_index));
        }

        let card = self.state.bench[bench_index]
            .take()
            .ok_or_else(|| "Bench slot is empty".to_string())?;

        // Add mana from pitch value
        self.state.add_mana(card.economy.pitch_value);

        Ok(())
    }

    /// End the shop phase and start battle
    #[wasm_bindgen]
    pub fn end_turn(&mut self) -> Result<(), String> {
        if self.state.phase != GamePhase::Shop {
            return Err("Can only end turn during shop phase".to_string());
        }

        // Return unfrozen cards to bottom of deck
        for slot in &mut self.state.shop {
            if !slot.frozen {
                if let Some(card) = slot.card.take() {
                    self.state.deck.insert(0, card);
                }
            }
            // Unfreeze for next round
            slot.frozen = false;
        }

        // Reset mana
        self.state.mana = 0;

        // Start battle phase
        self.state.phase = GamePhase::Battle;

        // Run the battle
        self.run_battle();

        Ok(())
    }

    /// Continue after battle (go to next shop phase or end game)
    #[wasm_bindgen]
    pub fn continue_after_battle(&mut self) -> Result<(), String> {
        if self.state.phase != GamePhase::Battle {
            return Err("Not in battle phase".to_string());
        }

        // Check for game over conditions
        if self.state.wins >= WINS_TO_VICTORY {
            self.state.phase = GamePhase::Victory;
            return Ok(());
        }

        if self.state.lives <= 0 {
            self.state.phase = GamePhase::Defeat;
            return Ok(());
        }

        // Advance to next round
        self.state.round += 1;
        self.state.mana_limit = self.state.calculate_mana_limit();

        // Refill shop
        self.fill_shop();

        // Go to shop phase
        self.state.phase = GamePhase::Shop;

        Ok(())
    }

    /// Start a new run (reset everything)
    #[wasm_bindgen]
    pub fn new_run(&mut self) {
        self.state = GameState::new();
        self.last_battle_output = None;
        self.initialize_deck();
        self.fill_shop();
    }
}

// Private implementation methods (not exposed to WASM)
impl GameEngine {
    /// Initialize the starter deck (30 cards, 3 copies of each template)
    fn initialize_deck(&mut self) {
        self.state.deck.clear();

        // Add 3 copies of each template
        for template in STARTER_TEMPLATES {
            for _ in 0..3 {
                let id = self.state.generate_card_id();
                let card = UnitCard::new(
                    id,
                    template.template_id,
                    template.name,
                    template.attack,
                    template.health,
                    template.play_cost,
                    template.pitch_value,
                );
                self.state.deck.push(card);
            }
        }

        // Shuffle the deck with a seeded RNG for reproducibility
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        self.state.deck.shuffle(&mut rng);
    }

    /// Fill empty shop slots from the deck
    fn fill_shop(&mut self) {
        for slot in &mut self.state.shop {
            if slot.card.is_none() && !slot.frozen {
                if let Some(card) = self.state.deck.pop() {
                    *slot = ShopSlot::with_card(card);
                }
            }
        }
    }

    /// Run the battle simulation
    fn run_battle(&mut self) {
        // Get player units from board (compact to remove empty slots)
        let player_units: Vec<CombatUnit> = self
            .state
            .board
            .iter()
            .filter_map(|slot| slot.as_ref().map(CombatUnit::from_board_unit))
            .collect();

        // Get enemy units for this round
        let enemy_units = get_opponent_for_round(self.state.round);
        let enemy_names: Vec<String> = enemy_units.iter().map(|u| u.name.clone()).collect();

        // Run simulation
        let simulator = BattleSimulator::new(player_units, enemy_units);
        let (result, events) = simulator.simulate();

        // Apply result
        match &result {
            BattleResult::Victory { .. } => {
                self.state.wins += 1;
            }
            BattleResult::Defeat { .. } => {
                self.state.lives -= 1;
            }
            BattleResult::Draw => {
                // No change
            }
        }

        // Clear the board after battle (units that survived go back to bench or are lost)
        // For MVP simplicity, all units are cleared after battle
        for slot in &mut self.state.board {
            *slot = None;
        }

        // Store battle output for UI playback
        self.last_battle_output = Some(BattleOutput {
            events,
            result: BattleResultView::from(&result),
            enemy_board: enemy_names,
        });
    }
}

impl Default for GameEngine {
    fn default() -> Self {
        Self::new()
    }
}
