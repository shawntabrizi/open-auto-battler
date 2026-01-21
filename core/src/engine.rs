use crate::battle::{BattleResult, BattleSimulator, CombatEvent, CombatUnit};
use crate::log;
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
    pub player_units: Vec<CombatUnitInfo>,
    pub enemy_units: Vec<CombatUnitInfo>,
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

        // Debug log the view contents
        log::info(&format!(
            "get_view: shop.len={}, board.len={}, mana={}, round={}",
            view.shop.len(),
            view.board.len(),
            view.mana,
            view.round
        ));

        // Log shop contents
        for (i, slot) in view.shop.iter().enumerate() {
            let card_info = match &slot.card {
                Some(c) => format!("{} (cost={})", c.name, c.play_cost),
                None => "empty".to_string(),
            };
            log::debug("get_view", &format!("  shop[{}]: {} (frozen={})", i, card_info, slot.frozen));
        }

        match serde_wasm_bindgen::to_value(&view) {
            Ok(val) => {
                log::debug("get_view", "Serialization successful");
                val
            }
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
            Some(output) => {
                log::debug("get_battle_output", &format!("Found {} events", output.events.len()));
                serde_wasm_bindgen::to_value(output).unwrap_or(JsValue::NULL)
            }
            None => {
                log::debug("get_battle_output", "No battle output available");
                JsValue::NULL
            }
        }
    }

    /// Pitch a card from the shop to generate mana
    #[wasm_bindgen]
    pub fn pitch_shop_card(&mut self, index: usize) -> Result<(), String> {
        log::action("pitch_shop_card", &format!("index={}", index));
        self.log_state();

        if self.state.phase != GamePhase::Shop {
            log::result(false, "Not in shop phase");
            return Err("Can only pitch during shop phase".to_string());
        }

        // Safely get the shop slot
        let slot = self.state.shop.get_mut(index).ok_or_else(|| {
            log::result(false, &format!("Invalid index {} >= {}", index, SHOP_SIZE));
            format!("Invalid shop index: {}", index)
        })?;

        // Take the card from the slot
        let card = slot.card.take().ok_or_else(|| {
            log::result(false, "Shop slot is empty");
            "Shop slot is empty".to_string()
        })?;

        let pitch_value = card.economy.pitch_value;
        let card_name = card.name.clone();

        log::info(&format!(
            "   Pitching '{}' (id={}) for {} mana",
            card_name, card.id, pitch_value
        ));

        // Add mana from pitch value (capped at limit)
        let old_mana = self.state.mana;
        self.state.add_mana(pitch_value);
        log::info(&format!(
            "   Mana: {} -> {} (limit: {})",
            old_mana, self.state.mana, self.state.mana_limit
        ));

        // Refill the slot from deck
        let deck_size = self.state.deck.len();
        if let Some(new_card) = self.state.deck.pop() {
            log::info(&format!(
                "   Refilled slot {} with '{}' from deck ({} remaining)",
                index,
                new_card.name,
                deck_size.saturating_sub(1)
            ));
            // Safely assign to the slot (we know index is valid from earlier check)
            if let Some(slot) = self.state.shop.get_mut(index) {
                *slot = ShopSlot::with_card(new_card);
            }
        } else {
            log::warn("   Deck empty, slot left empty");
        }

        log::result(true, "Pitch successful");
        self.log_state();
        Ok(())
    }

    /// Buy a card from the shop
    #[wasm_bindgen]
    pub fn buy_card(&mut self, shop_index: usize) -> Result<(), String> {
        log::action("buy_card", &format!("shop_index={}", shop_index));
        self.log_state();

        if self.state.phase != GamePhase::Shop {
            log::result(false, "Not in shop phase");
            return Err("Can only buy during shop phase".to_string());
        }

        // Safely get shop slot and extract card info
        let slot = self.state.shop.get(shop_index).ok_or_else(|| {
            log::result(false, &format!("Invalid index {} >= {}", shop_index, SHOP_SIZE));
            format!("Invalid shop index: {}", shop_index)
        })?;

        let (cost, card_name) = match &slot.card {
            Some(card) => (card.economy.play_cost, card.name.clone()),
            None => {
                log::result(false, "Shop slot is empty");
                return Err("Shop slot is empty".to_string());
            }
        };

        log::info(&format!(
            "   Attempting to buy '{}' for {} mana (have: {})",
            card_name, cost, self.state.mana
        ));

        // Check if we can afford it
        if !self.state.can_afford(cost) {
            log::result(false, &format!("Not enough mana: have {}, need {}", self.state.mana, cost));
            return Err(format!(
                "Not enough mana: have {}, need {}",
                self.state.mana, cost
            ));
        }

        // Check if board has space
        let board_slot = self.state.find_empty_board_slot().ok_or_else(|| {
            log::result(false, "Board is full");
            "Board is full".to_string()
        })?;

        log::info(&format!("   Found empty board slot: {}", board_slot));

        // Take the card (safely)
        let card = self.state.shop.get_mut(shop_index)
            .and_then(|slot| slot.card.take())
            .ok_or_else(|| {
                log::result(false, "Failed to take card from shop");
                "Failed to take card from shop".to_string()
            })?;

        log::info(&format!("   Took card '{}' (id={}) from shop", card.name, card.id));

        // Spend mana
        self.state.spend_mana(cost)?;
        log::info(&format!("   Spent {} mana, now have {}", cost, self.state.mana));

        // Place on board (safely)
        if let Some(board) = self.state.board.get_mut(board_slot) {
            *board = Some(BoardUnit::from_card(card));
            log::info(&format!("   Placed card on board slot {}", board_slot));
        } else {
            // This shouldn't happen since find_empty_board_slot returns valid indices
            log::result(false, "Invalid board slot");
            return Err("Invalid board slot".to_string());
        }

        log::result(true, "Buy successful");
        self.log_state();
        Ok(())
    }

    /// Freeze/unfreeze a shop slot
    #[wasm_bindgen]
    pub fn toggle_freeze(&mut self, shop_index: usize) -> Result<(), String> {
        log::action("toggle_freeze", &format!("shop_index={}", shop_index));

        if self.state.phase != GamePhase::Shop {
            log::result(false, "Not in shop phase");
            return Err("Can only freeze during shop phase".to_string());
        }

        let slot = self.state.shop.get_mut(shop_index).ok_or_else(|| {
            log::result(false, "Invalid shop index");
            format!("Invalid shop index: {}", shop_index)
        })?;

        if slot.card.is_some() {
            slot.frozen = !slot.frozen;
            log::result(true, &format!("Slot {} frozen: {}", shop_index, slot.frozen));
            Ok(())
        } else {
            log::result(false, "Cannot freeze empty slot");
            Err("Cannot freeze empty slot".to_string())
        }
    }





    /// Swap two board positions
    #[wasm_bindgen]
    pub fn swap_board_positions(&mut self, slot_a: usize, slot_b: usize) -> Result<(), String> {
        log::action("swap_board_positions", &format!("slot_a={}, slot_b={}", slot_a, slot_b));

        if self.state.phase != GamePhase::Shop {
            log::result(false, "Not in shop phase");
            return Err("Can only swap during shop phase".to_string());
        }

        let board_len = self.state.board.len();
        if slot_a >= board_len || slot_b >= board_len {
            log::result(false, "Invalid board slot");
            return Err("Invalid board slot".to_string());
        }

        // Safe swap - we've already validated the indices
        self.state.board.swap(slot_a, slot_b);
        log::result(true, "Swap successful");
        Ok(())
    }

    /// Pitch a unit from the board
    #[wasm_bindgen]
    pub fn pitch_board_unit(&mut self, board_slot: usize) -> Result<(), String> {
        log::action("pitch_board_unit", &format!("board_slot={}", board_slot));

        if self.state.phase != GamePhase::Shop {
            log::result(false, "Not in shop phase");
            return Err("Can only pitch during shop phase".to_string());
        }

        if board_slot >= self.state.board.len() {
            log::result(false, "Invalid board slot");
            return Err(format!("Invalid board slot: {}", board_slot));
        }

        let unit = self.state.board.get_mut(board_slot)
            .and_then(|slot| slot.take())
            .ok_or_else(|| {
                log::result(false, "Board slot is empty");
                "Board slot is empty".to_string()
            })?;

        let pitch_value = unit.card.economy.pitch_value;
        log::info(&format!("   Pitching '{}' for {} mana", unit.card.name, pitch_value));

        // Add mana from pitch value
        self.state.add_mana(pitch_value);

        log::result(true, &format!("Pitch successful, mana now {}", self.state.mana));
        self.log_state();
        Ok(())
    }



    /// End the shop phase and start battle
    #[wasm_bindgen]
    pub fn end_turn(&mut self) -> Result<(), String> {
        log::action("end_turn", "Starting battle phase");
        self.log_state();

        if self.state.phase != GamePhase::Shop {
            log::result(false, "Not in shop phase");
            return Err("Can only end turn during shop phase".to_string());
        }

        // Return unfrozen cards to bottom of deck
        let mut returned = 0;
        for slot in &mut self.state.shop {
            if !slot.frozen {
                if let Some(card) = slot.card.take() {
                    log::info(&format!("   Returning '{}' to deck bottom", card.name));
                    self.state.deck.insert(0, card);
                    returned += 1;
                }
            }
            // Unfreeze for next round
            slot.frozen = false;
        }
        log::info(&format!("   Returned {} cards to deck", returned));

        // Reset mana
        self.state.mana = 0;

        // Start battle phase
        self.state.phase = GamePhase::Battle;

        // Run the battle
        self.run_battle();

        log::result(true, "Turn ended, battle complete");
        self.log_state();
        Ok(())
    }

    /// Continue after battle (go to next shop phase or end game)
    #[wasm_bindgen]
    pub fn continue_after_battle(&mut self) -> Result<(), String> {
        log::action("continue_after_battle", "Processing battle result");

        if self.state.phase != GamePhase::Battle {
            log::result(false, "Not in battle phase");
            return Err("Not in battle phase".to_string());
        }

        // Check for game over conditions
        if self.state.wins >= WINS_TO_VICTORY {
            log::info(&format!("   VICTORY! {} wins", self.state.wins));
            self.state.phase = GamePhase::Victory;
            return Ok(());
        }

        if self.state.lives <= 0 {
            log::info("   DEFEAT! No lives remaining");
            self.state.phase = GamePhase::Defeat;
            return Ok(());
        }

        // Advance to next round
        self.state.round += 1;
        self.state.mana_limit = self.state.calculate_mana_limit();
        log::info(&format!(
            "   Advancing to round {}, mana limit now {}",
            self.state.round, self.state.mana_limit
        ));

        // Refill shop
        self.fill_shop();

        // Go to shop phase
        self.state.phase = GamePhase::Shop;

        log::result(true, "Continuing to next round");
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
        log::result(true, "New run initialized");
        self.log_state();
    }
}

// Private implementation methods (not exposed to WASM)
impl GameEngine {
    /// Log current state summary
    fn log_state(&self) {
        let board_count = self.state.board.iter().filter(|s| s.is_some()).count();
        let phase = match self.state.phase {
            GamePhase::Shop => "SHOP",
            GamePhase::Battle => "BATTLE",
            GamePhase::Victory => "VICTORY",
            GamePhase::Defeat => "DEFEAT",
        };

        log::state_summary(
            phase,
            self.state.round,
            self.state.mana,
            self.state.mana_limit,
            self.state.lives,
            self.state.wins,
            self.state.deck.len(),
            board_count,
        );

        // Log shop contents
        let shop_cards: Vec<String> = self
            .state
            .shop
            .iter()
            .enumerate()
            .map(|(i, slot)| {
                match &slot.card {
                    Some(card) => format!("[{}]{}{}", i, card.name, if slot.frozen { "*" } else { "" }),
                    None => format!("[{}]empty", i),
                }
            })
            .collect();
        log::debug("SHOP", &shop_cards.join(" | "));



        // Log board contents
        let board_units: Vec<String> = self
            .state
            .board
            .iter()
            .enumerate()
            .map(|(i, slot)| {
                match slot {
                    Some(unit) => format!("[{}]{}({}/{})", i, unit.card.name, unit.card.stats.attack, unit.current_health),
                    None => format!("[{}]-", i),
                }
            })
            .collect();
        log::debug("BOARD", &board_units.join(" | "));
    }

    /// Initialize the starter deck (30 cards, 3 copies of each template)
    fn initialize_deck(&mut self) {
        log::info("Initializing deck...");
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

        log::info(&format!("   Created {} cards", self.state.deck.len()));

        // Shuffle the deck with a seeded RNG for reproducibility
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        self.state.deck.shuffle(&mut rng);
        log::info("   Deck shuffled (seed: 42)");
    }

    /// Fill empty shop slots from the deck
    fn fill_shop(&mut self) {
        log::debug("fill_shop", "Filling empty shop slots");
        let mut filled = 0;
        for (i, slot) in self.state.shop.iter_mut().enumerate() {
            if slot.card.is_none() && !slot.frozen {
                if let Some(card) = self.state.deck.pop() {
                    log::debug("fill_shop", &format!("   Slot {}: {}", i, card.name));
                    *slot = ShopSlot::with_card(card);
                    filled += 1;
                }
            }
        }
        log::debug("fill_shop", &format!("Filled {} slots, deck now has {} cards", filled, self.state.deck.len()));
    }

    /// Run the battle simulation
    fn run_battle(&mut self) {
        log::info("=== BATTLE START ===");

        // Get player units from board (compact to remove empty slots)
        let player_units: Vec<CombatUnit> = self
            .state
            .board
            .iter()
            .filter_map(|slot| slot.as_ref().map(CombatUnit::from_board_unit))
            .collect();

        log::info(&format!("   Player units: {}", player_units.len()));
        for unit in &player_units {
            log::info(&format!("      - {} ({}/{})", unit.name, unit.attack, unit.health));
        }

        // Get enemy units for this round
        let enemy_units = get_opponent_for_round(self.state.round);

        log::info(&format!("   Enemy units: {}", enemy_units.len()));
        for unit in &enemy_units {
            log::info(&format!("      - {} ({}/{})", unit.name, unit.attack, unit.health));
        }

        // Run simulation
        let simulator = BattleSimulator::new(player_units, enemy_units.clone());
        let (result, events, final_player_units) = simulator.simulate();

        log::info(&format!("   Battle generated {} events", events.len()));

        // Apply result
        match &result {
            BattleResult::Victory { remaining } => {
                self.state.wins += 1;
                log::info(&format!("   VICTORY! {} units remaining, wins: {}", remaining, self.state.wins));
            }
            BattleResult::Defeat { remaining } => {
                self.state.lives -= 1;
                log::info(&format!("   DEFEAT! {} enemy units remaining, lives: {}", remaining, self.state.lives));
            }
            BattleResult::Draw => {
                log::info("   DRAW! No change to lives or wins");
            }
        }

        // Reset board to original state - no permanent battle effects
        // Just like Super Auto Pets, battles don't damage your actual units
        log::info("   Board reset - battles have no permanent effects");

        // Store battle output for UI playback
        self.last_battle_output = Some(BattleOutput {
            events,
            result: BattleResultView::from(&result),
            player_units: final_player_units.iter().map(|u| CombatUnitInfo {
                name: u.name.clone(),
                attack: u.attack,
                health: u.health,
                max_health: u.max_health,
            }).collect(),
            enemy_units: enemy_units.iter().map(|u| CombatUnitInfo {
                name: u.name.clone(),
                attack: u.attack,
                health: u.health,
                max_health: u.max_health,
            }).collect(),
        });

        log::info("=== BATTLE END ===");
    }
}

impl Default for GameEngine {
    fn default() -> Self {
        Self::new()
    }
}
