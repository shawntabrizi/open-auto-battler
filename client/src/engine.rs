//! Game engine for browser WASM builds
//!
//! This module provides the main game engine exposed to JavaScript via wasm-bindgen.

use std::format;
use std::string::{String, ToString};
use std::vec;
use std::vec::Vec;

use bounded_collections::ConstU32;
use oab_core::battle::{
    player_permanent_stat_deltas_from_events, player_shop_mana_delta_from_events, resolve_battle,
    CombatEvent, CombatUnit, UnitId, UnitView,
};
use oab_core::bounded::{BoundedCardSet, BoundedLocalGameState};
use oab_core::commit::{
    apply_on_buy_triggers, apply_on_sell_triggers, apply_shop_start_triggers, verify_and_apply_turn,
};
use oab_core::log;
use oab_core::opponents::get_opponent_for_round;
use oab_core::rng::XorShiftRng;
use oab_core::state::*;
use oab_core::types::{BoardUnit, CardId, CommitTurnAction, TurnAction, UnitCard};
use oab_core::view::{CardView, GameView};
use parity_scale_codec::Decode;
use parity_scale_codec::Encode;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// These must match the blockchain runtime constants
type WasmMaxBagSize = ConstU32<50>;
type WasmMaxBoardSize = ConstU32<5>;
type WasmMaxHandActions = ConstU32<10>;
type WasmMaxSetSize = ConstU32<100>;

/// Result of starting a battle (events for playback)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BattleOutput {
    pub events: Vec<CombatEvent>,
    pub initial_player_units: Vec<UnitView>,
    pub initial_enemy_units: Vec<UnitView>,
    pub round: u32, // The round this battle was for (for display during animation)
}

/// Snapshot of turn state for undo functionality
#[derive(Clone)]
struct TurnSnapshot {
    mana: i32,
    hand_used: Vec<bool>,
    action_log: Vec<TurnAction>,
    board: Vec<Option<BoardUnit>>,
}

/// The main game engine exposed to WASM
#[wasm_bindgen]
pub struct GameEngine {
    state: GameState,
    set_id: u32,
    card_set: Option<CardSet>, // Loaded card set for bag generation
    last_battle_output: Option<BattleOutput>,
    starting_lives: i32,
    wins_to_victory: i32,
    // Per-turn local tracking (transient, not persisted)
    hand_used: Vec<bool>,                // true = pitched or played
    action_log: Vec<TurnAction>,         // Ordered list of actions taken this turn
    start_board: Vec<Option<BoardUnit>>, // board state at the start of the turn
    start_shop_mana: i32,                // mana state at the start of the turn
    undo_history: Vec<TurnSnapshot>,     // Stack of snapshots for undo
    custom_sets: std::collections::HashMap<u32, CardSet>, // Blockchain sets injected via add_set
}

#[wasm_bindgen]
impl GameEngine {
    /// Create a new game engine with an optional seed
    #[wasm_bindgen(constructor)]
    pub fn new(seed: Option<u64>) -> Self {
        log::info("=== OAB ENGINE INITIALIZED ===");

        // If we are about to be initialized via SCALE, we don't want to waste
        // memory/cycles setting up a full game state that will be dropped.
        let state = GameState::empty();

        let mut engine = Self {
            set_id: 0,
            state,
            card_set: None,
            last_battle_output: None,
            starting_lives: STARTING_LIVES,
            wins_to_victory: WINS_TO_VICTORY,
            hand_used: Vec::new(),
            action_log: Vec::new(),
            start_board: vec![None; BOARD_SIZE],
            start_shop_mana: 0,
            undo_history: Vec::new(),
            custom_sets: std::collections::HashMap::new(),
        };

        // Only initialize fully if a seed was actually provided (manual local start)
        // Otherwise, we wait for init_from_scale
        if let Some(seed_val) = seed {
            log::debug("new", "Seed provided, performing full initialization");
            engine.state.game_seed = seed_val;
            engine.state.mana_limit = STARTING_MANA_LIMIT;
            engine.state.round = 1;
            engine.state.lives = STARTING_LIVES;
            engine.initialize_bag();
            apply_shop_start_triggers(&mut engine.state);
            engine.start_planning_phase();
        }

        engine
    }

    /// Load cards and sets from statically compiled card data.
    /// Must be called before new_run() or init_from_scale().
    #[wasm_bindgen]
    pub fn load_card_set(&mut self, set_id: u32) -> Result<(), String> {
        use oab_core::cards::{build_card_pool, get_all_sets};

        log::action(
            "load_card_set",
            &format!("Loading cards for set_id={}", set_id),
        );

        let card_pool = build_card_pool();
        let card_set = if let Some(custom) = self.custom_sets.get(&set_id) {
            custom.clone()
        } else {
            let sets = get_all_sets();
            sets.into_iter()
                .nth(set_id as usize)
                .ok_or_else(|| format!("Set {} not found", set_id))?
        };

        let num_cards = card_pool.len();
        self.state.card_pool = card_pool;
        self.card_set = Some(card_set);
        self.set_id = set_id;

        log::info(&format!("Loaded {} cards, set_id={}", num_cards, set_id));
        Ok(())
    }

    /// Get card metadata (id, name, emoji) for all cards.
    /// Used by the frontend to build the emoji display map.
    #[wasm_bindgen]
    pub fn get_card_metas(&self) -> JsValue {
        let metas = oab_core::cards::get_all_card_metas();
        serde_wasm_bindgen::to_value(&metas).unwrap_or(JsValue::NULL)
    }

    /// Get set metadata (id, name) for all sets.
    /// Used by the frontend for set selection screen.
    #[wasm_bindgen]
    pub fn get_set_metas(&self) -> JsValue {
        let metas = oab_core::cards::get_all_set_metas();
        serde_wasm_bindgen::to_value(&metas).unwrap_or(JsValue::NULL)
    }

    /// Get all cards in a set as CardView[] without mutating engine state.
    /// Used for set preview before starting a game.
    /// Checks custom (blockchain) sets first, then falls back to genesis sets.
    #[wasm_bindgen]
    pub fn get_set_cards(&self, set_id: u32) -> Result<JsValue, String> {
        use oab_core::cards::{build_card_pool, get_all_sets};
        use oab_core::view::CardView;

        let card_set = if let Some(custom) = self.custom_sets.get(&set_id) {
            custom.clone()
        } else {
            let sets = get_all_sets();
            sets.into_iter()
                .nth(set_id as usize)
                .ok_or_else(|| format!("Set {} not found", set_id))?
        };

        // Use the engine's card pool (includes blockchain cards) with genesis as fallback
        let genesis_pool = build_card_pool();
        let card_views: Vec<CardView> = card_set
            .cards
            .iter()
            .filter_map(|entry| {
                self.state
                    .card_pool
                    .get(&entry.card_id)
                    .or_else(|| genesis_pool.get(&entry.card_id))
                    .map(CardView::from)
            })
            .collect();

        serde_wasm_bindgen::to_value(&card_views)
            .map_err(|e| format!("Serialization failed: {:?}", e))
    }

    /// Add a card set to the engine.
    /// Used by the frontend to inject blockchain sets for preview/play.
    #[wasm_bindgen]
    pub fn add_set(&mut self, set_id: u32, cards_js: JsValue) -> Result<(), String> {
        let entries: Vec<oab_core::state::CardSetEntry> = serde_wasm_bindgen::from_value(cards_js)
            .map_err(|e| format!("Failed to parse set entries: {:?}", e))?;
        let card_set = CardSet { cards: entries };
        self.custom_sets.insert(set_id, card_set);
        Ok(())
    }

    /// Add a card to the engine's card pool.
    /// Used by the frontend to inject custom blockchain cards that aren't in the
    /// statically compiled genesis set.
    #[wasm_bindgen]
    pub fn add_card(&mut self, card_js: JsValue) -> Result<(), String> {
        let card: UnitCard = serde_wasm_bindgen::from_value(card_js)
            .map_err(|e| format!("Failed to parse card: {:?}", e))?;
        log::debug("add_card", &format!("Adding card {} to pool", card.id.0));
        self.state.card_pool.insert(card.id, card);
        Ok(())
    }

    /// Helper to get a card from the pool
    fn get_card(&self, id: CardId) -> &UnitCard {
        self.state
            .card_pool
            .get(&id)
            .expect("Card not found in pool")
    }

    /// Submit a turn action from JavaScript (JSON format)
    #[wasm_bindgen]
    pub fn submit_turn(&mut self, action_js: JsValue) -> Result<(), String> {
        log::action("submit_turn", "Applying turn action from JS");
        let action: CommitTurnAction = serde_wasm_bindgen::from_value(action_js)
            .map_err(|e| format!("Failed to parse action: {:?}", e))?;

        // We must rollback board to start_board because verify_and_apply_turn expects
        // state as it was at the beginning of the turn.
        self.state.board = self.start_board.clone();
        self.state.shop_mana = self.start_shop_mana;

        verify_and_apply_turn(&mut self.state, &action)
            .map_err(|e| format!("Turn verification failed: {:?}", e))?;

        // Leftover shop mana never carries naturally; only battle GainMana should.
        self.state.shop_mana = 0;
        self.state.phase = GamePhase::Battle;
        self.run_battle();
        self.log_state();
        Ok(())
    }

    /// Get the current commit action as SCALE-encoded bytes for on-chain submission
    #[wasm_bindgen]
    pub fn get_commit_action_scale(&self) -> Vec<u8> {
        let action = CommitTurnAction {
            actions: self.action_log.clone(),
        };
        action.encode()
    }

    /// Get the current commit action as JSON (for debugging/display)
    #[wasm_bindgen]
    pub fn get_commit_action(&self) -> JsValue {
        let action = CommitTurnAction {
            actions: self.action_log.clone(),
        };
        serde_wasm_bindgen::to_value(&action).unwrap_or(JsValue::NULL)
    }

    /// Get the current game view as JSON
    #[wasm_bindgen]
    pub fn get_view(&self) -> JsValue {
        log::debug("get_view", "Serializing game state to view");
        let can_undo = !self.undo_history.is_empty();
        let view =
            GameView::from_state(&self.state, self.state.shop_mana, &self.hand_used, can_undo);
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

    /// Get the full bag as a list of Card IDs (Cold Path - on demand only)
    #[wasm_bindgen]
    pub fn get_bag(&self) -> JsValue {
        match serde_wasm_bindgen::to_value(&self.state.bag) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("get_bag serialization failed: {:?}", e));
                JsValue::NULL
            }
        }
    }

    /// Get all unique cards in the current set/pool
    #[wasm_bindgen]
    pub fn get_card_set(&self) -> JsValue {
        let card_views: Vec<CardView> = self.state.card_pool.values().map(CardView::from).collect();
        match serde_wasm_bindgen::to_value(&card_views) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("get_card_set serialization failed: {:?}", e));
                JsValue::NULL
            }
        }
    }

    /// Pitch a card from the hand to generate mana
    #[wasm_bindgen]
    pub fn pitch_hand_card(&mut self, hand_index: usize) -> Result<(), String> {
        log::action(
            "pitch_hand_card",
            &format!(
                "hand_index={}, hand_used_len={}",
                hand_index,
                self.hand_used.len()
            ),
        );
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

        self.save_snapshot();
        self.state.shop_mana = (self.state.shop_mana + pitch_value).min(self.state.mana_limit);
        self.hand_used[hand_index] = true;
        self.action_log.push(TurnAction::PitchFromHand {
            hand_index: hand_index as u32,
        });

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

        let play_cost = {
            let card = self.get_card(card_id);
            card.economy.play_cost
        };

        if self.state.shop_mana < play_cost {
            return Err(format!(
                "Not enough mana: have {}, need {}",
                self.state.shop_mana, play_cost
            ));
        }

        self.save_snapshot();
        self.state.shop_mana -= play_cost;
        self.hand_used[hand_index] = true;
        self.action_log.push(TurnAction::PlayFromHand {
            hand_index: hand_index as u32,
            board_slot: board_slot as u32,
        });

        // Place the card on the board
        self.state.board[board_slot] = Some(BoardUnit::new(card_id));
        let action_index = self.action_log.len().saturating_sub(1);
        apply_on_buy_triggers(&mut self.state, action_index, board_slot);

        self.log_state();
        Ok(())
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

        self.save_snapshot();
        self.state.board.swap(slot_a, slot_b);
        self.action_log.push(TurnAction::SwapBoard {
            slot_a: slot_a as u32,
            slot_b: slot_b as u32,
        });
        Ok(())
    }

    /// Pitch a unit from the board
    #[wasm_bindgen]
    pub fn pitch_board_unit(&mut self, board_slot: usize) -> Result<(), String> {
        log::action("pitch_board_unit", &format!("slot={}", board_slot));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only pitch during shop phase".to_string());
        }

        // Check slot is occupied before saving snapshot
        if self
            .state
            .board
            .get(board_slot)
            .map(|s| s.is_none())
            .unwrap_or(true)
        {
            return Err("Board slot is empty".to_string());
        }

        self.save_snapshot();

        let unit = self
            .state
            .board
            .get_mut(board_slot)
            .and_then(|s| s.take())
            .expect("Board slot should be occupied");

        let card_id = unit.card_id;
        let pitch_value = self.get_card(card_id).economy.pitch_value;
        self.state.shop_mana = (self.state.shop_mana + pitch_value).min(self.state.mana_limit);
        self.action_log.push(TurnAction::PitchFromBoard {
            board_slot: board_slot as u32,
        });
        let action_index = self.action_log.len().saturating_sub(1);
        apply_on_sell_triggers(&mut self.state, action_index, card_id, board_slot);

        self.log_state();
        Ok(())
    }

    /// Undo the last action taken this turn
    #[wasm_bindgen]
    pub fn undo(&mut self) -> Result<(), String> {
        log::action("undo", "Reverting to previous state");
        if self.state.phase != GamePhase::Shop {
            return Err("Can only undo during shop phase".to_string());
        }

        let snapshot = self.undo_history.pop().ok_or("Nothing to undo")?;

        self.state.shop_mana = snapshot.mana;
        self.hand_used = snapshot.hand_used;
        self.action_log = snapshot.action_log;
        self.state.board = snapshot.board;

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

        // Build CommitTurnAction from the action log
        let action = CommitTurnAction {
            actions: self.action_log.clone(),
        };

        // We must rollback board to start_board because verify_and_apply_turn expects
        // state as it was at the beginning of the turn.
        self.state.board = self.start_board.clone();
        self.state.shop_mana = self.start_shop_mana;

        // Use the centralized verification logic to apply the turn
        verify_and_apply_turn(&mut self.state, &action)
            .map_err(|e| format!("Turn verification failed: {:?}", e))?;

        // Leftover shop mana never carries naturally; only battle GainMana should.
        self.state.shop_mana = 0;
        self.state.phase = GamePhase::Battle;
        self.run_battle();
        self.log_state();
        Ok(())
    }

    /// Continue after battle (go to next shop phase or end game)
    /// Idempotent: if already in Shop phase (e.g., after blockchain sync), this is a no-op.
    #[wasm_bindgen]
    pub fn continue_after_battle(&mut self) -> Result<(), String> {
        log::action("continue_after_battle", "Processing battle result");

        // If already in Shop phase (e.g., after blockchain sync where battle was resolved on-chain),
        // this is a no-op. The hand should already be drawn and planning phase started.
        if self.state.phase == GamePhase::Shop {
            log::debug(
                "continue_after_battle",
                "Already in Shop phase, skipping (idempotent)",
            );
            return Ok(());
        }

        if self.state.phase != GamePhase::Battle {
            return Err("Not in battle phase".to_string());
        }

        if self.state.wins >= self.wins_to_victory {
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
        apply_shop_start_triggers(&mut self.state);
        self.start_planning_phase();

        self.log_state();
        Ok(())
    }

    /// Start a new run with a seed (required for deterministic gameplay)
    #[wasm_bindgen]
    pub fn new_run(&mut self, seed: u64) {
        log::action("new_run", &format!("Starting run with seed {}", seed));
        // Preserve card_pool when resetting state
        let card_pool = std::mem::take(&mut self.state.card_pool);
        self.state = GameState::new(seed);
        self.state.card_pool = card_pool;
        self.last_battle_output = None;
        self.starting_lives = STARTING_LIVES;
        self.wins_to_victory = WINS_TO_VICTORY;
        self.initialize_bag();
        apply_shop_start_triggers(&mut self.state);
        self.start_planning_phase();
        self.log_state();
    }

    /// Start a new P2P run with a custom number of lives.
    /// Victory condition becomes wins >= lives (symmetric resolution).
    #[wasm_bindgen]
    pub fn new_run_p2p(&mut self, seed: u64, lives: i32) {
        let lives = lives.max(1).min(10);
        self.new_run(seed);
        self.state.lives = lives;
        self.starting_lives = lives;
        self.wins_to_victory = lives;
    }

    #[wasm_bindgen]
    pub fn get_starting_lives(&self) -> i32 {
        self.starting_lives
    }

    #[wasm_bindgen]
    pub fn get_wins_to_victory(&self) -> i32 {
        self.wins_to_victory
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

    /// Get just the board state as JSON (for P2P battle sync)
    #[wasm_bindgen]
    pub fn get_board(&self) -> JsValue {
        match serde_wasm_bindgen::to_value(&self.state.board) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("get_board serialization failed: {:?}", e));
                JsValue::NULL
            }
        }
    }

    /// Resolve a P2P battle between two player boards.
    /// This is a self-contained method that:
    /// 1. Sets phase to Battle
    /// 2. Runs the battle simulation
    /// 3. Applies wins/lives result
    /// 4. Returns battle output for animation
    /// After animation, call continue_after_battle() to advance to next round.
    #[wasm_bindgen]
    pub fn resolve_battle_p2p(
        &mut self,
        player_board_js: JsValue,
        enemy_board_js: JsValue,
        seed: u64,
    ) -> JsValue {
        log::info("=== P2P BATTLE START ===");

        // Set phase to Battle
        self.state.shop_mana = 0;
        self.state.phase = GamePhase::Battle;

        // Parse boards from JS
        let player_board: Vec<Option<BoardUnit>> =
            serde_wasm_bindgen::from_value(player_board_js).unwrap_or_default();
        let enemy_board: Vec<Option<BoardUnit>> =
            serde_wasm_bindgen::from_value(enemy_board_js).unwrap_or_default();
        let player_slots: Vec<usize> = player_board
            .iter()
            .enumerate()
            .filter_map(|(slot, unit)| unit.as_ref().map(|_| slot))
            .collect();

        // Convert player board to CombatUnits
        let player_units: Vec<CombatUnit> = player_board
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = u.perm_attack;
                cu.health_buff = u.perm_health;
                cu.health = cu.health.saturating_add(u.perm_health).max(0);
                cu
            })
            .collect();

        // Convert enemy board to CombatUnits
        let enemy_units: Vec<CombatUnit> = enemy_board
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = u.perm_attack;
                cu.health_buff = u.perm_health;
                cu.health = cu.health.saturating_add(u.perm_health).max(0);
                cu
            })
            .collect();

        // Run the battle with deterministic RNG
        let mut rng = XorShiftRng::seed_from_u64(seed);
        let events = resolve_battle(
            player_units.clone(),
            enemy_units.clone(),
            &mut rng,
            &self.state.card_pool,
        );

        // Generate initial views for UI animation
        let mut limits = oab_core::limits::BattleLimits::new();
        let initial_player_units: Vec<UnitView> = player_board
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                UnitView {
                    instance_id: limits.generate_instance_id(oab_core::limits::Team::Player),
                    card_id: card.id,
                    name: card.name.clone(),
                    attack: card.stats.attack.saturating_add(u.perm_attack),
                    health: card.stats.health.saturating_add(u.perm_health),
                    abilities: card.abilities.clone(),
                }
            })
            .collect();

        limits.reset_phase_counters();
        let initial_enemy_units: Vec<UnitView> = enemy_board
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                UnitView {
                    instance_id: limits.generate_instance_id(oab_core::limits::Team::Enemy),
                    card_id: card.id,
                    name: card.name.clone(),
                    attack: card.stats.attack.saturating_add(u.perm_attack),
                    health: card.stats.health.saturating_add(u.perm_health),
                    abilities: card.abilities.clone(),
                }
            })
            .collect();

        // Apply the battle result (wins/lives)
        if let Some(CombatEvent::BattleEnd { result }) = events.last() {
            match result {
                oab_core::battle::BattleResult::Victory => self.state.wins += 1,
                oab_core::battle::BattleResult::Defeat => self.state.lives -= 1,
                _ => {} // Draw
            }
            log::info(&format!("P2P Battle Result: {:?}", result));
        }
        self.state.shop_mana = player_shop_mana_delta_from_events(&events).max(0);
        let permanent_deltas = player_permanent_stat_deltas_from_events(&events);
        self.apply_player_permanent_stat_deltas(&player_slots, &permanent_deltas);

        // Note: Round advancement happens when continue_after_battle() is called
        // This keeps P2P flow consistent with single-player flow

        let output = BattleOutput {
            events,
            initial_player_units,
            initial_enemy_units,
            round: self.state.round as u32,
        };

        self.last_battle_output = Some(output.clone());

        log::info("=== P2P BATTLE END ===");

        match serde_wasm_bindgen::to_value(&output) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("resolve_battle_p2p serialization failed: {:?}", e));
                JsValue::NULL
            }
        }
    }

    // ========================================================================
    // Universal Bridge Methods
    // ========================================================================

    /// Initialize the game engine from SCALE bytes (Universal SCALE Bridge)
    #[wasm_bindgen]
    pub fn init_from_scale(
        &mut self,
        session_scale: Vec<u8>,
        card_set_scale: Vec<u8>,
    ) -> Result<(), String> {
        log::action(
            "init_from_scale",
            &format!(
                "Initializing engine from SCALE bytes (session_len={}, card_set_len={})",
                session_scale.len(),
                card_set_scale.len()
            ),
        );

        // Defensive checks for empty input
        if session_scale.is_empty() {
            return Err("Empty session data".to_string());
        }
        if card_set_scale.is_empty() {
            return Err("Empty card set data".to_string());
        }

        // Step-by-step decoding for debugging
        let mut session_slice = &session_scale[..];

        log::debug("init_from_scale", "Decoding BoundedLocalGameState...");
        let state_bounded =
            BoundedLocalGameState::<WasmMaxBagSize, WasmMaxBoardSize, WasmMaxHandActions>::decode(
                &mut session_slice,
            )
            .map_err(|e| format!("Failed to decode BoundedLocalGameState: {:?}", e))?;

        log::debug("init_from_scale", "Decoding set_id...");
        let set_id = u32::decode(&mut session_slice)
            .map_err(|e| format!("Failed to decode set_id: {:?}", e))?;

        log::debug("init_from_scale", "Decoding owner...");
        let _owner = <[u8; 32]>::decode(&mut session_slice)
            .map_err(|e| format!("Failed to decode owner: {:?}", e))?;

        // Check for trailing bytes
        if !session_slice.is_empty() {
            log::debug(
                "init_from_scale",
                &format!(
                    "Warning: {} bytes remaining in session_scale after decode",
                    session_slice.len()
                ),
            );
        }

        log::debug("init_from_scale", "Decoding BoundedCardSet...");
        let card_set_bounded = BoundedCardSet::<WasmMaxSetSize>::decode(&mut &card_set_scale[..])
            .map_err(|e| format!("Failed to decode BoundedCardSet: {:?}", e))?;

        log::debug(
            "init_from_scale",
            "Converting bounded types to core types...",
        );
        let _card_set: oab_core::state::CardSet = card_set_bounded.into();
        let local_state: oab_core::state::LocalGameState = state_bounded.into();

        log::debug("init_from_scale", "Reconstructing GameState...");
        // Use the card pool already loaded via load_card_set()
        let card_pool = std::mem::take(&mut self.state.card_pool);

        let state = GameState::reconstruct(card_pool, set_id, local_state);

        log::debug("init_from_scale", "Reconstructing done...");

        // Safety: Replace state and let old one drop.
        // If drop crashes, it means the old state (placeholder) was corrupted
        // or the allocator is in a bad state.
        self.state = state;
        log::debug("init_from_scale", "state assigned...");

        self.set_id = self.state.set_id;
        log::debug("init_from_scale", "set_id assigned...");

        log::debug("init_from_scale", "starting planning phase...");
        self.start_planning_phase();

        log::info("init_from_scale completed successfully");
        Ok(())
    }
}

// Private implementation methods
impl GameEngine {
    fn log_state(&self) {
        // log::debug("STATE", &format!("{:?}", self.state));
    }

    /// Save current state to undo history before making a change
    fn save_snapshot(&mut self) {
        self.undo_history.push(TurnSnapshot {
            mana: self.state.shop_mana,
            hand_used: self.hand_used.clone(),
            action_log: self.action_log.clone(),
            board: self.state.board.clone(),
        });
    }

    fn initialize_bag(&mut self) {
        use oab_core::units::create_starting_bag;

        self.state.local_state.bag.clear();

        if let Some(card_set) = &self.card_set {
            // Generate random bag of 100 cards from the already-loaded set
            self.state.local_state.bag = create_starting_bag(card_set, self.state.game_seed);
        }

        // Set next_card_id to be after card definitions
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
        self.action_log = Vec::new();
        self.start_board = self.state.board.clone();
        self.state.shop_mana = self.state.shop_mana.clamp(0, self.state.mana_limit);
        self.start_shop_mana = self.state.shop_mana;
        self.undo_history.clear();
    }

    fn apply_player_permanent_stat_deltas(
        &mut self,
        player_slots: &[usize],
        deltas: &std::collections::BTreeMap<UnitId, (i32, i32)>,
    ) {
        for (unit_id, (attack_delta, health_delta)) in deltas {
            let unit_index = unit_id.raw() as usize;
            if unit_index == 0 || unit_index > player_slots.len() {
                continue;
            }

            let slot = player_slots[unit_index - 1];

            let unit_state =
                self.state
                    .board
                    .get_mut(slot)
                    .and_then(|s| s.as_mut())
                    .map(|board_unit| {
                        board_unit.perm_attack =
                            board_unit.perm_attack.saturating_add(*attack_delta);
                        board_unit.perm_health =
                            board_unit.perm_health.saturating_add(*health_delta);
                        (board_unit.card_id, board_unit.perm_health)
                    });

            let should_remove = unit_state
                .and_then(|(card_id, perm_health)| {
                    self.state
                        .card_pool
                        .get(&card_id)
                        .map(|card| card.stats.health.saturating_add(perm_health) <= 0)
                })
                .unwrap_or(false);

            if should_remove {
                self.state.board[slot] = None;
            }
        }
    }

    fn run_battle(&mut self) {
        log::info("=== BATTLE START ===");
        let board_before_battle = self.state.board.clone();

        let mut player_slots = Vec::new();
        let player_units: Vec<CombatUnit> = self
            .state
            .board
            .iter()
            .enumerate()
            .filter_map(|(slot, unit)| {
                let u = unit.as_ref()?;
                player_slots.push(slot);
                let card = self.get_card(u.card_id);
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = u.perm_attack;
                cu.health_buff = u.perm_health;
                cu.health = cu.health.saturating_add(u.perm_health).max(0);
                Some(cu)
            })
            .collect();

        let battle_seed = self.state.round as u64;
        let enemy_units =
            get_opponent_for_round(self.state.round, battle_seed + 999, &self.state.card_pool)
                .expect("Failed to generate opponent for round");

        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        let events = resolve_battle(player_units, enemy_units, &mut rng, &self.state.card_pool);
        self.state.shop_mana = player_shop_mana_delta_from_events(&events).max(0);
        let permanent_deltas = player_permanent_stat_deltas_from_events(&events);
        self.apply_player_permanent_stat_deltas(&player_slots, &permanent_deltas);

        if let Some(CombatEvent::BattleEnd { result }) = events.last() {
            match result {
                oab_core::battle::BattleResult::Victory => self.state.wins += 1,
                oab_core::battle::BattleResult::Defeat => self.state.lives -= 1,
                _ => {} // DRAW
            }
            log::info(&format!("Battle Result: {:?}", result));
        }

        // Generate initial views for UI
        let mut limits = oab_core::limits::BattleLimits::new();
        let initial_player_units: Vec<UnitView> = board_before_battle
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                UnitView {
                    instance_id: limits.generate_instance_id(oab_core::limits::Team::Player),
                    card_id: card.id,
                    name: card.name.clone(),
                    attack: card.stats.attack.saturating_add(u.perm_attack),
                    health: card.stats.health.saturating_add(u.perm_health),
                    abilities: card.abilities.clone(),
                }
            })
            .collect();

        limits.reset_phase_counters(); // Reset for enemy
        let initial_enemy_units: Vec<UnitView> =
            get_opponent_for_round(self.state.round, battle_seed + 999, &self.state.card_pool)
                .unwrap()
                .into_iter()
                .map(|cu| UnitView {
                    instance_id: limits.generate_instance_id(oab_core::limits::Team::Enemy),
                    card_id: cu.card_id,
                    name: cu.name,
                    attack: cu.attack,
                    health: cu.health,
                    abilities: cu.abilities,
                })
                .collect();

        self.last_battle_output = Some(BattleOutput {
            events,
            initial_player_units,
            initial_enemy_units,
            round: self.state.round as u32,
        });

        log::info("=== BATTLE END ===");
    }
}

impl Default for GameEngine {
    fn default() -> Self {
        Self::new(Some(42))
    }
}
