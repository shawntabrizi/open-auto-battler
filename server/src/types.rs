//! HTTP API request/response types.

use oab_core::types::CommitTurnAction;
use oab_core::view::{BoardUnitView, CardView, GameView};
use serde::{Deserialize, Serialize};

// ── Responses ──

/// Game state returned by POST /reset and POST /step.
#[derive(Debug, Serialize)]
pub struct GameStateResponse {
    pub round: i32,
    pub lives: i32,
    pub wins: i32,
    pub mana: i32,
    pub mana_limit: i32,
    pub phase: String,
    pub bag_count: u32,
    pub hand: Vec<Option<CardView>>,
    pub board: Vec<Option<BoardUnitView>>,
    pub can_afford: Vec<bool>,
    /// Factual observations about the current turn situation.
    pub hints: Vec<String>,
}

impl From<GameView> for GameStateResponse {
    fn from(v: GameView) -> Self {
        let total_burn: i32 = v
            .hand
            .iter()
            .filter_map(|c| c.as_ref().map(|c| c.burn_value))
            .sum();
        let potential_mana = (v.mana + total_burn).min(v.mana_limit);

        let board_count = v.board.iter().filter(|b| b.is_some()).count();
        let hand_cards: Vec<&CardView> = v.hand.iter().filter_map(|c| c.as_ref()).collect();
        let cheapest_hand = hand_cards.iter().map(|c| c.play_cost).min();
        let any_affordable_now = hand_cards.iter().any(|c| c.play_cost <= v.mana);
        let any_affordable_after_burn = hand_cards.iter().any(|c| c.play_cost <= potential_mana);

        let mut hints = Vec::new();

        if v.mana == 0 && !hand_cards.is_empty() {
            hints.push("Mana is 0. Burn hand cards to gain mana before playing.".into());
        }

        if !any_affordable_now && any_affordable_after_burn {
            hints.push(
                "No hand cards are affordable at current mana, but burning cards would provide enough."
                    .into(),
            );
        }

        if !any_affordable_after_burn && !hand_cards.is_empty() {
            if let Some(cheapest) = cheapest_hand {
                if cheapest > v.mana_limit {
                    hints.push(format!(
                        "All hand cards cost more than this round's mana limit ({}). Burn them for mana or let them return to the bag.",
                        v.mana_limit
                    ));
                } else {
                    hints.push(
                        "Not enough mana to play any hand card even after burning all others."
                            .into(),
                    );
                }
            }
        }

        if board_count >= 5 && !hand_cards.is_empty() {
            hints.push(
                "Board is full (5/5). Sell a board unit (BurnFromBoard) to make room for new cards."
                    .into(),
            );
        }

        if board_count == 0 && hand_cards.is_empty() {
            hints.push("No units on board and no cards in hand.".into());
        }

        Self {
            round: v.round,
            lives: v.lives,
            wins: v.wins,
            mana: v.mana,
            mana_limit: v.mana_limit,
            phase: v.phase,
            bag_count: v.bag_count,
            hand: v.hand,
            board: v.board,
            can_afford: v.can_afford,
            hints,
        }
    }
}

/// Result of POST /step — includes what happened and the next state.
#[derive(Debug, Serialize)]
pub struct StepResponse {
    /// The round number this battle was for
    pub completed_round: i32,
    /// The battle result: "Victory", "Defeat", or "Draw"
    pub battle_result: String,
    /// Whether the game is over
    pub game_over: bool,
    /// "victory", "defeat", or null if game is not over
    pub game_result: Option<String>,
    /// The reward signal for RL: +1 for victory round, -1 for defeat round, 0 for draw
    pub reward: i32,
    /// Summary of what happened in the battle
    pub battle_summary: BattleSummary,
    /// Current game state after this step (next round, or final state if game_over)
    pub state: GameStateResponse,
}

/// Summary of a battle for agent feedback.
#[derive(Debug, Serialize)]
pub struct BattleSummary {
    /// How many of your units survived the battle
    pub player_units_survived: usize,
    /// How many units the opponent had
    pub enemy_units_faced: usize,
}

/// Error response.
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// ── Requests ──

/// POST /reset request body (optional).
#[derive(Debug, Deserialize)]
pub struct ResetRequest {
    /// Game seed (default: random)
    #[serde(default)]
    pub seed: Option<u64>,
    /// Card set ID (default: 0)
    #[serde(default)]
    pub set_id: Option<u32>,
}

/// POST /step request body.
#[derive(Debug, Deserialize)]
pub struct StepRequest {
    /// Turn actions to execute
    pub actions: Vec<oab_core::types::TurnAction>,
}

impl From<StepRequest> for CommitTurnAction {
    fn from(req: StepRequest) -> Self {
        CommitTurnAction {
            actions: req.actions,
        }
    }
}
