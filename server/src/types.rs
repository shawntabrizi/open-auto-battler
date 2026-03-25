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
    /// Cards remaining in the bag, grouped by card with counts.
    pub bag: Vec<BagCardEntry>,
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
            bag: Vec::new(), // Populated by GameSession::get_state()
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

/// A card entry in the bag summary (grouped by card_id with count).
#[derive(Debug, Serialize)]
pub struct BagCardEntry {
    pub card_id: u32,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub play_cost: i32,
    pub burn_value: i32,
    pub count: u32,
}

/// Error response.
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// ── Requests ──

/// A unit on a custom opponent board.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OpponentUnit {
    /// Card ID of the unit
    pub card_id: u32,
    /// Board slot (0=front, 4=back)
    pub slot: u32,
    /// Permanent attack buff (default: 0)
    #[serde(default)]
    pub perm_attack: i32,
    /// Permanent health buff (default: 0)
    #[serde(default)]
    pub perm_health: i32,
}

/// POST /reset request body (optional).
#[derive(Debug, Deserialize)]
pub struct ResetRequest {
    /// Game seed (default: random)
    #[serde(default)]
    pub seed: Option<u64>,
    /// Card set ID (default: 0)
    #[serde(default)]
    pub set_id: Option<u32>,
    /// Custom opponents per round. Key is round number (as string in JSON).
    /// If absent or empty, uses built-in opponents.
    #[serde(default)]
    pub opponents: Option<std::collections::BTreeMap<String, Vec<OpponentUnit>>>,
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
