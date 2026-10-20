//! Golden-vector corpus: a fixed set of games over sets 0–2.
//!
//! The corpus plays each case the way arena v2 (`@oab/arena` version 2)
//! would: the same seed rules (`keccak(caller ++ context ++ nonce)`), the
//! same bracket order, and a fixed opponent per turn.
//!
//! `golden_vectors_match_engine_version` (this crate) hashes every output and
//! compares the hash with [`crate::ENGINE_VECTORS_HASH`]. An oracle test that
//! drove the arena v2 source through the same cases proved that the hash
//! describes arena v2 behaviour (removed with arena v2; see git history).
//!
//! Change this corpus only together with a new engine version: the hash
//! covers the inputs too.

use alloc::vec::Vec;
use parity_scale_codec::{Decode, Encode};

use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::types::{BoardUnit, CardId, CommitTurnAction, GhostBoardUnit, TurnAction};
use oab_battle::verify_and_apply_turn;
use oab_battle::GameError;
use oab_game::{GameConfig, GamePhase, GameState, LocalGameState};

use crate::{keccak256, new_game, resolve_turn, SetBundle, TurnInput, TurnOutput};

/// Turns played per case at most (a case also stops at game over).
pub const MAX_TURNS: usize = 14;

/// One corpus game.
#[derive(Debug, Clone, Copy, PartialEq, Encode, Decode)]
pub struct Case {
    pub set_id: u16,
    /// The arena v2 caller (seeds are keyed by it).
    pub caller: [u8; 20],
    /// The block number of `startGame`. The parent block hash is zero (the
    /// value `MockHost` returns), so the oracle can reproduce the start seed.
    pub block: u64,
}

/// One turn of a corpus game: inputs and the engine's answer.
#[derive(Debug, Clone, Encode, Decode)]
pub struct Step {
    pub action: CommitTurnAction,
    pub opponent: Vec<GhostBoardUnit>,
    pub battle_seed: u64,
    pub next_shop_seed: u64,
    pub output: Result<TurnOutput, GameError>,
}

/// One corpus game from start to the last turn.
#[derive(Debug, Clone, Encode, Decode)]
pub struct Trace {
    pub case: Case,
    pub start_seed: u64,
    pub start: LocalGameState,
    pub steps: Vec<Step>,
}

/// The game config arena v2 uses for every game (`default_config`).
pub fn arena_v2_config() -> GameConfig {
    oab_game::sealed::default_config()
}

/// Arena v2 `derive_seed`: `keccak(addr ++ context ++ nonce_le)[..8]` LE.
pub fn arena_v2_seed(addr: &[u8; 20], context: &[u8], nonce: u64) -> u64 {
    let mut input = Vec::with_capacity(20 + context.len() + 8);
    input.extend_from_slice(addr);
    input.extend_from_slice(context);
    input.extend_from_slice(&nonce.to_le_bytes());
    let h = keccak256(&input);
    u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]])
}

/// Arena v2 `block_entropy` with a zero parent block hash.
pub fn arena_v2_block_entropy(block: u64) -> u64 {
    let mut input = [0u8; 64];
    input[..8].copy_from_slice(&block.to_le_bytes());
    let h = keccak256(&input);
    u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]])
}

/// The corpus: four callers on each of sets 0, 1, 2.
pub fn cases() -> Vec<Case> {
    let mut out = Vec::new();
    for set_id in 0..3u16 {
        for k in 0..4u8 {
            out.push(Case {
                set_id,
                caller: [0x40 + k + (set_id as u8) * 4; 20],
                block: 1_000 + 7 * (set_id as u64) + k as u64,
            });
        }
    }
    out
}

/// Bundles for sets 0–2 from `oab-assets`, ids in asset order.
pub fn asset_bundles() -> Vec<SetBundle> {
    let cards = oab_assets::cards::get_all();
    oab_assets::sets::get_all()
        .into_iter()
        .enumerate()
        .filter_map(|(i, set)| {
            SetBundle::build(i as u16, set, |id| {
                cards.iter().find(|c| c.id == id).cloned()
            })
        })
        .collect()
}

fn turn_is_valid(
    state: &LocalGameState,
    config: &GameConfig,
    bundle: &SetBundle,
    actions: &[TurnAction],
) -> bool {
    let mut gs = GameState::reconstruct(bundle.card_pool(), 0, config.clone(), state.clone());
    verify_and_apply_turn(
        &mut gs.shop,
        &CommitTurnAction {
            actions: actions.to_vec(),
        },
    )
    .is_ok()
}

/// A simple, always-valid shop policy: walk the hand; play each card into
/// the first empty slot if the turn stays valid, else burn it if that stays
/// valid. Every third round, swap the front two units if both exist.
pub fn policy_action(
    state: &LocalGameState,
    config: &GameConfig,
    bundle: &SetBundle,
) -> CommitTurnAction {
    let mut actions: Vec<TurnAction> = Vec::new();
    let mut board: Vec<Option<BoardUnit>> = state.board.clone();
    for (i, card_id) in state.hand.iter().enumerate() {
        let i = i as u8;
        if let Some(slot) = board.iter().position(|s| s.is_none()) {
            let mut try_play = actions.clone();
            try_play.push(TurnAction::PlayFromHand {
                hand_index: i,
                board_slot: slot as u8,
            });
            if turn_is_valid(state, config, bundle, &try_play) {
                actions = try_play;
                board[slot] = Some(BoardUnit::new(*card_id));
                continue;
            }
        }
        let mut try_burn = actions.clone();
        try_burn.push(TurnAction::BurnFromHand { hand_index: i });
        if turn_is_valid(state, config, bundle, &try_burn) {
            actions = try_burn;
        }
    }
    if state.round % 3 == 0 && board.len() >= 2 && board[0].is_some() && board[1].is_some() {
        let mut try_swap = actions.clone();
        try_swap.push(TurnAction::SwapBoard {
            slot_a: 0,
            slot_b: 1,
        });
        if turn_is_valid(state, config, bundle, &try_swap) {
            actions = try_swap;
        }
    }
    CommitTurnAction { actions }
}

/// The opponent of turn `turn` (0-based) of case `case_index`. Every fifth
/// turn is an empty board. Others hold up to `min(round, 5)` units from the
/// set with small permanent buffs; some carry -1 health (arena v2 does not
/// clamp opponent health) or a card outside the set (skipped).
pub fn opponent(
    case_index: usize,
    turn: usize,
    round: u8,
    bundle: &SetBundle,
) -> Vec<GhostBoardUnit> {
    if turn % 5 == 4 {
        return Vec::new();
    }
    let mut seed_input = Vec::new();
    seed_input.extend_from_slice(b"oab/vectors/opponent");
    seed_input.extend_from_slice(&(case_index as u32).to_le_bytes());
    seed_input.extend_from_slice(&(turn as u32).to_le_bytes());
    let h = keccak256(&seed_input);
    let mut rng = XorShiftRng::seed_from_u64(u64::from_le_bytes([
        h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7],
    ]));
    let draftable: Vec<CardId> = bundle
        .set
        .cards
        .iter()
        .filter(|e| e.rarity > 0)
        .map(|e| e.card_id)
        .collect();
    if draftable.is_empty() {
        return Vec::new();
    }
    let max_units = (round as usize).clamp(1, 5);
    let count = 1 + rng.gen_range(max_units);
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        let card_id = if rng.gen_range(23) == 0 {
            CardId(9_999)
        } else {
            draftable[rng.gen_range(draftable.len())]
        };
        let buff = (round / 3) as usize + 1;
        let perm_attack = rng.gen_range(buff) as i16;
        let perm_health = if rng.gen_range(11) == 0 {
            -1
        } else {
            rng.gen_range(buff) as i16
        };
        out.push(GhostBoardUnit {
            card_id,
            perm_attack,
            perm_health,
        });
    }
    out
}

/// Play one case. The first case of each set also submits one invalid turn
/// (a hand index out of range) at its second turn, to pin the error path.
pub fn run_case(case_index: usize, case: Case, bundle: &SetBundle) -> Trace {
    let config = arena_v2_config();
    let pool = bundle.card_pool();
    let start_seed = arena_v2_seed(&case.caller, b"start", arena_v2_block_entropy(case.block));
    let start = new_game(&config, bundle, start_seed);
    let mut state = start.clone();
    let mut steps = Vec::new();
    for turn in 0..MAX_TURNS {
        if state.phase != GamePhase::Shop {
            break;
        }
        let opponent = opponent(case_index, turn, state.round, bundle);
        let battle_seed = arena_v2_seed(&case.caller, b"battle", state.game_seed);
        let next_shop_seed = arena_v2_seed(&case.caller, b"shop", state.game_seed);
        if turn == 1 && case_index % 4 == 0 {
            let action = CommitTurnAction {
                actions: alloc::vec![TurnAction::BurnFromHand { hand_index: 99 }],
            };
            let output = resolve_turn(TurnInput {
                config: &config,
                pool: &pool,
                state: state.clone(),
                action: action.clone(),
                opponent: opponent.clone(),
                battle_seed,
                next_shop_seed,
            });
            steps.push(Step {
                action,
                opponent: opponent.clone(),
                battle_seed,
                next_shop_seed,
                output,
            });
        }
        let action = policy_action(&state, &config, bundle);
        let output = resolve_turn(TurnInput {
            config: &config,
            pool: &pool,
            state: state.clone(),
            action: action.clone(),
            opponent: opponent.clone(),
            battle_seed,
            next_shop_seed,
        });
        if let Ok(out) = &output {
            state = out.state.clone();
        }
        let stop = output.is_err();
        steps.push(Step {
            action,
            opponent,
            battle_seed,
            next_shop_seed,
            output,
        });
        if stop {
            break;
        }
    }
    Trace {
        case,
        start_seed,
        start,
        steps,
    }
}

/// Every corpus trace, in case order.
pub fn traces() -> Vec<Trace> {
    let bundles = asset_bundles();
    cases()
        .into_iter()
        .enumerate()
        .filter_map(|(i, case)| {
            bundles
                .iter()
                .find(|b| b.set_id == case.set_id)
                .map(|b| run_case(i, case, b))
        })
        .collect()
}

/// keccak256 of SCALE(traces()). Compare with `ENGINE_VECTORS_HASH`.
pub fn vectors_hash() -> [u8; 32] {
    keccak256(&traces().encode())
}
