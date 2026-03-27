//! Game engine for browser WASM builds
//!
//! This module provides the main game engine exposed to JavaScript via wasm-bindgen.

use std::format;
use std::string::{String, ToString};
use std::vec::Vec;

use bounded_collections::ConstU32;
use oab_battle::battle::{
    player_permanent_stat_deltas_from_events, player_shop_mana_delta_from_events, resolve_battle,
    CombatEvent, CombatUnit, UnitId, UnitView,
};
use oab_battle::bounded::BoundedCardSet;
use oab_battle::commit::{
    apply_shop_start_triggers, apply_shop_start_triggers_with_result, apply_single_action,
    verify_and_apply_turn, ShopTurnContext,
};
use oab_battle::log;
use oab_battle::rng::XorShiftRng;
use oab_battle::state::*;
use oab_battle::types::{BoardUnit, CardId, CommitTurnAction, TurnAction, UnitCard};
use oab_game::bounded::BoundedGameSession;
use oab_game::view::{CardView, GameView};
use oab_game::{GamePhase, GameSession, GameState};
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
    shop_ctx: ShopTurnContext,
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
    // Per-turn local tracking (transient, not persisted)
    shop_ctx: ShopTurnContext,   // canonical incremental shop context
    action_log: Vec<TurnAction>, // Ordered list of actions taken this turn
    start_board: Vec<Option<BoardUnit>>, // board state at the start of the turn
    start_shop_mana: i32,        // mana state at the start of the turn
    undo_history: Vec<TurnSnapshot>, // Stack of snapshots for undo
    custom_sets: std::collections::HashMap<u32, CardSet>, // Blockchain sets injected via add_set
}

#[wasm_bindgen]
impl GameEngine {
    fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, serde_wasm_bindgen::Error> {
        let serializer =
            serde_wasm_bindgen::Serializer::new().serialize_large_number_types_as_bigints(true);
        value.serialize(&serializer)
    }

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
            shop_ctx: ShopTurnContext::new(&GameState::empty()),
            action_log: Vec::new(),
            start_board: Vec::new(),
            start_shop_mana: 0,
            undo_history: Vec::new(),
            custom_sets: std::collections::HashMap::new(),
        };

        // Only initialize fully if a seed was actually provided (manual local start)
        // Otherwise, we wait for init_from_scale
        if let Some(seed_val) = seed {
            log::debug("new", "Seed provided, performing full initialization");
            engine.state.game_seed = seed_val;
            engine.state.mana_limit = engine.state.config.mana_limit_for_round(1);
            engine.state.round = 1;
            engine.state.lives = engine.state.config.starting_lives;
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
        log::action(
            "load_card_set",
            &format!("Loading cards for set_id={}", set_id),
        );

        let card_pool = oab_assets::cards::build_pool();
        let card_set = if let Some(custom) = self.custom_sets.get(&set_id) {
            custom.clone()
        } else {
            let sets = oab_assets::sets::get_all();
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

    /// Load the full card pool as a synthetic set containing every non-token card.
    /// Used by constructed mode which is not tied to a specific set.
    #[wasm_bindgen]
    pub fn load_full_card_pool(&mut self) {
        use oab_battle::state::{CardSet, CardSetEntry};

        let card_pool = oab_assets::cards::build_pool();
        let card_set = CardSet {
            cards: card_pool
                .keys()
                .map(|&id| CardSetEntry { card_id: id, rarity: 1 })
                .collect(),
        };

        let num_cards = card_pool.len();
        self.state.card_pool = card_pool;
        self.card_set = Some(card_set);

        log::info(&format!("Loaded full card pool: {} cards", num_cards));
    }

    /// Get card metadata (id, name, emoji) for all cards.
    /// Used by the frontend to build the emoji display map.
    #[wasm_bindgen]
    pub fn get_card_metas(&self) -> JsValue {
        let metas = oab_assets::cards::get_all_metas();
        serde_wasm_bindgen::to_value(&metas).unwrap_or(JsValue::NULL)
    }

    /// Get set metadata (id, name) for all sets.
    /// Used by the frontend for set selection screen.
    #[wasm_bindgen]
    pub fn get_set_metas(&self) -> JsValue {
        let metas = oab_assets::sets::get_all_metas();
        serde_wasm_bindgen::to_value(&metas).unwrap_or(JsValue::NULL)
    }

    /// Get all cards in a set as CardView[] without mutating engine state.
    /// Used for set preview before starting a game.
    /// Returns card views with their set rarity weight.
    /// Checks custom (blockchain) sets first, then falls back to genesis sets.
    #[wasm_bindgen]
    pub fn get_set_cards(&self, set_id: u32) -> Result<JsValue, String> {
        use oab_game::view::CardView;
        use serde::Serialize;

        // Note: serde_wasm_bindgen doesn't support #[serde(flatten)],
        // so we explicitly list all CardView fields plus rarity.
        #[derive(Serialize)]
        struct SetCardView {
            id: oab_battle::types::CardId,
            name: String,
            attack: i32,
            health: i32,
            play_cost: i32,
            burn_value: i32,
            shop_abilities: Vec<oab_battle::types::ShopAbility>,
            battle_abilities: Vec<oab_battle::types::Ability>,
            rarity: u32,
        }

        impl SetCardView {
            fn from_card_and_rarity(card: CardView, rarity: u32) -> Self {
                Self {
                    id: card.id,
                    name: card.name,
                    attack: card.attack,
                    health: card.health,
                    play_cost: card.play_cost,
                    burn_value: card.burn_value,
                    shop_abilities: card.shop_abilities,
                    battle_abilities: card.battle_abilities,
                    rarity,
                }
            }
        }

        let card_set = if let Some(custom) = self.custom_sets.get(&set_id) {
            custom.clone()
        } else {
            let sets = oab_assets::sets::get_all();
            sets.into_iter()
                .nth(set_id as usize)
                .ok_or_else(|| format!("Set {} not found", set_id))?
        };

        // Use the engine's card pool (includes blockchain cards) with genesis as fallback
        let genesis_pool = oab_assets::cards::build_pool();
        let card_views: Vec<SetCardView> = card_set
            .cards
            .iter()
            .filter_map(|entry| {
                self.state
                    .card_pool
                    .get(&entry.card_id)
                    .or_else(|| genesis_pool.get(&entry.card_id))
                    .map(|unit| {
                        SetCardView::from_card_and_rarity(CardView::from(unit), entry.rarity)
                    })
            })
            .collect();

        serde_wasm_bindgen::to_value(&card_views)
            .map_err(|e| format!("Serialization failed: {:?}", e))
    }

    /// Add a card set to the engine.
    /// Used by the frontend to inject blockchain sets for preview/play.
    #[wasm_bindgen]
    pub fn add_set(&mut self, set_id: u32, cards_js: JsValue) -> Result<(), String> {
        let entries: Vec<oab_battle::state::CardSetEntry> =
            serde_wasm_bindgen::from_value(cards_js)
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
        let view = GameView::from_state(
            &self.state,
            self.state.shop_mana,
            &self.shop_ctx.hand_used,
            can_undo,
        );
        match Self::to_js_value(&view) {
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

    /// Burn a card from the hand to generate mana
    #[wasm_bindgen]
    pub fn burn_hand_card(&mut self, hand_index: usize) -> Result<(), String> {
        log::action(
            "burn_hand_card",
            &format!(
                "hand_index={}, hand_used_len={}",
                hand_index,
                self.shop_ctx.hand_used.len()
            ),
        );
        if self.state.phase != GamePhase::Shop {
            return Err("Can only burn during shop phase".to_string());
        }

        let action = TurnAction::BurnFromHand {
            hand_index: hand_index as u32,
        };
        self.save_snapshot();
        if let Err(e) = apply_single_action(&mut self.state, &mut self.shop_ctx, &action) {
            let snapshot = self.undo_history.pop().unwrap();
            self.restore_snapshot(snapshot);
            return Err(format!("{:?}", e));
        }
        self.action_log.push(action);

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

        let action = TurnAction::PlayFromHand {
            hand_index: hand_index as u32,
            board_slot: board_slot as u32,
        };
        self.save_snapshot();
        if let Err(e) = apply_single_action(&mut self.state, &mut self.shop_ctx, &action) {
            // Rollback on failure: restore snapshot since save_snapshot was already called
            let snapshot = self.undo_history.pop().unwrap();
            self.restore_snapshot(snapshot);
            return Err(format!("{:?}", e));
        }
        self.action_log.push(action);

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

        let action = TurnAction::SwapBoard {
            slot_a: slot_a as u32,
            slot_b: slot_b as u32,
        };
        self.save_snapshot();
        if let Err(e) = apply_single_action(&mut self.state, &mut self.shop_ctx, &action) {
            let snapshot = self.undo_history.pop().unwrap();
            self.restore_snapshot(snapshot);
            return Err(format!("{:?}", e));
        }
        self.action_log.push(action);
        Ok(())
    }

    /// Move a board unit from one slot to another, shifting intermediate units
    #[wasm_bindgen]
    pub fn move_board_position(&mut self, from: usize, to: usize) -> Result<(), String> {
        log::action("move_board_position", &format!("from={}, to={}", from, to));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only move during shop phase".to_string());
        }

        let action = TurnAction::MoveBoard {
            from_slot: from as u32,
            to_slot: to as u32,
        };
        self.save_snapshot();
        if let Err(e) = apply_single_action(&mut self.state, &mut self.shop_ctx, &action) {
            let snapshot = self.undo_history.pop().unwrap();
            self.restore_snapshot(snapshot);
            return Err(format!("{:?}", e));
        }
        self.action_log.push(action);
        Ok(())
    }

    /// Burn a unit from the board
    #[wasm_bindgen]
    pub fn burn_board_unit(&mut self, board_slot: usize) -> Result<(), String> {
        log::action("burn_board_unit", &format!("slot={}", board_slot));
        if self.state.phase != GamePhase::Shop {
            return Err("Can only burn during shop phase".to_string());
        }

        let action = TurnAction::BurnFromBoard {
            board_slot: board_slot as u32,
        };
        self.save_snapshot();
        if let Err(e) = apply_single_action(&mut self.state, &mut self.shop_ctx, &action) {
            let snapshot = self.undo_history.pop().unwrap();
            self.restore_snapshot(snapshot);
            return Err(format!("{:?}", e));
        }
        self.action_log.push(action);

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
        self.restore_snapshot(snapshot);

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

        if self.state.wins >= self.state.config.wins_to_victory || self.state.lives <= 0 {
            self.state.phase = GamePhase::Completed;
            return Ok(());
        }

        self.state.round += 1;
        self.state.mana_limit = self.state.config.mana_limit_for_round(self.state.round);
        if self.state.config.full_mana_each_round {
            self.state.shop_mana = self.state.mana_limit;
        }
        self.state.phase = GamePhase::Shop;
        self.state.draw_hand(self.state.config.hand_size as usize);
        let previous_battle_result = self.last_battle_output.as_ref().and_then(|output| {
            output.events.iter().rev().find_map(|event| {
                if let CombatEvent::BattleEnd { result } = event {
                    Some(result.clone())
                } else {
                    None
                }
            })
        });
        apply_shop_start_triggers_with_result(&mut self.state, previous_battle_result);
        self.start_planning_phase();

        self.log_state();
        Ok(())
    }

    /// Start a new run with a seed (required for deterministic gameplay)
    #[wasm_bindgen]
    pub fn new_run(&mut self, seed: u64) {
        log::action("new_run", &format!("Starting run with seed {}", seed));
        let config = oab_game::sealed::default_config();
        // Preserve card_pool when resetting state
        let card_pool = std::mem::take(&mut self.state.card_pool);
        self.state = GameState::new(seed, config);
        self.state.card_pool = card_pool;
        self.last_battle_output = None;
        self.state.lives = self.state.config.starting_lives;
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
        self.state.config.starting_lives = lives;
        self.state.config.wins_to_victory = lives;
    }

    /// Start a new constructed run with a user-provided deck.
    #[wasm_bindgen]
    pub fn new_run_constructed(&mut self, seed: u64, deck_js: JsValue) -> Result<(), String> {
        let deck: Vec<u32> = serde_wasm_bindgen::from_value(deck_js)
            .map_err(|e| format!("Failed to parse deck: {:?}", e))?;

        let card_set = self
            .card_set
            .as_ref()
            .ok_or("No card set loaded. Call load_card_set first.")?;

        oab_game::constructed::validate_deck(
            &deck,
            card_set,
            oab_game::constructed::MAX_COPIES_PER_CARD,
            oab_game::constructed::default_config().bag_size as usize,
        )?;

        log::action(
            "new_run_constructed",
            &format!("Starting constructed run with seed {}", seed),
        );

        let config = oab_game::constructed::default_config();
        let deck_ids: Vec<CardId> = deck.into_iter().map(CardId).collect();
        let card_pool = std::mem::take(&mut self.state.card_pool);
        self.state = GameState::new(seed, config);
        self.state.card_pool = card_pool;
        self.last_battle_output = None;
        self.state.lives = self.state.config.starting_lives;

        self.state.bag = deck_ids;
        self.state.next_card_id = 1000;
        self.state.draw_hand(self.state.config.hand_size as usize);

        apply_shop_start_triggers(&mut self.state);
        self.start_planning_phase();
        self.log_state();
        Ok(())
    }

    /// Start a new constructed P2P run with a user-provided deck and custom lives.
    #[wasm_bindgen]
    pub fn new_run_constructed_p2p(
        &mut self,
        seed: u64,
        deck_js: JsValue,
        lives: i32,
    ) -> Result<(), String> {
        self.new_run_constructed(seed, deck_js)?;
        let lives = lives.max(1).min(10);
        self.state.lives = lives;
        self.state.config.starting_lives = lives;
        self.state.config.wins_to_victory = lives;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_starting_lives(&self) -> i32 {
        self.state.config.starting_lives
    }

    #[wasm_bindgen]
    pub fn get_wins_to_victory(&self) -> i32 {
        self.state.config.wins_to_victory
    }

    /// Get the full game state as JSON (for P2P sync)
    #[wasm_bindgen]
    pub fn get_state(&self) -> JsValue {
        match Self::to_js_value(&self.state) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("get_state serialization failed: {:?}", e));
                JsValue::NULL
            }
        }
    }

    /// Get the resumable local session payload (similar to the on-chain GameSession).
    #[wasm_bindgen]
    pub fn get_local_session(&self) -> JsValue {
        let (_, set_id, config, local_state) = self.state.clone().decompose();
        let snapshot = GameSession {
            state: local_state,
            set_id,
            config,
        };

        match Self::to_js_value(&snapshot) {
            Ok(val) => val,
            Err(e) => {
                log::error(&format!("get_local_session serialization failed: {:?}", e));
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

        // Finalize the shop turn: rollback to start_board, replay actions,
        // and remove used hand cards so the bag stays accurate.
        if self.state.phase == GamePhase::Shop {
            let action = CommitTurnAction {
                actions: self.action_log.clone(),
            };
            self.state.board = self.start_board.clone();
            self.state.shop_mana = self.start_shop_mana;
            if let Err(e) = verify_and_apply_turn(&mut self.state, &action) {
                log::error(&format!("P2P turn finalization failed: {:?}", e));
            }
        }

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
            self.state.config.board_size as usize,
        );

        // Generate initial views for UI animation
        let mut limits = oab_battle::limits::BattleLimits::new();
        let initial_player_units: Vec<UnitView> = player_board
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                UnitView {
                    instance_id: limits.generate_instance_id(oab_battle::limits::Team::Player),
                    card_id: card.id,
                    name: card.name.clone(),
                    attack: card.stats.attack.saturating_add(u.perm_attack),
                    health: card.stats.health.saturating_add(u.perm_health),
                    battle_abilities: card.battle_abilities.clone(),
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
                    instance_id: limits.generate_instance_id(oab_battle::limits::Team::Enemy),
                    card_id: card.id,
                    name: card.name.clone(),
                    attack: card.stats.attack.saturating_add(u.perm_attack),
                    health: card.stats.health.saturating_add(u.perm_health),
                    battle_abilities: card.battle_abilities.clone(),
                }
            })
            .collect();

        // Apply the battle result (wins/lives)
        if let Some(CombatEvent::BattleEnd { result }) = events.last() {
            match result {
                oab_battle::battle::BattleResult::Victory => self.state.wins += 1,
                oab_battle::battle::BattleResult::Defeat => self.state.lives -= 1,
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

        log::debug("init_from_scale", "Decoding BoundedGameSession...");
        let session_bounded =
            BoundedGameSession::<WasmMaxBagSize, WasmMaxBoardSize, WasmMaxHandActions>::decode(
                &mut session_slice,
            )
            .map_err(|e| format!("Failed to decode BoundedGameSession: {:?}", e))?;

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
        let _card_set: oab_battle::state::CardSet = card_set_bounded.into();
        let session: GameSession = session_bounded.into();

        log::debug("init_from_scale", "Reconstructing GameState...");
        // Use the card pool already loaded via load_card_set()
        let card_pool = std::mem::take(&mut self.state.card_pool);

        let state =
            GameState::reconstruct(card_pool, session.set_id, session.config, session.state);

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

    /// Restore a local resumable session at the start of a player turn.
    #[wasm_bindgen]
    pub fn restore_local_session(&mut self, session_js: JsValue) -> Result<(), String> {
        let session: GameSession = serde_wasm_bindgen::from_value(session_js)
            .map_err(|e| format!("Failed to parse local session: {:?}", e))?;

        if session.state.phase != GamePhase::Shop {
            return Err("Local session resume requires a shop-phase turn start".to_string());
        }

        let card_pool = std::mem::take(&mut self.state.card_pool);
        self.state =
            GameState::reconstruct(card_pool, session.set_id, session.config, session.state);
        self.set_id = self.state.set_id;
        self.last_battle_output = None;
        self.start_planning_phase();

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
            shop_ctx: self.shop_ctx.clone(),
            action_log: self.action_log.clone(),
            board: self.state.board.clone(),
        });
    }

    /// Restore state from a snapshot
    fn restore_snapshot(&mut self, snapshot: TurnSnapshot) {
        self.shop_ctx = snapshot.shop_ctx;
        self.action_log = snapshot.action_log;
        self.state.board = snapshot.board;
        self.state.shop_mana = self.shop_ctx.current_mana;
    }

    fn initialize_bag(&mut self) {
        use oab_game::sealed::create_starting_bag;

        self.state.bag.clear();

        if let Some(card_set) = &self.card_set {
            // Generate random bag of 100 cards from the already-loaded set
            self.state.bag = create_starting_bag(
                card_set,
                self.state.game_seed,
                self.state.config.bag_size as usize,
            );
        }

        // Set next_card_id to be after card definitions
        self.state.next_card_id = 1000;

        // Draw initial hand once bag is ready
        self.state.draw_hand(self.state.config.hand_size as usize);
    }

    fn start_planning_phase(&mut self) {
        // If hand is empty, draw it (should have been drawn by initialize_bag or continue_after_battle)
        if self.state.hand.is_empty() {
            self.state.draw_hand(self.state.config.hand_size as usize);
        }

        self.shop_ctx = ShopTurnContext::new(&self.state);
        self.action_log = Vec::new();
        self.start_board = self.state.board.clone();
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
        let enemy_units = Vec::new();

        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        let events = resolve_battle(
            player_units,
            enemy_units,
            &mut rng,
            &self.state.card_pool,
            self.state.config.board_size as usize,
        );
        self.state.shop_mana = player_shop_mana_delta_from_events(&events).max(0);
        let permanent_deltas = player_permanent_stat_deltas_from_events(&events);
        self.apply_player_permanent_stat_deltas(&player_slots, &permanent_deltas);

        if let Some(CombatEvent::BattleEnd { result }) = events.last() {
            match result {
                oab_battle::battle::BattleResult::Victory => self.state.wins += 1,
                oab_battle::battle::BattleResult::Defeat => self.state.lives -= 1,
                _ => {} // DRAW
            }
            log::info(&format!("Battle Result: {:?}", result));
        }

        // Generate initial views for UI
        let mut limits = oab_battle::limits::BattleLimits::new();
        let initial_player_units: Vec<UnitView> = board_before_battle
            .iter()
            .flatten()
            .map(|u| {
                let card = self.get_card(u.card_id);
                UnitView {
                    instance_id: limits.generate_instance_id(oab_battle::limits::Team::Player),
                    card_id: card.id,
                    name: card.name.clone(),
                    attack: card.stats.attack.saturating_add(u.perm_attack),
                    health: card.stats.health.saturating_add(u.perm_health),
                    battle_abilities: card.battle_abilities.clone(),
                }
            })
            .collect();

        limits.reset_phase_counters(); // Reset for enemy
        let initial_enemy_units: Vec<UnitView> = Vec::new();

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
