//! HTTP API request/response types.

use oab_core::battle::CombatEvent;
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
}

impl From<GameView> for GameStateResponse {
    fn from(v: GameView) -> Self {
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
    /// Details of the battle that was fought (mirrors on-chain BattleReported event)
    pub battle_report: BattleReport,
    /// Current game state after this step (next round, or final state if game_over)
    pub state: GameStateResponse,
}

/// Report of a completed battle.
#[derive(Debug, Clone, Serialize)]
pub struct BattleReport {
    /// How many of your units survived the battle
    pub player_units_survived: usize,
    /// How many units the opponent had
    pub enemy_units_faced: usize,
    /// Full sequence of battle events
    pub events: Vec<CombatEvent>,
}

/// A card set summary.
#[derive(Debug, Serialize)]
pub struct SetInfo {
    pub id: u32,
    pub name: String,
    pub card_count: usize,
    pub cards: Vec<SetCardEntry>,
}

/// A card entry within a set, exposing card_id and rarity weight.
#[derive(Debug, Serialize)]
pub struct SetCardEntry {
    pub card_id: u32,
    pub rarity: u32,
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
