//! # OAB Game Common
//!
//! Shared types, traits, and battle logic used by all game-mode pallets
//! (arena, tournament, constructed). This is NOT a FRAME pallet — it's
//! a utility crate with free functions parameterized by the [`GameEngine`] trait.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

use alloc::collections::BTreeMap;
use alloc::{vec, vec::Vec};
use codec::{Decode, Encode};
use frame::prelude::*;
use frame::traits::Randomness;
use oab_battle::bounded::{
    BoundedCommitTurnAction as CoreBoundedCommitTurnAction,
    BoundedGhostBoard as CoreBoundedGhostBoard, GhostBoardUnit, MatchmakingBracket,
};
use oab_battle::rng::BattleRng;
use oab_battle::types::{CardId, UnitCard};
use oab_battle::{
    apply_shop_start_triggers, apply_shop_start_triggers_with_result, resolve_battle,
    verify_and_apply_turn, BattleResult, CardSet, CombatUnit, CommitTurnAction, XorShiftRng,
};
use oab_game::bounded::{
    BoundedGameSession as CoreBoundedGameSession, BoundedGameState as CoreBoundedGameState,
    BoundedLocalGameState as CoreBoundedLocalGameState,
};
use oab_game::sealed::create_starting_bag;
use oab_game::{GamePhase, GameState};
use pallet_oab_card_registry::CardRegistryProvider;
use scale_info::TypeInfo;

// ── GameEngine trait ─────────────────────────────────────────────────

/// Trait that captures the shared capabilities game-mode pallets need.
/// Each pallet's `Config` extends this as a supertrait.
/// Implemented once on `Runtime` in the runtime config.
///
/// Extends `pallet_oab_card_registry::CardConfig` so the 4 card-related
/// constants (MaxAbilities, MaxStringLen, MaxConditions, MaxSetSize) are
/// defined once and shared by card-registry and all game-mode pallets.
pub trait GameEngine: pallet_oab_card_registry::CardConfig {
    type Randomness: Randomness<Self::Hash, BlockNumberFor<Self>>;
    type CardRegistry: CardRegistryProvider<Self::AccountId>;

    #[allow(missing_docs)]
    type MaxBagSize: Get<u32>;
    #[allow(missing_docs)]
    type MaxBoardSize: Get<u32>;
    #[allow(missing_docs)]
    type MaxHandActions: Get<u32>;
    #[allow(missing_docs)]
    type MaxGhostsPerBracket: Get<u32>;
}

// ── Type aliases ─────────────────────────────────────────────────────

pub type BoundedGameState<T> = CoreBoundedGameState<
    <T as GameEngine>::MaxBagSize,
    <T as GameEngine>::MaxBoardSize,
    <T as pallet_oab_card_registry::CardConfig>::MaxAbilities,
    <T as pallet_oab_card_registry::CardConfig>::MaxStringLen,
    <T as GameEngine>::MaxHandActions,
    <T as pallet_oab_card_registry::CardConfig>::MaxConditions,
>;

pub type BoundedLocalGameState<T> = CoreBoundedLocalGameState<
    <T as GameEngine>::MaxBagSize,
    <T as GameEngine>::MaxBoardSize,
    <T as GameEngine>::MaxHandActions,
>;

pub type BoundedGameSession<T> = CoreBoundedGameSession<
    <T as GameEngine>::MaxBagSize,
    <T as GameEngine>::MaxBoardSize,
    <T as GameEngine>::MaxHandActions,
>;

pub type BoundedCommitTurnAction<T> =
    CoreBoundedCommitTurnAction<<T as GameEngine>::MaxHandActions>;

pub type BoundedGhostBoard<T> = CoreBoundedGhostBoard<<T as GameEngine>::MaxBoardSize>;

// ── Shared types ─────────────────────────────────────────────────────

/// A ghost entry: an opponent board snapshot with the owner who created it.
#[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
#[scale_info(skip_type_params(T))]
pub struct GhostEntry<T: GameEngine> {
    pub owner: T::AccountId,
    pub board: BoundedGhostBoard<T>,
}

/// Transient struct holding everything needed for battle execution.
/// Not stored on-chain.
pub struct PreparedBattle {
    pub core_state: GameState,
    pub card_set: CardSet,
    pub player_units: Vec<CombatUnit>,
    pub player_slots: Vec<usize>,
    pub bracket: MatchmakingBracket,
    pub battle_seed: u64,
}

/// Result of executing a battle and advancing the game state.
/// Not stored on-chain.
pub struct TurnResult<T: GameEngine> {
    pub result: BattleResult,
    pub game_over: bool,
    pub completed_round: i32,
    pub opponent_ghost: BoundedGhostBoard<T>,
    pub new_seed: u64,
}

// ── Shared error ─────────────────────────────────────────────────────

/// Errors that shared game functions can return.
/// Game-mode pallets map these to their own `Error<T>`.
pub enum GameError {
    CardSetNotFound,
    InvalidTurn,
    InvalidDeck,
}

// ── Shared functions ─────────────────────────────────────────────────

/// Reconstruct a card pool from the card registry.
pub fn get_card_pool<T: GameEngine>(card_set: &CardSet) -> BTreeMap<CardId, UnitCard> {
    T::CardRegistry::get_card_pool(card_set)
}

/// Generate a unique seed per user/block/context.
pub fn generate_next_seed<T: GameEngine>(who: &T::AccountId, context: &[u8]) -> u64 {
    let random = T::Randomness::random(context);
    let mut seed_data = Vec::new();
    seed_data.extend_from_slice(&random.0.encode());
    seed_data.extend_from_slice(&who.encode());
    let hash = frame::hashing::blake2_128(&seed_data);
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&hash[0..8]);
    u64::from_le_bytes(bytes)
}

/// Convert a ghost board to combat units using the provided card pool.
pub fn ghost_to_combat_units<T: GameEngine>(
    ghost: &BoundedGhostBoard<T>,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> Vec<CombatUnit> {
    ghost
        .units
        .iter()
        .filter_map(|unit| {
            card_pool.get(&unit.card_id).map(|card| {
                let mut combat_unit = CombatUnit::from_card(card.clone());
                combat_unit.attack_buff = unit.perm_attack;
                combat_unit.health_buff = unit.perm_health;
                combat_unit.health = combat_unit.health.saturating_add(unit.perm_health);
                combat_unit
            })
        })
        .collect()
}

/// Create a ghost board from the current game state.
pub fn create_ghost_board<T: GameEngine>(core_state: &GameState) -> BoundedGhostBoard<T> {
    let units: Vec<GhostBoardUnit> = core_state
        .board
        .iter()
        .flatten()
        .map(|board_unit| GhostBoardUnit {
            card_id: board_unit.card_id,
            perm_attack: board_unit.perm_attack,
            perm_health: board_unit.perm_health,
        })
        .collect();

    let bounded_units: BoundedVec<GhostBoardUnit, T::MaxBoardSize> =
        units.try_into().unwrap_or_default();

    CoreBoundedGhostBoard {
        units: bounded_units,
    }
}

/// Apply permanent stat deltas from battle events to the player's board.
pub fn apply_player_permanent_stat_deltas(
    core_state: &mut GameState,
    player_slots: &[usize],
    deltas: &BTreeMap<oab_battle::battle::UnitId, (i32, i32)>,
) {
    for (unit_id, (attack_delta, health_delta)) in deltas {
        let unit_index = unit_id.raw() as usize;
        if unit_index == 0 || unit_index > player_slots.len() {
            continue;
        }
        let slot = player_slots[unit_index - 1];

        let unit_state =
            core_state
                .board
                .get_mut(slot)
                .and_then(|s| s.as_mut())
                .map(|board_unit| {
                    board_unit.perm_attack = board_unit.perm_attack.saturating_add(*attack_delta);
                    board_unit.perm_health = board_unit.perm_health.saturating_add(*health_delta);
                    (board_unit.card_id, board_unit.perm_health)
                });

        let should_remove = unit_state
            .and_then(|(card_id, perm_health)| {
                core_state
                    .card_pool
                    .get(&card_id)
                    .map(|card| card.stats.health.saturating_add(perm_health) <= 0)
            })
            .unwrap_or(false);

        if should_remove {
            core_state.board[slot] = None;
        }
    }
}

/// Initialize a new game state for a given card set.
pub fn initialize_game_state<T: GameEngine>(
    who: &T::AccountId,
    set_id: u32,
    seed_context: &[u8],
) -> Result<(BoundedLocalGameState<T>, u64), GameError> {
    let card_set = T::CardRegistry::get_card_set(set_id).ok_or(GameError::CardSetNotFound)?;
    let card_pool = get_card_pool::<T>(&card_set);

    let seed = generate_next_seed::<T>(who, seed_context);

    let config = oab_game::sealed::default_config();
    let mut state = GameState::reconstruct(
        card_pool,
        set_id,
        config.clone(),
        oab_game::LocalGameState {
            bag: create_starting_bag(&card_set, seed, config.bag_size as usize),
            hand: Vec::new(),
            board: vec![None; config.board_size as usize],
            mana_limit: config.mana_limit_for_round(1),
            shop_mana: 0,
            round: 1,
            lives: config.starting_lives,
            wins: 0,
            phase: GamePhase::Shop,
            next_card_id: 1000,
            game_seed: seed,
        },
    );

    state.draw_hand(config.hand_size as usize);
    apply_shop_start_triggers(&mut state);

    let (_, _, _config, local_state) = state.decompose();
    Ok((local_state.into(), seed))
}

/// Initialize a new constructed game state with a user-provided deck.
///
/// The deck is validated against the full card pool (no tokens, copy limit,
/// exact bag size). The card pool is built from ALL cards in the registry.
pub fn initialize_constructed_game_state<T: GameEngine>(
    who: &T::AccountId,
    deck: Vec<u32>,
    card_set: &CardSet,
    card_pool: &BTreeMap<CardId, UnitCard>,
    seed_context: &[u8],
) -> Result<(BoundedLocalGameState<T>, u64), GameError> {
    let config = oab_game::constructed::default_config();

    // Validate deck against the card set
    oab_game::constructed::validate_deck(
        &deck,
        card_set,
        oab_game::constructed::MAX_COPIES_PER_CARD,
        config.bag_size as usize,
    )
    .map_err(|_| GameError::InvalidDeck)?;

    let seed = generate_next_seed::<T>(who, seed_context);

    let bag: Vec<CardId> = deck.into_iter().map(CardId).collect();

    let mut state = GameState::reconstruct(
        card_pool.clone(),
        0, // constructed doesn't use a specific set_id
        config.clone(),
        oab_game::LocalGameState {
            bag,
            hand: Vec::new(),
            board: vec![None; config.board_size as usize],
            mana_limit: config.mana_limit_for_round(1),
            shop_mana: 0,
            round: 1,
            lives: config.starting_lives,
            wins: 0,
            phase: GamePhase::Shop,
            next_card_id: 1000,
            game_seed: seed,
        },
    );

    state.draw_hand(config.hand_size as usize);
    apply_shop_start_triggers(&mut state);

    let (_, _, _config, local_state) = state.decompose();
    Ok((local_state.into(), seed))
}

/// Verify a turn action, extract player board, and prepare for battle.
pub fn prepare_battle<T: GameEngine>(
    who: &T::AccountId,
    set_id: u32,
    config: oab_game::GameConfig,
    local_state: oab_game::LocalGameState,
    action: BoundedCommitTurnAction<T>,
    battle_seed_context: &[u8],
) -> Result<PreparedBattle, GameError> {
    let card_set = T::CardRegistry::get_card_set(set_id).ok_or(GameError::CardSetNotFound)?;
    let card_pool = get_card_pool::<T>(&card_set);

    let mut core_state = GameState::reconstruct(card_pool, set_id, config, local_state);

    let core_action: CommitTurnAction = action.into();
    verify_and_apply_turn(&mut core_state, &core_action).map_err(|_| GameError::InvalidTurn)?;

    core_state.shop_mana = 0;

    let battle_seed = generate_next_seed::<T>(who, battle_seed_context);

    let mut player_slots = Vec::new();
    let player_units: Vec<CombatUnit> = core_state
        .board
        .iter()
        .enumerate()
        .filter_map(|(slot, board_unit)| {
            let board_unit = board_unit.as_ref()?;
            player_slots.push(slot);
            core_state.card_pool.get(&board_unit.card_id).map(|card| {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = board_unit.perm_attack;
                cu.health_buff = board_unit.perm_health;
                cu.health = cu.health.saturating_add(board_unit.perm_health).max(0);
                cu
            })
        })
        .collect();

    let bracket = MatchmakingBracket {
        set_id,
        round: core_state.round,
        wins: core_state.wins,
        lives: core_state.lives,
    };

    Ok(PreparedBattle {
        core_state,
        card_set,
        player_units,
        player_slots,
        bracket,
        battle_seed,
    })
}

/// Like [`prepare_battle`] but takes a pre-built card set and pool directly.
/// Used by constructed mode where the card pool isn't tied to a specific set_id.
pub fn prepare_battle_with_pool<T: GameEngine>(
    who: &T::AccountId,
    card_set: CardSet,
    card_pool: BTreeMap<CardId, UnitCard>,
    config: oab_game::GameConfig,
    local_state: oab_game::LocalGameState,
    action: BoundedCommitTurnAction<T>,
    battle_seed_context: &[u8],
) -> Result<PreparedBattle, GameError> {
    let mut core_state = GameState::reconstruct(card_pool, 0, config, local_state);

    let core_action: CommitTurnAction = action.into();
    verify_and_apply_turn(&mut core_state, &core_action).map_err(|_| GameError::InvalidTurn)?;

    core_state.shop_mana = 0;

    let battle_seed = generate_next_seed::<T>(who, battle_seed_context);

    let mut player_slots = Vec::new();
    let player_units: Vec<CombatUnit> = core_state
        .board
        .iter()
        .enumerate()
        .filter_map(|(slot, board_unit)| {
            let board_unit = board_unit.as_ref()?;
            player_slots.push(slot);
            core_state.card_pool.get(&board_unit.card_id).map(|card| {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = board_unit.perm_attack;
                cu.health_buff = board_unit.perm_health;
                cu.health = cu.health.saturating_add(board_unit.perm_health).max(0);
                cu
            })
        })
        .collect();

    let bracket = MatchmakingBracket {
        set_id: 0,
        round: core_state.round,
        wins: core_state.wins,
        lives: core_state.lives,
    };

    Ok(PreparedBattle {
        core_state,
        card_set,
        player_units,
        player_slots,
        bracket,
        battle_seed,
    })
}

/// Execute the battle, apply results, and advance to the next round if not game over.
pub fn execute_and_advance<T: GameEngine>(
    who: &T::AccountId,
    battle: &mut PreparedBattle,
    enemy_units: Vec<CombatUnit>,
    next_seed_context: &[u8],
) -> TurnResult<T> {
    // Capture opponent ghost board for event emission
    let opponent_ghost: BoundedGhostBoard<T> = {
        let units: Vec<GhostBoardUnit> = enemy_units
            .iter()
            .map(|cu| GhostBoardUnit {
                card_id: cu.card_id,
                perm_attack: cu.attack_buff,
                perm_health: cu.health_buff,
            })
            .collect();
        CoreBoundedGhostBoard {
            units: units.try_into().unwrap_or_default(),
        }
    };

    let player_units = core::mem::take(&mut battle.player_units);

    let mut rng = XorShiftRng::seed_from_u64(battle.battle_seed);
    let events = resolve_battle(
        player_units,
        enemy_units,
        &mut rng,
        &battle.core_state.card_pool,
        battle.core_state.config.board_size as usize,
    );

    battle.core_state.shop_mana =
        oab_battle::battle::player_shop_mana_delta_from_events(&events).max(0);
    let permanent_deltas = oab_battle::battle::player_permanent_stat_deltas_from_events(&events);
    apply_player_permanent_stat_deltas(
        &mut battle.core_state,
        &battle.player_slots,
        &permanent_deltas,
    );

    let result = events
        .iter()
        .rev()
        .find_map(|e| {
            if let oab_battle::battle::CombatEvent::BattleEnd { result } = e {
                Some(result.clone())
            } else {
                None
            }
        })
        .unwrap_or(BattleResult::Draw);

    match result {
        BattleResult::Victory => {
            battle.core_state.wins += 1;
        }
        BattleResult::Defeat => {
            battle.core_state.lives -= 1;
        }
        BattleResult::Draw => {}
    }

    let completed_round = battle.core_state.round;
    let game_over = battle.core_state.lives <= 0
        || battle.core_state.wins >= battle.core_state.config.wins_to_victory;

    let new_seed = if !game_over {
        let new_seed = generate_next_seed::<T>(who, next_seed_context);
        battle.core_state.game_seed = new_seed;
        battle.core_state.round += 1;
        battle.core_state.mana_limit = battle
            .core_state
            .config
            .mana_limit_for_round(battle.core_state.round);
        if battle.core_state.config.full_mana_each_round {
            battle.core_state.shop_mana = battle.core_state.mana_limit;
        }
        battle.core_state.phase = GamePhase::Shop;
        battle
            .core_state
            .draw_hand(battle.core_state.config.hand_size as usize);
        apply_shop_start_triggers_with_result(&mut battle.core_state, Some(result.clone()));
        new_seed
    } else {
        0
    };

    TurnResult {
        result,
        game_over,
        completed_round,
        opponent_ghost,
        new_seed,
    }
}

/// Select a ghost opponent from a pre-loaded ghost pool.
/// Returns None if the pool is empty.
pub fn select_ghost_from_pool<T: GameEngine>(
    ghosts: &BoundedVec<GhostEntry<T>, T::MaxGhostsPerBracket>,
    card_set: &CardSet,
    seed: u64,
) -> Option<Vec<CombatUnit>> {
    if ghosts.is_empty() {
        return None;
    }

    let mut rng = XorShiftRng::seed_from_u64(seed);
    let index = rng.gen_range(ghosts.len());
    let ghost_entry = &ghosts[index];

    let card_pool = get_card_pool::<T>(card_set);
    Some(ghost_to_combat_units::<T>(&ghost_entry.board, &card_pool))
}

/// Push a ghost entry into a pool with FIFO rotation at capacity.
pub fn push_ghost_to_pool<T: GameEngine>(
    ghosts: &mut BoundedVec<GhostEntry<T>, T::MaxGhostsPerBracket>,
    owner: &T::AccountId,
    ghost: BoundedGhostBoard<T>,
) {
    let ghost_entry = GhostEntry {
        owner: owner.clone(),
        board: ghost,
    };
    if ghosts.len() >= T::MaxGhostsPerBracket::get() as usize {
        ghosts.remove(0);
    }
    let _ = ghosts.try_push(ghost_entry);
}

/// Grant bronze achievement for every card currently on the player's board.
pub fn grant_bronze_achievements<T: GameEngine>(who: &T::AccountId, core_state: &GameState) {
    use pallet_oab_card_registry::pallet::ACHIEVEMENT_BRONZE;
    for board_unit in core_state.board.iter().flatten() {
        let card_id = board_unit.card_id.0;
        let current = T::CardRegistry::get_achievements(who, card_id);
        if current & ACHIEVEMENT_BRONZE == 0 {
            T::CardRegistry::set_achievements(who, card_id, current | ACHIEVEMENT_BRONZE);
        }
    }
}

/// Grant silver/gold achievements for cards on the final board after a completed game.
pub fn finalize_game_achievements<T: GameEngine>(
    who: &T::AccountId,
    config: &oab_game::GameConfig,
    state: &BoundedLocalGameState<T>,
) {
    use pallet_oab_card_registry::pallet::{ACHIEVEMENT_GOLD, ACHIEVEMENT_SILVER};
    if state.wins >= config.wins_to_victory {
        let mut new_bits = ACHIEVEMENT_SILVER;
        if state.lives >= config.starting_lives {
            new_bits |= ACHIEVEMENT_GOLD;
        }
        for board_unit in state.board.iter().flatten() {
            let card_id = board_unit.card_id.0;
            let old = T::CardRegistry::get_achievements(who, card_id);
            let updated = old | new_bits;
            if updated != old {
                T::CardRegistry::set_achievements(who, card_id, updated);
            }
        }
    }
}

/// Build a ghost board from a BoundedLocalGameState (for finalization).
pub fn build_ghost_from_state<T: GameEngine>(
    state: &BoundedLocalGameState<T>,
) -> BoundedGhostBoard<T> {
    let units: Vec<GhostBoardUnit> = state
        .board
        .iter()
        .flatten()
        .map(|board_unit| GhostBoardUnit {
            card_id: board_unit.card_id,
            perm_attack: board_unit.perm_attack,
            perm_health: board_unit.perm_health,
        })
        .collect();

    CoreBoundedGhostBoard {
        units: units.try_into().unwrap_or_default(),
    }
}
