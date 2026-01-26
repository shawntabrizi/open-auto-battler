//! Game engine for browser WASM builds
//!
//! This module provides the main game engine exposed to JavaScript via wasm-bindgen.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec;
use alloc::vec::Vec;

use crate::battle::{resolve_battle, CombatEvent, UnitId, UnitView};
use crate::log;
use crate::commit::verify_and_apply_turn;
use crate::opponents::get_opponent_for_round;
use crate::rng::XorShiftRng;
use crate::state::*;
use crate::types::{BoardUnit, UnitCard};
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
    // Per-turn local tracking (transient, not persisted)
    current_mana: i32,
    hand_indices: Vec<usize>,
    hand_used: Vec<bool>,   // true = pitched or played
    hand_pitched: Vec<bool>, // true = pitched for mana
    hand_played: Vec<bool>,  // true = played to board
    board_pitched: Vec<usize>, // board slots that were pitched
    start_board: Vec<Option<BoardUnit>>, // board state at the start of the turn
}

#[wasm_bindgen]
impl GameEngine {
    /// Create a new game engine with a fresh game state
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        log::info("=== MANALIMIT ENGINE INITIALIZED ===");
        let mut engine = Self {
            state: GameState::new(42),
            last_battle_output: None,
            current_mana: 0,
            hand_indices: Vec::new(),
            hand_used: Vec::new(),
            hand_pitched: Vec::new(),
            hand_played: Vec::new(),
            board_pitched: Vec::new(),
            start_board: vec![None; BOARD_SIZE],
        };
        engine.initialize_bag();
        engine.start_planning_phase();
        engine.log_state();
        engine
    }

    /// Get the current game view as JSON
    #[wasm_bindgen]
    pub fn get_view(&self) -> JsValue {
        log::debug("get_view", "Serializing game state to view");
        let view = GameView::from_state(&self.state, self.current_mana, &self.hand_indices, &self.hand_used);
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

    /// Pitch a card from the hand to generate mana
    #[wasm_bindgen]
    pub fn pitch_hand_card(&mut self, hand_index: usize) -> Result<(), String> {
        log::action("pitch_hand_card", &format!("hand_index={}", hand_index));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        if hand_index >= self.hand_indices.len() {
            return Err("Invalid hand index".to_string());
        }

        if self.hand_used[hand_index] {
            return Err("Card already used this turn".to_string());
        }

        let bag_idx = self.hand_indices[hand_index];
        let pitch_value = self.state.bag[bag_idx].economy.pitch_value;

        self.current_mana = (self.current_mana + pitch_value).min(self.state.mana_limit);
        self.hand_used[hand_index] = true;
        self.hand_pitched[hand_index] = true;

        self.log_state();
        Ok(())
    }

    /// Play a card from the hand to a board slot
    #[wasm_bindgen]
    pub fn play_hand_card(&mut self, hand_index: usize, board_slot: usize) -> Result<(), String> {
        log::action(
            "play_hand_card",
            &format!("hand_index={}, board_slot={}", hand_index, board_slot),
        );
        if self.state.phase != GamePhase::Shop {
            return Err("Can only play during shop phase".to_string());
        }

        if hand_index >= self.hand_indices.len() {
            return Err("Invalid hand index".to_string());
        }

        if self.hand_used[hand_index] {
            return Err("Card already used this turn".to_string());
        }

        if board_slot >= BOARD_SIZE {
            return Err("Invalid board slot".to_string());
        }

        if self.state.board[board_slot].is_some() {
            return Err("Board slot is occupied".to_string());
        }

        let bag_idx = self.hand_indices[hand_index];
        let play_cost = self.state.bag[bag_idx].economy.play_cost;

        if self.current_mana < play_cost {
            return Err(format!(
                "Not enough mana: have {}, need {}",
                self.current_mana, play_cost
            ));
        }

        self.current_mana -= play_cost;
        self.hand_used[hand_index] = true;
        self.hand_played[hand_index] = true;

        // Place the card on the board
        let card = self.state.bag[bag_idx].clone();
        self.state.board[board_slot] = Some(BoardUnit::from_card(card));

        self.log_state();
        Ok(())
    }

    /// Buy a hand card and place it at a specific board slot (convenience for drag-and-drop)
    #[wasm_bindgen]
    pub fn buy_and_place(&mut self, hand_index: usize, board_slot: usize) -> Result<(), String> {
        self.play_hand_card(hand_index, board_slot)
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

        let pitch_value = unit.card.economy.pitch_value;
        self.current_mana = (self.current_mana + pitch_value).min(self.state.mana_limit);
        self.board_pitched.push(board_slot);

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

        // Build CommitTurnAction from local tracking
        let action = crate::types::CommitTurnAction {
            new_board: self.state.board.clone(),
            pitched_from_hand: self
                .hand_pitched
                .iter()
                .enumerate()
                .filter(|(_, &p)| p)
                .map(|(i, _)| i as u32)
                .collect(),
            played_from_hand: self
                .hand_played
                .iter()
                .enumerate()
                .filter(|(_, &p)| p)
                .map(|(i, _)| i as u32)
                .collect(),
            pitched_from_board: self.board_pitched.iter().map(|&i| i as u32).collect(),
        };

        // We must rollback board to start_board because verify_and_apply_turn expects
        // state as it was at the beginning of the turn.
        self.state.board = self.start_board.clone();

        // Use the centralized verification logic to apply the turn
        verify_and_apply_turn(&mut self.state, &action)
            .map_err(|e| format!("Turn verification failed: {:?}", e))?;

        self.current_mana = 0;
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
        self.state.phase = GamePhase::Shop;
        self.start_planning_phase();

        self.log_state();
        Ok(())
    }

    /// Start a new run (reset everything)
    #[wasm_bindgen]
    pub fn new_run(&mut self) {
        log::action("new_run", "Starting fresh run");
        self.state = GameState::new(42);
        self.last_battle_output = None;
        self.initialize_bag();
        self.start_planning_phase();
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
        self.start_planning_phase();
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

    fn initialize_bag(&mut self) {
        self.state.bag.clear();
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
                self.state.bag.push(card);
            }
        }
        // No shuffle needed for bag -- hand is derived via RNG
    }

    fn start_planning_phase(&mut self) {
        self.hand_indices = self.state.derive_hand_indices();
        let hand_size = self.hand_indices.len();
        self.hand_used = vec![false; hand_size];
        self.hand_pitched = vec![false; hand_size];
        self.hand_played = vec![false; hand_size];
        self.board_pitched = Vec::new();
        self.start_board = self.state.board.clone();
        self.current_mana = 0;
    }

    fn run_battle(&mut self) {
        log::info("=== BATTLE START ===");

        let player_board: Vec<BoardUnit> =
            self.state.board.iter().filter_map(|s| s.clone()).collect();

        let battle_seed = self.state.round as u64;
        let enemy_board = get_opponent_for_round(
            self.state.round,
            &mut self.state.next_card_id,
            battle_seed + 999,
        )
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
