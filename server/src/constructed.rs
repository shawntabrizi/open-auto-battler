//! Constructed mode — PvP match management.
//!
//! Two players each bring a constructed deck, play independent shop phases,
//! then battle each other's boards each round.

use crate::local::GameSession;
use crate::types::{GameStateResponse, StepResponse};

use oab_battle::types::CommitTurnAction;

/// A constructed match between two players.
pub struct ConstructedMatch {
    pub match_id: String,
    pub set_id: u32,
    players: [Option<ConstructedPlayer>; 2],
    shops_submitted: [bool; 2],
}

struct ConstructedPlayer {
    agent_id: String,
    session: GameSession,
}

impl ConstructedMatch {
    /// Create a new match waiting for players.
    pub fn new(match_id: String, set_id: u32) -> Self {
        Self {
            match_id,
            set_id,
            players: [None, None],
            shops_submitted: [false, false],
        }
    }

    /// Join the match with a constructed deck. Returns the player's initial game state.
    pub fn join(
        &mut self,
        agent_id: String,
        deck: Vec<u32>,
        seed: u64,
    ) -> Result<GameStateResponse, String> {
        // Find an open slot
        let slot = if self.players[0].is_none() {
            0
        } else if self.players[1].is_none() {
            1
        } else {
            return Err("Match is full".into());
        };

        // Prevent duplicate agent IDs
        if let Some(existing) = &self.players[1 - slot] {
            if existing.agent_id == agent_id {
                return Err(format!("Agent '{}' already in this match", agent_id));
            }
        }

        let session = GameSession::new_constructed(seed, self.set_id, deck)?;
        let state = session.get_state();
        self.players[slot] = Some(ConstructedPlayer { agent_id, session });
        Ok(state)
    }

    /// Whether both players have joined.
    pub fn is_full(&self) -> bool {
        self.players[0].is_some() && self.players[1].is_some()
    }

    /// Apply shop actions for a player.
    pub fn shop(
        &mut self,
        agent_id: &str,
        action: &CommitTurnAction,
    ) -> Result<GameStateResponse, String> {
        if !self.is_full() {
            return Err("Waiting for both players to join".into());
        }

        let idx = self.player_index(agent_id)?;
        if self.shops_submitted[idx] {
            return Err("Shop already submitted this round".into());
        }

        let player = self.players[idx]
            .as_mut()
            .ok_or("Player not found")?;
        let state = player.session.shop(action)?;
        self.shops_submitted[idx] = true;
        Ok(state)
    }

    /// Whether both players have submitted their shop actions.
    pub fn ready_for_battle(&self) -> bool {
        self.shops_submitted[0] && self.shops_submitted[1]
    }

    /// Run the paired battle. Both players must have submitted shop actions.
    /// Returns [player_0_result, player_1_result].
    pub fn battle(&mut self) -> Result<[StepResponse; 2], String> {
        if !self.ready_for_battle() {
            return Err("Both players must submit shop actions before battle".into());
        }

        // Extract boards before mutating sessions
        let board_0 = self.players[0]
            .as_ref()
            .ok_or("Player 0 not found")?
            .session
            .board_as_opponent();
        let board_1 = self.players[1]
            .as_ref()
            .ok_or("Player 1 not found")?
            .session
            .board_as_opponent();

        // Player 0 battles player 1's board
        let result_0 = self.players[0]
            .as_mut()
            .ok_or("Player 0 not found")?
            .session
            .battle(&board_1)?;

        // Player 1 battles player 0's board
        let result_1 = self.players[1]
            .as_mut()
            .ok_or("Player 1 not found")?
            .session
            .battle(&board_0)?;

        // Reset shop submission tracking for next round
        self.shops_submitted = [false, false];

        Ok([result_0, result_1])
    }

    /// Get the current game state for a player.
    pub fn get_state(&self, agent_id: &str) -> Result<GameStateResponse, String> {
        let idx = self.player_index(agent_id)?;
        let player = self.players[idx]
            .as_ref()
            .ok_or("Player not found")?;
        Ok(player.session.get_state())
    }

    /// Find a player's index by agent_id.
    fn player_index(&self, agent_id: &str) -> Result<usize, String> {
        for (i, slot) in self.players.iter().enumerate() {
            if let Some(p) = slot {
                if p.agent_id == agent_id {
                    return Ok(i);
                }
            }
        }
        Err(format!("Agent '{}' not found in match '{}'", agent_id, self.match_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_deck(set_id: u32) -> Vec<u32> {
        let sets = oab_assets::sets::get_all();
        let set = &sets[set_id as usize];
        // Build a valid 50-card deck using draftable cards
        let draftable: Vec<u32> = set
            .cards
            .iter()
            .filter(|e| e.rarity > 0)
            .map(|e| e.card_id.0)
            .collect();
        assert!(!draftable.is_empty(), "set must have draftable cards");
        (0..50).map(|i| draftable[i % draftable.len()]).collect()
    }

    #[test]
    fn full_constructed_match_flow() {
        let mut m = ConstructedMatch::new("test".into(), 0);
        assert!(!m.is_full());

        // Both players join
        let state_a = m.join("alice".into(), sample_deck(0), 1).unwrap();
        assert!(!m.is_full());
        assert_eq!(state_a.round, 1);
        assert_eq!(state_a.phase, "shop");

        let state_b = m.join("bob".into(), sample_deck(0), 2).unwrap();
        assert!(m.is_full());
        assert_eq!(state_b.round, 1);

        // Third player rejected
        assert!(m.join("eve".into(), sample_deck(0), 3).is_err());

        // Both submit shop (empty actions)
        let action = CommitTurnAction { actions: vec![] };
        m.shop("alice", &action).unwrap();
        assert!(!m.ready_for_battle());
        m.shop("bob", &action).unwrap();
        assert!(m.ready_for_battle());

        // Battle
        let [res_a, res_b] = m.battle().unwrap();
        assert_eq!(res_a.completed_round, 1);
        assert_eq!(res_b.completed_round, 1);
        assert!(!m.ready_for_battle()); // reset for next round
    }

    #[test]
    fn battle_before_both_shops_fails() {
        let mut m = ConstructedMatch::new("test".into(), 0);
        m.join("alice".into(), sample_deck(0), 1).unwrap();
        m.join("bob".into(), sample_deck(0), 2).unwrap();

        // Only alice shops
        let action = CommitTurnAction { actions: vec![] };
        m.shop("alice", &action).unwrap();
        assert!(m.battle().is_err());
    }

    #[test]
    fn duplicate_agent_rejected() {
        let mut m = ConstructedMatch::new("test".into(), 0);
        m.join("alice".into(), sample_deck(0), 1).unwrap();
        assert!(m.join("alice".into(), sample_deck(0), 2).is_err());
    }

    #[test]
    fn double_shop_submit_rejected() {
        let mut m = ConstructedMatch::new("test".into(), 0);
        m.join("alice".into(), sample_deck(0), 1).unwrap();
        m.join("bob".into(), sample_deck(0), 2).unwrap();

        let action = CommitTurnAction { actions: vec![] };
        m.shop("alice", &action).unwrap();
        assert!(m.shop("alice", &action).is_err());
    }
}
