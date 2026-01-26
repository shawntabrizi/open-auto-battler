//! Game engine for browser WASM builds
//!
//! This module provides the main game engine exposed to JavaScript via wasm-bindgen.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

use crate::battle::{resolve_battle, CombatEvent, UnitId, UnitView};
use crate::log;
use crate::opponents::get_opponent_for_round;
use crate::rng::{BattleRng, XorShiftRng};
use crate::state::*;
use crate::types::{BoardUnit, ShopSlot, UnitCard};
use crate::units::get_starter_templates;
use crate::view::GameView;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Result of starting a battle (events for playback)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleOutput {
    pub events: Vec<CombatEvent>,
    pub initial_player_units: Vec<UnitView>,
    pub initial_enemy_units: Vec<UnitView>,
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
        log::info("=== MANALIMIT ENGINE INITIALIZED ===");
        let mut engine = Self {
            state: GameState::new(),
            last_battle_output: None,
        };
        engine.initialize_deck();
        engine.fill_shop();
        engine.log_state();
        engine
    }

    /// Get the current game view as JSON
    #[wasm_bindgen]
    pub fn get_view(&self) -> JsValue {
        log::debug("get_view", "Serializing game state to view");
        let view = GameView::from(&self.state);
        match serde_wasm_bindgen::to_value(&view) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("get_view serialization failed: {:?}", e));
                JsValue::NULL
            }
        }
    }

    /// Get the last battle output as JSON (events + result)
    #[wasm_bindgen]
    pub fn get_battle_output(&self) -> JsValue {
        log::debug("get_battle_output", "Fetching battle output");
        match &self.last_battle_output {
            Some(output) => serde_wasm_bindgen::to_value(output).unwrap_or(JsValue::NULL),
            None => JsValue::NULL,
        }
    }

    /// Pitch a card from the shop to generate mana
    #[wasm_bindgen]
    pub fn pitch_shop_card(&mut self, index: usize) -> Result<(), String> {
        log::action("pitch_shop_card", &format!("index={}", index));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        let card = self
            .state
            .shop
            .get_mut(index)
            .ok_or("Invalid shop index")?
            .card
            .take()
            .ok_or("Shop slot is empty")?;

        let pitch_value = card.economy.pitch_value;

        self.state.add_mana(pitch_value);

        let new_card = self.state.deck.pop();

        if let Some(slot) = self.state.shop.get_mut(index) {
            if let Some(nc) = new_card {
                log::info(&format!(
                    "   Refilled slot {} with '{}' from deck ({} remaining)",
                    index,
                    nc.name,
                    self.state.deck.len()
                ));
                *slot = ShopSlot::with_card(nc);
            } else {
                log::warn("Deck empty, slot left empty");
            }
        }

        self.log_state();
        Ok(())
    }

    /// Buy a card from the shop
    #[wasm_bindgen]
    pub fn buy_card(&mut self, shop_index: usize) -> Result<(), String> {
        log::action("buy_card", &format!("shop_index={}", shop_index));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only buy during shop phase".to_string());
        }

        let cost = self
            .state
            .shop
            .get(shop_index)
            .and_then(|s| s.card.as_ref())
            .map(|c| c.economy.play_cost)
            .ok_or("Shop slot is empty")?;

        if !self.state.can_afford(cost) {
            return Err(format!(
                "Not enough mana: have {}, need {}",
                self.state.mana, cost
            ));
        }

        let board_slot = self.state.find_empty_board_slot().ok_or("Board is full")?;

        let card = self
            .state
            .shop
            .get_mut(shop_index)
            .and_then(|s| s.card.take())
            .ok_or("Failed to take card from shop")?;

        self.state
            .spend_mana(cost)
            .map_err(|e| format!("{:?}", e))?;
        self.state.board[board_slot] = Some(BoardUnit::from_card(card));

        self.log_state();
        Ok(())
    }

    /// Freeze/unfreeze a shop slot
    #[wasm_bindgen]
    pub fn toggle_freeze(&mut self, shop_index: usize) -> Result<(), String> {
        log::action("toggle_freeze", &format!("shop_index={}", shop_index));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only freeze during shop phase".to_string());
        }

        let slot = self
            .state
            .shop
            .get_mut(shop_index)
            .ok_or("Invalid shop index")?;
        if slot.card.is_some() {
            slot.frozen = !slot.frozen;
            Ok(())
        } else {
            Err("Cannot freeze empty slot".to_string())
        }
    }

    /// Swap two board positions
    #[wasm_bindgen]
    pub fn swap_board_positions(&mut self, slot_a: usize, slot_b: usize) -> Result<(), String> {
        log::action(
            "swap_board_positions",
            &format!("a={}, b={}", slot_a, slot_b),
        );
        if self.state.phase != GamePhase::Shop {
            return Err("Can only swap during shop phase".to_string());
        }

        if slot_a >= self.state.board.len() || slot_b >= self.state.board.len() {
            return Err("Invalid board slot".to_string());
        }

        self.state.board.swap(slot_a, slot_b);
        Ok(())
    }

    /// Pitch a unit from the board
    #[wasm_bindgen]
    pub fn pitch_board_unit(&mut self, board_slot: usize) -> Result<(), String> {
        log::action("pitch_board_unit", &format!("slot={}", board_slot));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        let unit = self
            .state
            .board
            .get_mut(board_slot)
            .and_then(|s| s.take())
            .ok_or("Board slot is empty")?;

        self.state.add_mana(unit.card.economy.pitch_value);
        self.log_state();
        Ok(())
    }

    /// End the shop phase and start battle
    #[wasm_bindgen]
    pub fn end_turn(&mut self) -> Result<(), String> {
        log::action("end_turn", "Starting battle phase");
        if self.state.phase != GamePhase::Shop {
            return Err("Can only end turn during shop phase".to_string());
        }

        for slot in &mut self.state.shop {
            if !slot.frozen {
                if let Some(card) = slot.card.take() {
                    self.state.deck.insert(0, card);
                }
            }
            slot.frozen = false;
        }

        self.state.mana = 0;
        self.state.phase = GamePhase::Battle;
        self.run_battle();
        self.log_state();
        Ok(())
    }

    /// Continue after battle (go to next shop phase or end game)
    #[wasm_bindgen]
    pub fn continue_after_battle(&mut self) -> Result<(), String> {
        log::action("continue_after_battle", "Processing battle result");
        if self.state.phase != GamePhase::Battle {
            return Err("Not in battle phase".to_string());
        }

        if self.state.wins >= WINS_TO_VICTORY {
            self.state.phase = GamePhase::Victory;
            return Ok(());
        }
        if self.state.lives <= 0 {
            self.state.phase = GamePhase::Defeat;
            return Ok(());
        }

        self.state.round += 1;
        self.state.mana_limit = self.state.calculate_mana_limit();
        self.fill_shop();
        self.state.phase = GamePhase::Shop;

        self.log_state();
        Ok(())
    }

    /// Start a new run (reset everything)
    #[wasm_bindgen]
    pub fn new_run(&mut self) {
        log::action("new_run", "Starting fresh run");
        self.state = GameState::new();
        self.last_battle_output = None;
        self.initialize_deck();
        self.fill_shop();
        self.log_state();
    }

    /// Get the full game state as JSON (for P2P sync)
    #[wasm_bindgen]
    pub fn get_state(&self) -> JsValue {
        match serde_wasm_bindgen::to_value(&self.state) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("get_state serialization failed: {:?}", e));
                JsValue::NULL
            }
        }
    }

    /// Overwrite the game state from JSON (for P2P sync)
    #[wasm_bindgen]
    pub fn set_state(&mut self, state_val: JsValue) -> Result<(), String> {
        let state: GameState = serde_wasm_bindgen::from_value(state_val)
            .map_err(|e| format!("Failed to parse state: {:?}", e))?;
        self.state = state;
        Ok(())
    }

    /// Get the current board state (for P2P sync)
    #[wasm_bindgen]
    pub fn get_board(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.state.board).unwrap_or(JsValue::NULL)
    }

    /// Resolve a battle between two arbitrary boards (for P2P)
    /// Returns BattleOutput JSON
    #[wasm_bindgen]
    pub fn resolve_battle_p2p(
        &self,
        player_board_val: JsValue,
        enemy_board_val: JsValue,
        seed: u64,
    ) -> Result<JsValue, String> {
        let player_board_raw: Vec<Option<BoardUnit>> =
            serde_wasm_bindgen::from_value(player_board_val)
                .map_err(|e| format!("Failed to parse player board: {:?}", e))?;
        let enemy_board_raw: Vec<Option<BoardUnit>> =
            serde_wasm_bindgen::from_value(enemy_board_val)
                .map_err(|e| format!("Failed to parse enemy board: {:?}", e))?;

        let player_board: Vec<BoardUnit> = player_board_raw.into_iter().flatten().collect();
        let enemy_board: Vec<BoardUnit> = enemy_board_raw.into_iter().flatten().collect();

        let mut rng = XorShiftRng::seed_from_u64(seed);
        let events = resolve_battle(&player_board, &enemy_board, &mut rng);

        // Generate initial views for UI
        let mut instance_counter: u32 = 0;
        let initial_player_units: Vec<UnitView> = player_board
            .iter()
            .map(|u| {
                instance_counter += 1;
                UnitView {
                    instance_id: UnitId::player(instance_counter),
                    template_id: u.card.template_id.clone(),
                    name: u.card.name.clone(),
                    attack: u.card.stats.attack,
                    health: u.current_health,
                    abilities: u.card.abilities.clone(),
                    is_token: u.card.is_token,
                }
            })
            .collect();

        instance_counter = 0;
        let initial_enemy_units: Vec<UnitView> = enemy_board
            .iter()
            .map(|u| {
                instance_counter += 1;
                UnitView {
                    instance_id: UnitId::enemy(instance_counter),
                    template_id: u.card.template_id.clone(),
                    name: u.card.name.clone(),
                    attack: u.card.stats.attack,
                    health: u.current_health,
                    abilities: u.card.abilities.clone(),
                    is_token: u.card.is_token,
                }
            })
            .collect();

        let output = BattleOutput {
            events,
            initial_player_units,
            initial_enemy_units,
        };

        serde_wasm_bindgen::to_value(&output).map_err(|e| format!("Serialization failed: {:?}", e))
    }
    /// Apply a battle result to the game state (for P2P)
    #[wasm_bindgen]
    pub fn apply_battle_result(&mut self, result_val: JsValue) -> Result<(), String> {
        let result: crate::battle::BattleResult = serde_wasm_bindgen::from_value(result_val)
            .map_err(|e| format!("Failed to parse result: {:?}", e))?;

        match result {
            crate::battle::BattleResult::Victory => self.state.wins += 1,
            crate::battle::BattleResult::Defeat => self.state.lives -= 1,
            _ => {}
        }
        Ok(())
    }

    /// Set the game phase to Battle (for P2P)
    #[wasm_bindgen]
    pub fn set_phase_battle(&mut self) {
        self.state.phase = GamePhase::Battle;
    }
}

// Private implementation methods
impl GameEngine {
    fn log_state(&self) {
        log::debug("STATE", &format!("{:?}", self.state));
    }

    fn initialize_deck(&mut self) {
        self.state.deck.clear();
        let templates = get_starter_templates();
        for template in &templates {
            if template.is_token {
                continue;
            }
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
                    template.is_token,
                )
                .with_abilities(template.abilities.clone());
                self.state.deck.push(card);
            }
        }
        // Shuffle the deck using XorShiftRng
        let mut rng = XorShiftRng::seed_from_u64(42);
        rng.shuffle(&mut self.state.deck);
    }

    fn fill_shop(&mut self) {
        for slot in &mut self.state.shop {
            if slot.card.is_none() && !slot.frozen {
                if let Some(card) = self.state.deck.pop() {
                    *slot = ShopSlot::with_card(card);
                }
            }
        }
    }

    fn run_battle(&mut self) {
        log::info("=== BATTLE START ===");

        let player_board: Vec<BoardUnit> =
            self.state.board.iter().filter_map(|s| s.clone()).collect();
        
        let battle_seed = self.state.round as u64;
        let enemy_board = get_opponent_for_round(self.state.round, &mut self.state.next_card_id, battle_seed + 999)
            .expect("Failed to generate opponent for round");

        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        let events = resolve_battle(&player_board, &enemy_board, &mut rng);

        if let Some(CombatEvent::BattleEnd { result }) = events.last() {
            match result {
                crate::battle::BattleResult::Victory => self.state.wins += 1,
                crate::battle::BattleResult::Defeat => self.state.lives -= 1,
                _ => {} // DRAW
            }
            log::info(&format!("Battle Result: {:?}", result));
        }

        let mut instance_counter: u32 = 0;
        let initial_player_units: Vec<UnitView> = player_board
            .iter()
            .map(|u| {
                instance_counter += 1;
                UnitView {
                    instance_id: UnitId::player(instance_counter),
                    template_id: u.card.template_id.clone(),
                    name: u.card.name.clone(),
                    attack: u.card.stats.attack,
                    health: u.current_health,
                    abilities: u.card.abilities.clone(),
                    is_token: u.card.is_token,
                }
            })
            .collect();
        instance_counter = 0;
        let initial_enemy_units: Vec<UnitView> = enemy_board
            .iter()
            .map(|u| {
                instance_counter += 1;
                UnitView {
                    instance_id: UnitId::enemy(instance_counter),
                    template_id: u.card.template_id.clone(),
                    name: u.card.name.clone(),
                    attack: u.card.stats.attack,
                    health: u.current_health,
                    abilities: u.card.abilities.clone(),
                    is_token: u.card.is_token,
                }
            })
            .collect();

        self.last_battle_output = Some(BattleOutput {
            events,
            initial_player_units,
            initial_enemy_units,
        });

        log::info("=== BATTLE END ===");
    }
}

impl Default for GameEngine {
    fn default() -> Self {
        Self::new()
    }
}
