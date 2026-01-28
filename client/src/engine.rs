//! Game engine for browser WASM builds
//!
//! This module provides the main game engine exposed to JavaScript via wasm-bindgen.

use std::format;
use std::string::{String, ToString};
use std::vec;
use std::vec::Vec;

use manalimit_core::battle::{resolve_battle, CombatEvent, CombatUnit, UnitView};
use manalimit_core::commit::verify_and_apply_turn;
use manalimit_core::log;
use manalimit_core::opponents::get_opponent_for_round;
use manalimit_core::rng::XorShiftRng;
use manalimit_core::state::*;
use manalimit_core::types::{BoardUnit, CardId, CommitTurnAction, UnitCard};
use manalimit_core::view::{CardView, GameView};
use manalimit_core::bounded::{BoundedLocalGameState, BoundedCardSet};
use bounded_collections::ConstU32;
use parity_scale_codec::Decode;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// These must match the blockchain runtime constants
type WasmMaxBagSize = ConstU32<100>;
type WasmMaxBoardSize = ConstU32<5>;
type WasmMaxHandActions = ConstU32<10>;
type WasmMaxAbilities = ConstU32<5>;
type WasmMaxStringLen = ConstU32<32>;

#[derive(Decode)]
struct WasmGameSession {
    state: BoundedLocalGameState<WasmMaxBagSize, WasmMaxBoardSize, WasmMaxHandActions>,
    set_id: u32,
    current_seed: u64,
    owner: [u8; 32],
}

/// Result of starting a battle (events for playback)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BattleOutput {
    pub events: Vec<CombatEvent>,
    pub initial_player_units: Vec<UnitView>,
    pub initial_enemy_units: Vec<UnitView>,
}

/// The main game engine exposed to WASM
#[wasm_bindgen]
pub struct GameEngine {
    state: GameState,
    set_id: u32,
    last_battle_output: Option<BattleOutput>,
    // Per-turn local tracking (transient, not persisted)
    current_mana: i32,
    hand_used: Vec<bool>,                // true = pitched or played
    hand_pitched: Vec<bool>,             // true = pitched for mana
    hand_played: Vec<bool>,              // true = played to board
    board_pitched: Vec<usize>,           // board slots that were pitched
    start_board: Vec<Option<BoardUnit>>, // board state at the start of the turn
}

#[wasm_bindgen]
impl GameEngine {
    /// Create a new game engine with an optional seed
    #[wasm_bindgen(constructor)]
    pub fn new(seed: Option<u64>) -> Self {
        log::info("=== MANALIMIT ENGINE INITIALIZED ===");
        let seed_val = seed.unwrap_or(42);
        let state = GameState::new(seed_val);
        let mut engine = Self {
            set_id: state.set_id,
            state,
            last_battle_output: None,
            current_mana: 0,
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

    /// Helper to get a card from the pool
    fn get_card(&self, id: CardId) -> &UnitCard {
        self.state
            .card_pool
            .get(&id)
            .expect("Card not found in pool")
    }

    /// Submit a turn action from JavaScript
    #[wasm_bindgen]
    pub fn submit_turn(&mut self, action_js: JsValue) -> Result<(), String> {
        log::action("submit_turn", "Applying turn action from JS");
        let action: manalimit_core::types::CommitTurnAction =
            serde_wasm_bindgen::from_value(action_js)
                .map_err(|e| format!("Failed to parse action: {:?}", e))?;

        // We must rollback board to start_board because verify_and_apply_turn expects
        // state as it was at the beginning of the turn.
        self.state.board = self.start_board.clone();

        verify_and_apply_turn(&mut self.state, &action)
            .map_err(|e| format!("Turn verification failed: {:?}", e))?;

        self.current_mana = 0;
        self.state.phase = GamePhase::Battle;
        self.run_battle();
        self.log_state();
        Ok(())
    }

    /// Get the current game view as JSON
    #[wasm_bindgen]
    pub fn get_view(&self) -> JsValue {
        log::debug("get_view", "Serializing game state to view");
        let view = GameView::from_state(&self.state, self.current_mana, &self.hand_used);
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
        log::action("pitch_hand_card", &format!("hand_index={}, hand_used_len={}", hand_index, self.hand_used.len()));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        let card_id = self
            .state
            .hand
            .get(hand_index)
            .ok_or("Invalid hand index")?;

        if hand_index < self.hand_used.len() && self.hand_used[hand_index] {
            return Err("Card already used this turn".to_string());
        }

        let pitch_value = self.get_card(*card_id).economy.pitch_value;

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

        let card_id = *self
            .state
            .hand
            .get(hand_index)
            .ok_or("Invalid hand index")?;

        if self.hand_used[hand_index] {
            return Err("Card already used this turn".to_string());
        }

        if board_slot >= BOARD_SIZE {
            return Err("Invalid board slot".to_string());
        }

        if self.state.board[board_slot].is_some() {
            return Err("Board slot is occupied".to_string());
        }

        let (play_cost, health) = {
            let card = self.get_card(card_id);
            (card.economy.play_cost, card.stats.health)
        };

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
        self.state.board[board_slot] = Some(BoardUnit::new(card_id, health));

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

        let card_id = unit.card_id;
        let pitch_value = self.get_card(card_id).economy.pitch_value;
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
        let action = manalimit_core::types::CommitTurnAction {
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
        self.state.draw_hand();
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

    // ========================================================================
    // Universal JSON String Bridge Methods
    // These methods bypass wasm-bindgen's JsValue recursion limits by using
    // plain JSON strings for all complex data transfer.
    // ========================================================================

    /// Initialize the game engine from a JSON string (Universal JSON Bridge)
    /// Use this instead of set_state to avoid Stack Overflow and Recursive Aliasing crashes.
    #[wasm_bindgen]
    pub fn init_from_json(&mut self, json: String, seed: u64) -> Result<(), String> {
        log::action(
            "init_from_json",
            &format!("Initializing engine from JSON string (len={})", json.len()),
        );

        let mut state: GameState = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse JSON state: {:?}", e))?;

        state.local_state.game_seed = seed;
        self.set_id = state.set_id;
        self.state = state;
        self.start_planning_phase();
        Ok(())
    }

    /// Initialize the game engine from SCALE bytes (Universal SCALE Bridge)
    #[wasm_bindgen]
    pub fn init_from_scale(&mut self, session_scale: Vec<u8>, card_set_scale: Vec<u8>) -> Result<(), String> {
        log::action(
            "init_from_scale",
            &format!(
                "Initializing engine from SCALE bytes (session={}, card_set={})",
                session_scale.len(),
                card_set_scale.len()
            ),
        );

        let session = WasmGameSession::decode(&mut &session_scale[..])
            .map_err(|e| format!("Failed to decode WasmGameSession: {:?}", e))?;

        let card_set_bounded = BoundedCardSet::<WasmMaxBagSize, WasmMaxAbilities, WasmMaxStringLen>::decode(&mut &card_set_scale[..])
            .map_err(|e| format!("Failed to decode BoundedCardSet: {:?}", e))?;

        let card_set: manalimit_core::state::CardSet = card_set_bounded.into();
        let local_state: manalimit_core::state::LocalGameState = session.state.into();

        let mut state = GameState::reconstruct(card_set.card_pool, session.set_id, local_state);
        
        // Ensure the current_seed from session is applied to local_state
        state.local_state.game_seed = session.current_seed;

        self.state = state;
        self.set_id = self.state.set_id;
        self.start_planning_phase();
        Ok(())
    }

    /// Get the current game view as a JSON string (Hot Path)
    #[wasm_bindgen]
    pub fn get_view_json(&self) -> String {
        let view = GameView::from_state(&self.state, self.current_mana, &self.hand_used);
        serde_json::to_string(&view).unwrap_or_else(|_| "{}".to_string())
    }

    /// Get the full bag as a JSON string (Cold Path - on demand only)
    #[wasm_bindgen]
    pub fn get_full_bag_json(&self) -> String {
        let bag_views: Vec<CardView> = self
            .state
            .bag
            .iter()
            .map(|id| CardView::from(self.get_card(*id)))
            .collect();
        serde_json::to_string(&bag_views).unwrap_or_else(|_| "[]".to_string())
    }

    /// Execute an action from a JSON string and return updated view (Universal JSON Bridge)
    #[wasm_bindgen]
    pub fn execute_action_json(&mut self, action_json: String) -> Result<String, String> {
        #[derive(Deserialize)]
        #[serde(tag = "type")]
        enum GameAction {
            PitchHandCard {
                hand_index: usize,
            },
            PlayHandCard {
                hand_index: usize,
                board_slot: usize,
            },
            SwapBoardPositions {
                slot_a: usize,
                slot_b: usize,
            },
            PitchBoardUnit {
                board_slot: usize,
            },
            EndTurn,
            ContinueAfterBattle,
            NewRun,
        }

        let action: GameAction = serde_json::from_str(&action_json)
            .map_err(|e| format!("Failed to parse action JSON: {:?}", e))?;

        match action {
            GameAction::PitchHandCard { hand_index } => self.pitch_hand_card(hand_index)?,
            GameAction::PlayHandCard {
                hand_index,
                board_slot,
            } => self.play_hand_card(hand_index, board_slot)?,
            GameAction::SwapBoardPositions { slot_a, slot_b } => {
                self.swap_board_positions(slot_a, slot_b)?
            }
            GameAction::PitchBoardUnit { board_slot } => self.pitch_board_unit(board_slot)?,
            GameAction::EndTurn => self.end_turn()?,
            GameAction::ContinueAfterBattle => self.continue_after_battle()?,
            GameAction::NewRun => self.new_run(),
        }

        Ok(self.get_view_json())
    }

    /// Get the battle output as a JSON string
    #[wasm_bindgen]
    pub fn get_battle_output_json(&self) -> String {
        match &self.last_battle_output {
            Some(output) => serde_json::to_string(output).unwrap_or_else(|_| "null".to_string()),
            None => "null".to_string(),
        }
    }

    /// Get the commit action as a JSON string
    #[wasm_bindgen]
    pub fn get_commit_action_json(&self) -> String {
        let action = CommitTurnAction {
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
        serde_json::to_string(&action).unwrap_or_else(|_| "{}".to_string())
    }
}

// Private implementation methods
impl GameEngine {
    fn log_state(&self) {
        log::debug("STATE", &format!("{:?}", self.state));
    }

    fn initialize_bag(&mut self) {
        self.state.local_state.bag.clear();
        self.state.card_pool.clear();
        
        // Use get_card_set to populate pool
        use manalimit_core::units::{get_card_set, create_genesis_bag};
        if let Some(card_set) = get_card_set(self.set_id) {
            self.state.card_pool = card_set.card_pool;
        }

        // Generate random bag of 100 cards from the set
        self.state.local_state.bag = create_genesis_bag(self.set_id, self.state.game_seed);
        
        // Set next_card_id to be after templates
        self.state.local_state.next_card_id = 1000; 

        // Draw initial hand once bag is ready
        self.state.draw_hand();
    }

    fn start_planning_phase(&mut self) {
        // If hand is empty, draw it (should have been drawn by initialize_bag or continue_after_battle)
        if self.state.hand.is_empty() {
            self.state.draw_hand();
        }

        let hand_size = self.state.hand.len();
        self.hand_used = vec![false; hand_size];
        self.hand_pitched = vec![false; hand_size];
        self.hand_played = vec![false; hand_size];
        self.board_pitched = Vec::new();
        self.start_board = self.state.board.clone();
        self.current_mana = 0;
    }

    fn run_battle(&mut self) {
        log::info("=== BATTLE START ===");

        let player_units: Vec<CombatUnit> = self
            .state
            .board
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                let mut cu = CombatUnit::from_card(card.clone());
                cu.health = u.current_health.max(0);
                cu
            })
            .collect();

        let battle_seed = self.state.round as u64;
        let enemy_units = get_opponent_for_round(
            self.state.round,
            &mut self.state.next_card_id,
            battle_seed + 999,
        )
        .expect("Failed to generate opponent for round");

        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        let events = resolve_battle(player_units, enemy_units, &mut rng);

        if let Some(CombatEvent::BattleEnd { result }) = events.last() {
            match result {
                manalimit_core::battle::BattleResult::Victory => self.state.wins += 1,
                manalimit_core::battle::BattleResult::Defeat => self.state.lives -= 1,
                _ => {} // DRAW
            }
            log::info(&format!("Battle Result: {:?}", result));
        }

        // Generate initial views for UI
        let mut limits = manalimit_core::limits::BattleLimits::new();
        let initial_player_units: Vec<UnitView> = self
            .state
            .board
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                UnitView {
                    instance_id: limits.generate_instance_id(manalimit_core::limits::Team::Player),
                    template_id: card.template_id.clone(),
                    name: card.name.clone(),
                    attack: card.stats.attack,
                    health: u.current_health,
                    abilities: card.abilities.clone(),
                    is_token: card.is_token,
                }
            })
            .collect();

        limits.reset_phase_counters(); // Reset for enemy
        let mut enemy_instance_counter = 0;
        let initial_enemy_units: Vec<UnitView> = get_opponent_for_round(
            self.state.round,
            &mut enemy_instance_counter, // Dummy counter to get same results
            battle_seed + 999,
        )
        .unwrap()
        .into_iter()
        .map(|cu| UnitView {
            instance_id: limits.generate_instance_id(manalimit_core::limits::Team::Enemy),
            template_id: cu.template_id,
            name: cu.name,
            attack: cu.attack,
            health: cu.health,
            abilities: cu.abilities,
            is_token: cu.is_token,
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
        Self::new(Some(42))
    }
}
