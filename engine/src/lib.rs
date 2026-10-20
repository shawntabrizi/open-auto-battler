//! Open Auto Battler engine facade (`oab-engine`).
//!
//! One source for the game rules that a mode contract, the `@oab/engine`
//! contract, and the browser client all run. It wraps `oab-battle` and
//! `oab-game` and holds no state: every function is pure.
//!
//! - [`new_game`]: the start of a game (bag, first hand, shop-start triggers).
//! - [`resolve_turn`]: one shop turn plus its battle, as arena v2's
//!   `submit_turn` did it, without storage, ghost choice, or seed derivation.
//! - [`replay_battle`]: the battle of a reported turn, from boards and a seed.
//!
//! Seeds and the choice of opponent are mode policy. The caller passes them.
//!
//! The behaviour is pinned by [`ENGINE_VERSION`] and [`ENGINE_VECTORS_HASH`].
//! See `docs/CONTRACT_ARCHITECTURE.md` sections 4.1 and 10.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

use alloc::collections::BTreeMap;
use alloc::vec;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, Encode};

use oab_battle::battle::{
    player_permanent_stat_deltas_from_events, player_shop_mana_delta_from_events, resolve_battle,
    BattleResult, CombatEvent, CombatUnit,
};
use oab_battle::rng::XorShiftRng;
use oab_battle::state::CardSet;
use oab_battle::types::{
    BoardUnit, CardId, CommitTurnAction, GhostBoardUnit, ManaValue, SetIdValue, UnitCard,
};
use oab_battle::{apply_shop_start_triggers, apply_shop_start_triggers_with_result};
use oab_battle::{verify_and_apply_turn, GameError};
use oab_game::sealed::create_starting_bag;
use oab_game::{GameConfig, GamePhase, GameState, LocalGameState};

#[cfg(any(test, feature = "vectors"))]
pub mod vectors;

/// Every released engine version and its golden-vector hash, oldest first.
/// Append only: a released entry never changes, because deployed engine
/// contracts and stored games refer to it. A behaviour change adds a new
/// entry with the next version number.
pub const ENGINE_HISTORY: &[(u32, [u8; 32])] = &[(
    1,
    [
        0xd8, 0xd7, 0xc2, 0x1e, 0x3b, 0x7e, 0xf1, 0xf6, 0x7b, 0xef, 0xb1, 0x55, 0x37, 0x0c, 0xfe,
        0x55, 0xa7, 0x84, 0x0d, 0xe2, 0x25, 0x9c, 0x4d, 0x4e, 0xc8, 0xb9, 0x85, 0x17, 0xae, 0xe6,
        0x8b, 0x5c,
    ],
)];

/// The engine identity. Modes store it in every game and event; the frontend
/// picks its WASM build by it.
pub const ENGINE_VERSION: u32 = ENGINE_HISTORY[ENGINE_HISTORY.len() - 1].0;

/// keccak256 of the SCALE outputs of the golden-vector corpus (`vectors`).
/// The `golden_vectors_match_engine_version` test fails when the engine's
/// behaviour changes; then add a new [`ENGINE_HISTORY`] entry.
pub const ENGINE_VECTORS_HASH: [u8; 32] = ENGINE_HISTORY[ENGINE_HISTORY.len() - 1].1;

/// The `next_card_id` of a new game. Arena v2 started at 1000; kept for
/// identical state bytes.
pub const FIRST_CARD_ID: u16 = 1000;

/// keccak256 (the hash the chain uses for storage keys and set hashes).
pub fn keccak256(data: &[u8]) -> [u8; 32] {
    use tiny_keccak::{Hasher, Keccak};
    let mut k = Keccak::v256();
    let mut out = [0u8; 32];
    k.update(data);
    k.finalize(&mut out);
    out
}

/// Everything one game needs from Content, resolved and pinned.
///
/// `cards` holds every card the set references, once, in the order of first
/// appearance in `set.cards`. Content builds it that way, so one set has one
/// byte form and one hash.
#[derive(Debug, Clone, PartialEq, Encode, Decode)]
pub struct SetBundle {
    pub set_id: SetIdValue,
    pub set: CardSet,
    pub cards: Vec<UnitCard>,
}

impl SetBundle {
    /// Build the canonical bundle. `card` looks a card up by id. Returns
    /// `None` if the set is empty or references a card that `card` lacks.
    pub fn build(
        set_id: SetIdValue,
        set: CardSet,
        mut card: impl FnMut(CardId) -> Option<UnitCard>,
    ) -> Option<Self> {
        if set.cards.is_empty() {
            return None;
        }
        let mut cards: Vec<UnitCard> = Vec::with_capacity(set.cards.len());
        for entry in &set.cards {
            if cards.iter().any(|c| c.id == entry.card_id) {
                continue;
            }
            let c = card(entry.card_id)?;
            if c.id != entry.card_id {
                return None;
            }
            cards.push(c);
        }
        Some(Self { set_id, set, cards })
    }

    /// keccak256(SCALE(self)). A mode stores it with each game; anyone can
    /// check a cached copy against Content's `setHash`.
    pub fn hash(&self) -> [u8; 32] {
        keccak256(&self.encode())
    }

    /// The card pool the battle and shop code look cards up in.
    pub fn card_pool(&self) -> BTreeMap<CardId, UnitCard> {
        self.cards.iter().map(|c| (c.id, c.clone())).collect()
    }
}

/// One turn's inputs. Seeds and the opponent come from the mode.
pub struct TurnInput<'a> {
    pub config: &'a GameConfig,
    pub pool: &'a BTreeMap<CardId, UnitCard>,
    /// Phase must be `Shop`.
    pub state: LocalGameState,
    pub action: CommitTurnAction,
    pub opponent: Vec<GhostBoardUnit>,
    pub battle_seed: u64,
    pub next_shop_seed: u64,
}

/// One turn's result.
#[derive(Debug, Clone, Encode, Decode)]
pub struct TurnOutput {
    /// The next shop, or the `Completed` game.
    pub state: LocalGameState,
    pub result: BattleResult,
    /// The board that fought (after the shop actions, before battle deltas).
    /// Modes push it as a ghost and report it for replay.
    pub player_board: Vec<GhostBoardUnit>,
    /// Combat events. A contract may drop them; [`replay_battle`] recomputes
    /// them from `player_board`, the opponent, and the battle seed.
    pub events: Vec<CombatEvent>,
}

fn combat_unit(card: &UnitCard, perm_attack: i16, perm_health: i16, clamp: bool) -> CombatUnit {
    let mut cu = CombatUnit::from_card(card.clone());
    cu.attack_buff = perm_attack;
    cu.health_buff = perm_health;
    cu.health = cu.health.saturating_add(perm_health);
    if clamp {
        cu.health = cu.health.max(0);
    }
    cu
}

/// The player's combat units, in slot order. Health is clamped at 0 (arena
/// v2 does this for the player side only). Cards missing from `pool` are
/// skipped.
pub fn board_to_units(
    board: &[Option<BoardUnit>],
    pool: &BTreeMap<CardId, UnitCard>,
) -> Vec<CombatUnit> {
    board
        .iter()
        .flatten()
        .filter_map(|bu| {
            pool.get(&bu.card_id)
                .map(|card| combat_unit(card, bu.perm_attack, bu.perm_health, true))
        })
        .collect()
}

/// An opponent ghost's combat units. Health is not clamped (arena v2
/// `select_ghost`). Cards missing from `pool` are skipped.
pub fn ghost_to_units(
    ghost: &[GhostBoardUnit],
    pool: &BTreeMap<CardId, UnitCard>,
) -> Vec<CombatUnit> {
    ghost
        .iter()
        .filter_map(|u| {
            pool.get(&u.card_id)
                .map(|card| combat_unit(card, u.perm_attack, u.perm_health, false))
        })
        .collect()
}

/// The ghost form of a board: occupied slots in order.
pub fn board_to_ghost(board: &[Option<BoardUnit>]) -> Vec<GhostBoardUnit> {
    board
        .iter()
        .flatten()
        .map(|bu| GhostBoardUnit {
            card_id: bu.card_id,
            perm_attack: bu.perm_attack,
            perm_health: bu.perm_health,
        })
        .collect()
}

/// Recompute the combat events of a reported battle. `player` is
/// `TurnOutput::player_board`; the result equals `TurnOutput::events`.
pub fn replay_battle(
    player: &[GhostBoardUnit],
    opponent: &[GhostBoardUnit],
    seed: u64,
    pool: &BTreeMap<CardId, UnitCard>,
    board_size: usize,
) -> Vec<CombatEvent> {
    let player_units = player
        .iter()
        .filter_map(|u| {
            pool.get(&u.card_id)
                .map(|card| combat_unit(card, u.perm_attack, u.perm_health, true))
        })
        .collect();
    let enemy_units = ghost_to_units(opponent, pool);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    resolve_battle(player_units, enemy_units, &mut rng, pool, board_size)
}

/// The final result in `events` (`Draw` if there is none).
pub fn battle_result(events: &[CombatEvent]) -> BattleResult {
    events
        .iter()
        .rev()
        .find_map(|e| match e {
            CombatEvent::BattleEnd { result } => Some(result.clone()),
            _ => None,
        })
        .unwrap_or(BattleResult::Draw)
}

fn to_game_state(
    pool: BTreeMap<CardId, UnitCard>,
    config: &GameConfig,
    state: LocalGameState,
) -> GameState {
    // `ShopState::set_id` is not read by the shop or battle code.
    GameState::reconstruct(pool, 0, config.clone(), state)
}

/// Start a game: draw the bag from the set, draw the first hand, run the
/// shop-start triggers. `seed` is the game seed (mode policy).
pub fn new_game(config: &GameConfig, bundle: &SetBundle, seed: u64) -> LocalGameState {
    let state = LocalGameState {
        bag: create_starting_bag(&bundle.set, seed, config.bag_size as usize),
        hand: Vec::new(),
        board: vec![None; config.board_size as usize],
        mana_limit: config.mana_limit_for_round(1),
        shop_mana: 0,
        round: 1,
        lives: config.starting_lives,
        wins: 0,
        phase: GamePhase::Shop,
        next_card_id: FIRST_CARD_ID,
        game_seed: seed,
    };
    let mut gs = to_game_state(bundle.card_pool(), config, state);
    gs.draw_hand(config.hand_size as usize);
    apply_shop_start_triggers(&mut gs.shop);
    gs.decompose().3
}

/// Apply one shop turn, fight `opponent`, and move to the next shop (or end
/// the game). This is arena v2's `submit_turn` body without storage.
pub fn resolve_turn(input: TurnInput) -> Result<TurnOutput, GameError> {
    let TurnInput {
        config,
        pool,
        state,
        action,
        opponent,
        battle_seed,
        next_shop_seed,
    } = input;
    if state.phase != GamePhase::Shop {
        return Err(GameError::WrongPhase);
    }

    let mut gs = to_game_state(pool.clone(), config, state);
    verify_and_apply_turn(&mut gs.shop, &action)?;
    gs.shop.shop_mana = 0;

    // Player units and the board slot of each (unit id n = slot list index
    // n - 1). A slot whose card is missing from the pool still takes a list
    // entry, as in arena v2.
    let mut player_slots = Vec::new();
    let player_units: Vec<CombatUnit> = gs
        .shop
        .board
        .iter()
        .enumerate()
        .filter_map(|(slot, bu)| {
            let bu = bu.as_ref()?;
            player_slots.push(slot);
            pool.get(&bu.card_id)
                .map(|card| combat_unit(card, bu.perm_attack, bu.perm_health, true))
        })
        .collect();
    let enemy_units = ghost_to_units(&opponent, pool);
    let player_board = board_to_ghost(&gs.shop.board);

    let mut rng = XorShiftRng::seed_from_u64(battle_seed);
    let events = resolve_battle(
        player_units,
        enemy_units,
        &mut rng,
        pool,
        config.board_size as usize,
    );
    let result = battle_result(&events);

    let mana_delta: ManaValue = player_shop_mana_delta_from_events(&events).max(0) as ManaValue;
    for (unit_id, (attack_delta, health_delta)) in
        &player_permanent_stat_deltas_from_events(&events)
    {
        let idx = unit_id.raw() as usize;
        if idx == 0 || idx > player_slots.len() {
            continue;
        }
        let slot = player_slots[idx - 1];
        let remove = if let Some(Some(bu)) = gs.shop.board.get_mut(slot) {
            bu.perm_attack = bu.perm_attack.saturating_add(*attack_delta);
            bu.perm_health = bu.perm_health.saturating_add(*health_delta);
            pool.get(&bu.card_id)
                .map(|c| c.stats.health.saturating_add(bu.perm_health) <= 0)
                .unwrap_or(false)
        } else {
            false
        };
        if remove {
            if let Some(s) = gs.shop.board.get_mut(slot) {
                *s = None;
            }
        }
    }

    match result {
        BattleResult::Victory => gs.wins = gs.wins.saturating_add(1),
        BattleResult::Defeat => gs.lives = gs.lives.saturating_sub(1),
        BattleResult::Draw => {}
    }
    let game_over = gs.lives == 0 || gs.wins >= config.wins_to_victory;

    if !game_over {
        gs.shop.game_seed = next_shop_seed;
        // Saturating: endless empty-board draws never end the game.
        gs.shop.round = gs.shop.round.saturating_add(1);
        gs.shop.mana_limit = config.mana_limit_for_round(gs.shop.round);
        gs.shop.shop_mana = if config.full_mana_each_round {
            gs.shop.mana_limit
        } else {
            mana_delta
        };
        let hand = core::mem::take(&mut gs.shop.hand);
        gs.bag.extend(hand);
        gs.phase = GamePhase::Shop;
        gs.draw_hand(config.hand_size as usize);
        apply_shop_start_triggers_with_result(&mut gs.shop, Some(result.clone()));
    } else {
        gs.shop.shop_mana = mana_delta;
        gs.phase = GamePhase::Completed;
    }

    Ok(TurnOutput {
        state: gs.decompose().3,
        result,
        player_board,
        events,
    })
}

#[cfg(test)]
mod tests;
