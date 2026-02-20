use crate::pallet::*;
use alloc::collections::BTreeMap;
use alloc::{vec, vec::Vec};
use frame::prelude::*;
use frame::traits::Randomness;
use oab_core::bounded::{
    BoundedGhostBoard as CoreBoundedGhostBoard, GhostBoardUnit, MatchmakingBracket,
};
use oab_core::rng::BattleRng;
use oab_core::{
    apply_shop_start_triggers, resolve_battle, verify_and_apply_turn, BattleResult, CardSet,
    CombatUnit, CommitTurnAction, GamePhase, GameState, UnitCard, XorShiftRng,
};
use oab_core::units::create_starting_bag;

/// Transient struct holding everything needed for battle execution.
/// Not stored on-chain.
pub(crate) struct PreparedBattle {
    pub core_state: GameState,
    pub card_set: CardSet,
    pub player_units: Vec<CombatUnit>,
    pub player_slots: Vec<usize>,
    pub bracket: MatchmakingBracket,
    pub battle_seed: u64,
}

/// Result of executing a battle and advancing the game state.
/// Not stored on-chain.
pub(crate) struct TurnResult<T: Config> {
    pub result: BattleResult,
    pub game_over: bool,
    pub current_wins: i32,
    pub completed_round: i32,
    pub opponent_ghost: BoundedGhostBoard<T>,
    pub new_seed: u64,
}

impl<T: Config> Pallet<T> {
    // ── Moved helpers ──────────────────────────────────────────────────

    /// Reconstruct a card pool from storage based on a card set.
    pub(crate) fn get_card_pool(card_set: &CardSet) -> BTreeMap<oab_core::types::CardId, UnitCard> {
        let mut card_pool = BTreeMap::new();
        for entry in &card_set.cards {
            if let Some(user_data) = UserCards::<T>::get(entry.card_id.0) {
                card_pool.insert(
                    entry.card_id,
                    Self::entry_to_unit_card(entry.card_id, user_data),
                );
            }
        }
        card_pool
    }

    /// Convert UserCardData to UnitCard.
    fn entry_to_unit_card(id: oab_core::types::CardId, data: UserCardData<T>) -> UnitCard {
        UnitCard {
            id,
            name: alloc::string::String::new(),
            stats: data.stats,
            economy: data.economy,
            abilities: data.abilities.into_iter().map(|a| a.into()).collect(),
        }
    }

    /// Generate a unique seed per user/block/context.
    pub(crate) fn generate_next_seed(who: &T::AccountId, context: &[u8]) -> u64 {
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
    pub(crate) fn ghost_to_combat_units(
        ghost: &BoundedGhostBoard<T>,
        card_pool: &BTreeMap<oab_core::types::CardId, UnitCard>,
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
    pub(crate) fn create_ghost_board(core_state: &GameState) -> BoundedGhostBoard<T> {
        let units: Vec<GhostBoardUnit> = core_state
            .local_state
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
    pub(crate) fn apply_player_permanent_stat_deltas(
        core_state: &mut GameState,
        player_slots: &[usize],
        deltas: &BTreeMap<oab_core::battle::UnitId, (i32, i32)>,
    ) {
        for (unit_id, (attack_delta, health_delta)) in deltas {
            let unit_index = unit_id.raw() as usize;
            if unit_index == 0 || unit_index > player_slots.len() {
                continue;
            }
            let slot = player_slots[unit_index - 1];

            let unit_state = core_state
                .local_state
                .board
                .get_mut(slot)
                .and_then(|s| s.as_mut())
                .map(|board_unit| {
                    board_unit.perm_attack =
                        board_unit.perm_attack.saturating_add(*attack_delta);
                    board_unit.perm_health =
                        board_unit.perm_health.saturating_add(*health_delta);
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
                core_state.local_state.board[slot] = None;
            }
        }
    }

    /// Derive the pallet's account ID from PalletId.
    pub(crate) fn pallet_account_id() -> T::AccountId {
        use frame::deps::sp_runtime::traits::AccountIdConversion;
        T::PalletId::get().into_account_truncating()
    }

    // ── New shared functions ───────────────────────────────────────────

    /// Initialize a new game state for a given card set.
    /// Used by both `start_game` and `join_tournament`.
    pub(crate) fn initialize_game_state(
        who: &T::AccountId,
        set_id: u32,
        seed_context: &[u8],
    ) -> Result<(BoundedLocalGameState<T>, u64), DispatchError> {
        let card_set_bounded =
            CardSets::<T>::get(set_id).ok_or(Error::<T>::CardSetNotFound)?;
        let card_set: CardSet = card_set_bounded.into();
        let card_pool = Self::get_card_pool(&card_set);

        let seed = Self::generate_next_seed(who, seed_context);

        let mut state = GameState::reconstruct(
            card_pool,
            set_id,
            oab_core::state::LocalGameState {
                bag: create_starting_bag(&card_set, seed),
                hand: Vec::new(),
                board: vec![None; 5],
                mana_limit: 3,
                shop_mana: 0,
                round: 1,
                lives: 3,
                wins: 0,
                phase: GamePhase::Shop,
                next_card_id: 1000,
                game_seed: seed,
            },
        );

        state.draw_hand();
        apply_shop_start_triggers(&mut state);

        let (_, _, local_state) = state.decompose();
        Ok((local_state.into(), seed))
    }

    /// Verify a turn action, extract player board, and prepare for battle.
    /// Used by both `submit_turn` and `submit_tournament_turn`.
    pub(crate) fn prepare_battle(
        who: &T::AccountId,
        set_id: u32,
        local_state: oab_core::state::LocalGameState,
        action: BoundedCommitTurnAction<T>,
        battle_seed_context: &[u8],
    ) -> Result<PreparedBattle, DispatchError> {
        let card_set_bounded =
            CardSets::<T>::get(set_id).ok_or(Error::<T>::CardSetNotFound)?;
        let card_set: CardSet = card_set_bounded.into();
        let card_pool = Self::get_card_pool(&card_set);

        let mut core_state =
            GameState::reconstruct(card_pool, set_id, local_state);

        let core_action: CommitTurnAction = action.into();
        verify_and_apply_turn(&mut core_state, &core_action)
            .map_err(|_| Error::<T>::InvalidTurn)?;

        core_state.local_state.shop_mana = 0;

        let battle_seed = Self::generate_next_seed(who, battle_seed_context);

        let mut player_slots = Vec::new();
        let player_units: Vec<CombatUnit> = core_state
            .local_state
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
            round: core_state.local_state.round,
            wins: core_state.local_state.wins,
            lives: core_state.local_state.lives,
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
    /// Used by both `submit_turn` and `submit_tournament_turn`.
    pub(crate) fn execute_and_advance(
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

        // Take player_units out of the struct for resolve_battle (which consumes them)
        let player_units = core::mem::take(&mut battle.player_units);

        let mut rng = XorShiftRng::seed_from_u64(battle.battle_seed);
        let events = resolve_battle(
            player_units,
            enemy_units,
            &mut rng,
            &battle.core_state.card_pool,
        );

        battle.core_state.local_state.shop_mana =
            oab_core::battle::player_shop_mana_delta_from_events(&events).max(0);
        let permanent_deltas =
            oab_core::battle::player_permanent_stat_deltas_from_events(&events);
        Self::apply_player_permanent_stat_deltas(
            &mut battle.core_state,
            &battle.player_slots,
            &permanent_deltas,
        );

        let result = events
            .iter()
            .rev()
            .find_map(|e| {
                if let oab_core::battle::CombatEvent::BattleEnd { result } = e {
                    Some(result.clone())
                } else {
                    None
                }
            })
            .unwrap_or(BattleResult::Draw);

        match result {
            BattleResult::Victory => {
                battle.core_state.local_state.wins += 1;
            }
            BattleResult::Defeat => {
                battle.core_state.local_state.lives -= 1;
            }
            BattleResult::Draw => {}
        }

        let completed_round = battle.core_state.local_state.round;
        let current_wins = battle.core_state.local_state.wins;
        let game_over =
            battle.core_state.local_state.lives <= 0 || current_wins >= 10;

        let new_seed = if !game_over {
            let new_seed = Self::generate_next_seed(who, next_seed_context);
            battle.core_state.local_state.game_seed = new_seed;
            battle.core_state.local_state.round += 1;
            battle.core_state.local_state.mana_limit =
                battle.core_state.calculate_mana_limit();
            battle.core_state.local_state.phase = GamePhase::Shop;
            battle.core_state.draw_hand();
            apply_shop_start_triggers(&mut battle.core_state);
            new_seed
        } else {
            0
        };

        TurnResult {
            result,
            game_over,
            current_wins,
            completed_round,
            opponent_ghost,
            new_seed,
        }
    }

    /// Select a ghost opponent from a pre-loaded ghost pool.
    /// Returns None if the pool is empty.
    pub(crate) fn select_ghost_from_pool(
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

        let card_pool = Self::get_card_pool(card_set);
        Some(Self::ghost_to_combat_units(&ghost_entry.board, &card_pool))
    }

    /// Push a ghost entry into a pool with FIFO rotation at capacity.
    pub(crate) fn push_ghost_to_pool(
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
}
