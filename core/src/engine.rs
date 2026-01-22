use crate::battle::{resolve_battle, CombatEvent, UnitView};
use crate::log;
use crate::opponents::get_opponent_for_round;
use crate::state::*;
use crate::types::{
    Ability, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit, ShopSlot, UnitCard,
};
use crate::view::GameView;
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
    ability: Option<Ability>,
}

/// The 10 unique unit cards for the starter deck
fn get_starter_templates() -> Vec<CardTemplate> {
    vec![
        CardTemplate {
            template_id: "goblin_scout",
            name: "Goblin Scout",
            attack: 1,
            health: 2,
            play_cost: 1,
            pitch_value: 2,
            ability: None,
        },
        CardTemplate {
            template_id: "goblin_looter",
            name: "Goblin Looter",
            attack: 1,
            health: 1,
            play_cost: 1,
            pitch_value: 3,
            ability: None,
        },
        CardTemplate {
            template_id: "militia",
            name: "Militia",
            attack: 2,
            health: 2,
            play_cost: 2,
            pitch_value: 2,
            ability: None,
        },
        CardTemplate {
            template_id: "shield_bearer",
            name: "Shield Bearer",
            attack: 1,
            health: 4,
            play_cost: 2,
            pitch_value: 2,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 0,
                    target: AbilityTarget::FrontAlly,
                },
                name: "Shield Wall".to_string(),
                description: "Heal front ally for 2".to_string(),
            }),
        },
        CardTemplate {
            template_id: "wolf_rider",
            name: "Wolf Rider",
            attack: 3,
            health: 2,
            play_cost: 3,
            pitch_value: 2,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::Damage {
                    amount: 2,
                    target: AbilityTarget::FrontEnemy,
                },
                name: "Dying Bite".to_string(),
                description: "Deal 2 damage to front enemy on death".to_string(),
            }),
        },
        CardTemplate {
            template_id: "orc_warrior",
            name: "Orc Warrior",
            attack: 3,
            health: 3,
            play_cost: 3,
            pitch_value: 2,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 2,
                    target: AbilityTarget::SelfUnit,
                },
                name: "Battle Rage".to_string(),
                description: "Gain +2 attack at battle start".to_string(),
            }),
        },
        CardTemplate {
            template_id: "zombie_soldier",
            name: "Zombie Soldier",
            attack: 1,
            health: 1,
            play_cost: 1,
            pitch_value: 1,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::SpawnUnit {
                    attack: 1,
                    health: 1,
                    name: "Zombie Spawn".to_string(),
                },
                name: "Spawn Zombie".to_string(),
                description: "Spawn a 1/1 Zombie Spawn when killed".to_string(),
            }),
        },
        CardTemplate {
            template_id: "troll_brute",
            name: "Troll Brute",
            attack: 4,
            health: 5,
            play_cost: 5,
            pitch_value: 2,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::Damage {
                    amount: 3,
                    target: AbilityTarget::AllEnemies,
                },
                name: "Death Throes".to_string(),
                description: "Deal 3 damage to all enemies on death".to_string(),
            }),
        },
        CardTemplate {
            template_id: "ogre_mauler",
            name: "Ogre Mauler",
            attack: 5,
            health: 6,
            play_cost: 6,
            pitch_value: 2,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 3,
                    target: AbilityTarget::SelfUnit,
                },
                name: "Crushing Blow".to_string(),
                description: "Gain +3 attack at battle start".to_string(),
            }),
        },
        CardTemplate {
            template_id: "giant_crusher",
            name: "Giant Crusher",
            attack: 6,
            health: 8,
            play_cost: 8,
            pitch_value: 2,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 4,
                    target: AbilityTarget::FrontEnemy,
                },
                name: "Earthshaker".to_string(),
                description: "Deal 4 damage to front enemy at battle start".to_string(),
            }),
        },
        CardTemplate {
            template_id: "dragon_tyrant",
            name: "Dragon Tyrant",
            attack: 8,
            health: 10,
            play_cost: 10,
            pitch_value: 3,
            ability: Some(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 3,
                    target: AbilityTarget::AllEnemies,
                },
                name: "Dragon Breath".to_string(),
                description: "Deal 3 damage to all enemies at battle start".to_string(),
            }),
        },
    ]
}

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

        self.state.spend_mana(cost)?;
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
            for _ in 0..3 {
                let id = self.state.generate_card_id();
                let mut card = UnitCard::new(
                    id,
                    template.template_id,
                    template.name,
                    template.attack,
                    template.health,
                    template.play_cost,
                    template.pitch_value,
                );
                if let Some(ability) = &template.ability {
                    card = card.with_ability(ability.clone());
                }
                self.state.deck.push(card);
            }
        }
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        self.state.deck.shuffle(&mut rng);
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
        let enemy_board = get_opponent_for_round(self.state.round, &mut self.state.next_card_id);

        let battle_seed = self.state.round as u64;
        let events = resolve_battle(&player_board, &enemy_board, battle_seed);

        if let Some(CombatEvent::BattleEnd { result }) = events.last() {
            match result.as_str() {
                "VICTORY" => self.state.wins += 1,
                "DEFEAT" => self.state.lives -= 1,
                _ => {} // DRAW
            }
            log::info(&format!("Battle Result: {}", result));
        }

        let mut instance_counter = 0;
        let initial_player_units: Vec<UnitView> = player_board
            .iter()
            .map(|u| {
                instance_counter += 1;
                UnitView {
                    instance_id: format!("p-{}", instance_counter),
                    template_id: u.card.template_id.clone(),
                    name: u.card.name.clone(),
                    attack: u.card.stats.attack,
                    health: u.current_health,
                    ability: u.card.ability.clone(),
                }
            })
            .collect();
        let initial_enemy_units: Vec<UnitView> = enemy_board
            .iter()
            .map(|u| {
                instance_counter += 1;
                UnitView {
                    instance_id: format!("e-{}", instance_counter),
                    template_id: u.card.template_id.clone(),
                    name: u.card.name.clone(),
                    attack: u.card.stats.attack,
                    health: u.current_health,
                    ability: u.card.ability.clone(),
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
