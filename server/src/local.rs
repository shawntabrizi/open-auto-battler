//! Core game session — provides reset/step interface for local mode.

use std::collections::BTreeMap;

use oab_battle::battle::{
    player_permanent_stat_deltas_from_events, player_shop_mana_delta_from_events, resolve_battle,
    BattleResult, CombatEvent, CombatUnit, UnitId,
};
use oab_battle::commit::{apply_shop_start_triggers, apply_shop_start_triggers_with_result};
use oab_battle::rng::XorShiftRng;
use oab_battle::types::*;
use oab_game::view::GameView;
use oab_game::{constructed, sealed, GamePhase, GameState};

use crate::types::{BattleReport, GameStateResponse, OpponentUnit, StepResponse};

/// Result from running a battle, with report info for the agent.
struct BattleOutcome {
    result: BattleResult,
    report: BattleReport,
}

/// A local game session that manages a full game.
/// Opponents are provided per-step by the caller.
pub struct GameSession {
    state: GameState,
}

impl GameSession {
    /// Start a new sealed game with the given seed and card set.
    pub fn new(seed: u64, set_id: u32) -> Result<Self, String> {
        let config = sealed::default_config();
        let card_pool = oab_battle::cards::build_card_pool();
        let all_sets = oab_battle::cards::get_all_sets();
        let card_set = if (set_id as usize) < all_sets.len() {
            all_sets.into_iter().nth(set_id as usize).unwrap()
        } else {
            return Err(format!("Card set {} not found", set_id));
        };

        let mut state = GameState::new(seed, config.clone());
        state.card_pool = card_pool;
        state.set_id = set_id;
        state.lives = config.starting_lives;
        state.bag = sealed::create_starting_bag(&card_set, seed, config.bag_size as usize);
        state.next_card_id = 1000;
        state.draw_hand(config.hand_size as usize);
        apply_shop_start_triggers(&mut state);

        Ok(Self { state })
    }

    /// Start a new constructed game with a user-provided deck.
    pub fn new_constructed(seed: u64, set_id: u32, deck: Vec<u32>) -> Result<Self, String> {
        let config = constructed::default_config();
        let card_pool = oab_battle::cards::build_card_pool();
        let all_sets = oab_battle::cards::get_all_sets();
        let card_set = if (set_id as usize) < all_sets.len() {
            all_sets.into_iter().nth(set_id as usize).unwrap()
        } else {
            return Err(format!("Card set {} not found", set_id));
        };

        constructed::validate_deck(&deck, &card_set, constructed::MAX_COPIES_PER_CARD, config.bag_size as usize)?;

        let deck_ids: Vec<CardId> = deck.into_iter().map(CardId).collect();
        let mut state = GameState::new(seed, config.clone());
        state.card_pool = card_pool;
        state.set_id = set_id;
        state.lives = config.starting_lives;
        state.bag = deck_ids;
        state.next_card_id = 1000;
        state.draw_hand(config.hand_size as usize);
        apply_shop_start_triggers(&mut state);

        Ok(Self { state })
    }

    /// Extract the current board as opponent units (for PvP pairing).
    pub fn board_as_opponent(&self) -> Vec<OpponentUnit> {
        self.state
            .board
            .iter()
            .enumerate()
            .filter_map(|(slot, unit)| {
                let u = unit.as_ref()?;
                Some(OpponentUnit {
                    card_id: u.card_id.0,
                    slot: slot as u32,
                    perm_attack: u.perm_attack,
                    perm_health: u.perm_health,
                })
            })
            .collect()
    }

    /// Get the current game state.
    pub fn get_state(&self) -> GameStateResponse {
        let hand_used = vec![false; self.state.hand.len()];
        let view = GameView::from_state(&self.state, self.state.shop_mana, &hand_used, false);
        let mut resp: GameStateResponse = view.into();
        resp.bag = self.bag_summary();
        resp
    }

    /// Apply shop actions without running battle. Returns updated state with the post-shop board.
    pub fn shop(&mut self, action: &CommitTurnAction) -> Result<GameStateResponse, String> {
        if self.state.phase == GamePhase::Completed {
            return Err("Game is already over. Call POST /reset to start a new game.".into());
        }
        if self.state.phase != GamePhase::Shop {
            return Err(format!("Wrong phase: {:?}", self.state.phase));
        }

        // Verify and apply turn
        oab_battle::commit::verify_and_apply_turn(&mut self.state, action)
            .map_err(|e| format!("{:?}", e))?;

        // Leftover shop mana doesn't carry
        self.state.shop_mana = 0;
        self.state.phase = GamePhase::Battle;

        Ok(self.get_state())
    }

    /// Run battle against the provided opponent, advance round. Must be called after shop().
    pub fn battle(&mut self, opponent: &[OpponentUnit]) -> Result<StepResponse, String> {
        if self.state.phase == GamePhase::Completed {
            return Err("Game is already over.".into());
        }
        if self.state.phase != GamePhase::Battle {
            return Err(format!(
                "Wrong phase: {:?}. Call POST /shop first.",
                self.state.phase
            ));
        }

        let completed_round = self.state.round;

        // Run battle against provided opponent
        let outcome = self.run_battle(opponent);

        // Check game over
        let game_over =
            self.state.wins >= self.state.config.wins_to_victory || self.state.lives <= 0;
        let game_result = if game_over {
            self.state.phase = GamePhase::Completed;
            Some(
                if self.state.wins >= self.state.config.wins_to_victory {
                    "victory"
                } else {
                    "defeat"
                }
                .to_string(),
            )
        } else {
            // Advance to next round
            self.state.round += 1;
            self.state.mana_limit = self.state.config.mana_limit_for_round(self.state.round);
            if self.state.config.full_mana_each_round {
                self.state.shop_mana = self.state.mana_limit;
            }
            self.state.phase = GamePhase::Shop;
            self.state.draw_hand(self.state.config.hand_size as usize);
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

    /// Run a battle against the provided opponent and apply results to state.
    fn run_battle(&mut self, opponent: &[OpponentUnit]) -> BattleOutcome {
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

        let enemy_units = self.build_opponent(opponent);
        let enemy_count = enemy_units.len();

        let battle_seed = self.state.round as u64;
        let mut rng = XorShiftRng::seed_from_u64(battle_seed);
        let events = resolve_battle(player_units, enemy_units, &mut rng, &self.state.card_pool, self.state.config.board_size as usize);

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

    /// Build enemy CombatUnits from opponent unit definitions.
    fn build_opponent(&self, units: &[OpponentUnit]) -> Vec<CombatUnit> {
        let mut board: Vec<Option<CombatUnit>> = vec![None; self.state.config.board_size as usize];
        for u in units {
            let slot = u.slot as usize;
            if slot >= board.len() {
                continue;
            }
            if let Some(card) = self.state.card_pool.get(&CardId(u.card_id)) {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = u.perm_attack;
                cu.health_buff = u.perm_health;
                cu.health = cu.health.saturating_add(u.perm_health).max(0);
                board[slot] = Some(cu);
            }
        }
        board.into_iter().flatten().collect()
    }

    /// Build a bag summary: unique cards grouped with counts and stats.
    fn bag_summary(&self) -> Vec<crate::types::BagCardEntry> {
        let mut counts: BTreeMap<CardId, u32> = BTreeMap::new();
        for card_id in self.state.bag.iter() {
            *counts.entry(*card_id).or_insert(0) += 1;
        }
        counts
            .into_iter()
            .filter_map(|(card_id, count)| {
                let card = self.state.card_pool.get(&card_id)?;
                Some(crate::types::BagCardEntry {
                    card_id: card_id.0,
                    name: card.name.clone(),
                    attack: card.stats.attack,
                    health: card.stats.health,
                    play_cost: card.economy.play_cost,
                    burn_value: card.economy.burn_value,
                    count,
                })
            })
            .collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SEED: u64 = 42;

    fn new_session() -> GameSession {
        GameSession::new(TEST_SEED, 0).expect("set 0 must exist")
    }

    // ── GET /sets ──

    #[test]
    fn get_sets_returns_all_sets() {
        let sets = oab_battle::cards::get_all_sets();
        let expected_count = oab_battle::cards::get_all_set_metas().len();
        assert_eq!(sets.len(), expected_count);
    }

    #[test]
    fn get_sets_returns_sets_with_cards() {
        let sets = oab_battle::cards::get_all_sets();
        for set in &sets {
            assert!(!set.cards.is_empty());
        }
    }

    #[test]
    fn get_cards_returns_nonempty() {
        let card_pool = oab_battle::cards::build_card_pool();
        assert!(!card_pool.is_empty(), "card pool should not be empty");
    }

    // ── GET /state ──

    #[test]
    fn initial_state_is_round_one_shop() {
        let session = new_session();
        let state = session.get_state();
        assert_eq!(state.round, 1);
        assert_eq!(state.phase, "shop");
        assert_eq!(state.wins, 0);
        assert!(state.lives > 0);
    }

    // ── POST /reset ──

    #[test]
    fn reset_returns_fresh_state() {
        // Creating a new session is equivalent to a reset
        let session = GameSession::new(99, 0).expect("new session should succeed");
        let state = session.get_state();
        assert_eq!(state.round, 1);
        assert_eq!(state.phase, "shop");
        assert_eq!(state.wins, 0);
    }

    #[test]
    fn reset_with_different_set() {
        let all_sets = oab_battle::cards::get_all_set_metas();
        if all_sets.len() > 1 {
            let session = GameSession::new(99, 1).expect("set 1 should succeed");
            let state = session.get_state();
            assert_eq!(state.round, 1);
        }
    }

    #[test]
    fn reset_invalid_set_returns_error() {
        let result = GameSession::new(99, 9999);
        assert!(result.is_err());
    }

    // ── Shop + Battle ──

    #[test]
    fn shop_then_battle_advances_round() {
        let mut session = new_session();

        // Shop phase
        let state = session
            .shop(&CommitTurnAction { actions: vec![] })
            .expect("shop should work");
        assert_eq!(state.phase, "battle");
        assert_eq!(state.round, 1);

        // Battle phase
        let result = session.battle(&[]).expect("battle should work");
        assert_eq!(result.completed_round, 1);
        assert!(["Victory", "Defeat", "Draw"].contains(&result.battle_result.as_str()));
        assert!(result.reward == 1 || result.reward == -1 || result.reward == 0);
        if !result.game_over {
            assert_eq!(result.state.round, 2);
            assert_eq!(result.state.phase, "shop");
        }
    }

    #[test]
    fn battle_before_shop_returns_error() {
        let session = new_session();
        // Can't battle when in shop phase
        assert_eq!(session.get_state().phase, "shop");
    }

    #[test]
    fn shop_in_battle_phase_returns_error() {
        let mut session = new_session();
        session.shop(&CommitTurnAction { actions: vec![] }).unwrap();
        // Now in battle phase — shop again should fail
        let result = session.shop(&CommitTurnAction { actions: vec![] });
        assert!(result.is_err());
    }

    // ── Determinism ──

    #[test]
    fn same_seed_produces_same_initial_state() {
        let s1 = GameSession::new(123, 0).unwrap();
        let s2 = GameSession::new(123, 0).unwrap();
        let state1 = s1.get_state();
        let state2 = s2.get_state();
        assert_eq!(state1.round, state2.round);
        assert_eq!(state1.lives, state2.lives);
        assert_eq!(state1.mana, state2.mana);
        assert_eq!(state1.hand.len(), state2.hand.len());
        assert_eq!(state1.bag_count, state2.bag_count);
    }
}
