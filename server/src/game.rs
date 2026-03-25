//! Core game session — provides reset/step interface for both local and chain modes.

use std::collections::BTreeMap;

use oab_core::battle::{
    player_permanent_stat_deltas_from_events, player_shop_mana_delta_from_events, resolve_battle,
    BattleResult, CombatEvent, CombatUnit, UnitId,
};
use oab_core::commit::{apply_shop_start_triggers, apply_shop_start_triggers_with_result};
use oab_core::opponents::get_opponent_for_round;
use oab_core::rng::XorShiftRng;
use oab_core::state::*;
use oab_core::types::*;
use oab_core::units::create_starting_bag;
use oab_core::view::GameView;

use crate::types::{BattleReport, GameStateResponse, StepResponse};

/// Result from running a battle, with report info for the agent.
struct BattleOutcome {
    result: BattleResult,
    report: BattleReport,
}

/// Trait for game backends (local or on-chain).
pub trait GameBackend: Send {
    /// Reset the game with a new seed and optional set_id. Returns initial state.
    fn reset(&mut self, seed: u64, set_id: Option<u32>) -> Result<GameStateResponse, String>;
    /// Execute a turn and return the step result.
    fn step(&mut self, action: &CommitTurnAction) -> Result<StepResponse, String>;
    /// Get the current game state.
    fn get_state(&self) -> GameStateResponse;
    /// Get all cards available in the current card pool.
    fn get_cards(&self) -> Vec<oab_core::view::CardView>;
    /// Get available card sets.
    fn get_sets(&self) -> Vec<crate::types::SetInfo>;
}

/// A local game session that manages a full game against built-in opponents.
pub struct GameSession {
    state: GameState,
    card_set: CardSet,
}

impl GameSession {
    /// Start a new game with the given seed and card set.
    pub fn new(seed: u64, set_id: u32) -> Result<Self, String> {
        let card_pool = oab_core::cards::build_card_pool();
        let all_sets = oab_core::cards::get_all_sets();
        let card_set = if (set_id as usize) < all_sets.len() {
            all_sets.into_iter().nth(set_id as usize).unwrap()
        } else {
            return Err(format!("Card set {} not found", set_id));
        };

        let mut state = GameState::new(seed);
        state.card_pool = card_pool;
        state.set_id = set_id;
        state.local_state.bag = create_starting_bag(&card_set, seed);
        state.local_state.next_card_id = 1000;
        state.draw_hand();
        apply_shop_start_triggers(&mut state);

        Ok(Self { state, card_set })
    }

    /// Reset with a new seed (same set), returning the initial game state.
    pub fn reset_local(&mut self, seed: u64) -> GameStateResponse {
        let card_pool = std::mem::take(&mut self.state.card_pool);
        let set_id = self.state.set_id;
        self.state = GameState::new(seed);
        self.state.card_pool = card_pool;
        self.state.set_id = set_id;
        self.state.local_state.bag = create_starting_bag(&self.card_set, seed);
        self.state.local_state.next_card_id = 1000;
        self.state.draw_hand();
        apply_shop_start_triggers(&mut self.state);
        self.get_state()
    }

    /// Get the current game state.
    pub fn get_state(&self) -> GameStateResponse {
        let hand_used = vec![false; self.state.hand.len()];
        let view = GameView::from_state(&self.state, self.state.shop_mana, &hand_used, false);
        view.into()
    }

    /// Execute a turn: apply actions, run battle, advance round.
    /// Returns the step result with battle outcome and next state.
    pub fn step(&mut self, action: &CommitTurnAction) -> Result<StepResponse, String> {
        if self.state.phase == GamePhase::Completed {
            return Err("Game is already over. Call POST /reset to start a new game.".into());
        }
        if self.state.phase != GamePhase::Shop {
            return Err(format!("Wrong phase: {:?}", self.state.phase));
        }

        // Verify and apply turn
        oab_core::commit::verify_and_apply_turn(&mut self.state, action)
            .map_err(|e| format!("{:?}", e))?;

        // Leftover shop mana doesn't carry
        self.state.shop_mana = 0;
        self.state.phase = GamePhase::Battle;

        let completed_round = self.state.round;

        // Run battle
        let outcome = self.run_battle();

        // Check game over
        let game_over = self.state.wins >= WINS_TO_VICTORY || self.state.lives <= 0;
        let game_result = if game_over {
            self.state.phase = GamePhase::Completed;
            Some(
                if self.state.wins >= WINS_TO_VICTORY {
                    "victory"
                } else {
                    "defeat"
                }
                .to_string(),
            )
        } else {
            // Advance to next round
            self.state.round += 1;
            self.state.mana_limit = self.state.calculate_mana_limit();
            self.state.phase = GamePhase::Shop;
            self.state.draw_hand();
            apply_shop_start_triggers_with_result(&mut self.state, Some(outcome.result.clone()));
            None
        };

        let reward = match &outcome.result {
            BattleResult::Victory => 1,
            BattleResult::Defeat => -1,
            BattleResult::Draw => 0,
        };

        let battle_result_str = match &outcome.result {
            BattleResult::Victory => "Victory",
            BattleResult::Defeat => "Defeat",
            BattleResult::Draw => "Draw",
        };

        Ok(StepResponse {
            completed_round,
            battle_result: battle_result_str.to_string(),
            game_over,
            game_result,
            reward,
            battle_report: outcome.report,
            state: self.get_state(),
        })
    }

    /// Run a battle and apply results to state.
    /// Mirrors `client/src/engine.rs:run_battle()`.
    fn run_battle(&mut self) -> BattleOutcome {
        let mut player_slots = Vec::new();
        let player_units: Vec<CombatUnit> = self
            .state
            .board
            .iter()
            .enumerate()
            .filter_map(|(slot, unit)| {
                let u = unit.as_ref()?;
                player_slots.push(slot);
                let card = self.state.card_pool.get(&u.card_id)?;
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
                .unwrap_or_default();
        let enemy_count = enemy_units.len();

        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        let events = resolve_battle(player_units, enemy_units, &mut rng, &self.state.card_pool);

        self.state.shop_mana = player_shop_mana_delta_from_events(&events).max(0);
        let permanent_deltas = player_permanent_stat_deltas_from_events(&events);
        apply_permanent_deltas(&mut self.state, &player_slots, &permanent_deltas);

        let result = events
            .iter()
            .rev()
            .find_map(|e| {
                if let CombatEvent::BattleEnd { result } = e {
                    Some(result.clone())
                } else {
                    None
                }
            })
            .unwrap_or(BattleResult::Draw);

        match &result {
            BattleResult::Victory => self.state.wins += 1,
            BattleResult::Defeat => self.state.lives -= 1,
            BattleResult::Draw => {}
        }

        let player_units_survived = self.state.board.iter().filter(|s| s.is_some()).count();

        BattleOutcome {
            result,
            report: BattleReport {
                player_units_survived,
                enemy_units_faced: enemy_count,
                events,
            },
        }
    }
}

/// Apply permanent stat deltas from battle events to the player's board.
fn apply_permanent_deltas(
    state: &mut GameState,
    player_slots: &[usize],
    deltas: &BTreeMap<UnitId, (i32, i32)>,
) {
    for (unit_id, (attack_delta, health_delta)) in deltas {
        let unit_index = unit_id.raw() as usize;
        if unit_index == 0 || unit_index > player_slots.len() {
            continue;
        }

        let slot = player_slots[unit_index - 1];

        let death_check =
            if let Some(board_unit) = state.board.get_mut(slot).and_then(|s| s.as_mut()) {
                board_unit.perm_attack = board_unit.perm_attack.saturating_add(*attack_delta);
                board_unit.perm_health = board_unit.perm_health.saturating_add(*health_delta);
                Some((board_unit.card_id, board_unit.perm_health))
            } else {
                None
            };

        let should_remove = death_check
            .and_then(|(card_id, perm_health)| {
                state
                    .card_pool
                    .get(&card_id)
                    .map(|card| card.stats.health.saturating_add(perm_health) <= 0)
            })
            .unwrap_or(false);

        if should_remove {
            state.board[slot] = None;
        }
    }
}

impl GameBackend for GameSession {
    fn reset(&mut self, seed: u64, set_id: Option<u32>) -> Result<GameStateResponse, String> {
        if let Some(set_id) = set_id {
            *self = GameSession::new(seed, set_id)?;
        } else {
            self.reset_local(seed);
        }
        Ok(self.get_state())
    }

    fn step(&mut self, action: &CommitTurnAction) -> Result<StepResponse, String> {
        self.step(action)
    }

    fn get_state(&self) -> GameStateResponse {
        self.get_state()
    }

    fn get_cards(&self) -> Vec<oab_core::view::CardView> {
        self.state
            .card_pool
            .values()
            .map(oab_core::view::CardView::from)
            .collect()
    }

    fn get_sets(&self) -> Vec<crate::types::SetInfo> {
        let metas = oab_core::cards::get_all_set_metas();
        let sets = oab_core::cards::get_all_sets();
        metas
            .into_iter()
            .zip(sets.into_iter())
            .map(|(meta, set)| crate::types::SetInfo {
                id: meta.id,
                name: meta.name.to_string(),
                card_count: set.cards.len(),
            })
            .collect()
    }
}
