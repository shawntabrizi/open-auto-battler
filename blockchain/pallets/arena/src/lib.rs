//! # OAB Arena Pallet
//!
//! FRAME pallet for the Open Auto Battler arena (sealed) game mode.
//! Players start a sealed game, submit turns each round, and the pallet
//! manages ghost-opponent matchmaking and achievement tracking.
//!
//! Delegates core game logic to [`oab_common`].

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

pub use pallet::*;

#[frame::pallet]
pub mod pallet {

    use alloc::vec::Vec;
    use frame::prelude::*;
    use oab_battle::bounded::{GhostBoardUnit, MatchmakingBracket};
    use oab_battle::{BattleResult, CardSet, CombatUnit};
    use oab_game::GamePhase;
    use pallet_oab_card_registry::CardRegistryProvider;

    // ── Type aliases (convenience re-exports from oab_common) ──────

    /// Bounded game session type.
    pub type BoundedGameSession<T> = oab_common::BoundedGameSession<T>;

    /// Bounded local game state type.
    pub type BoundedLocalGameState<T> = oab_common::BoundedLocalGameState<T>;

    /// Bounded commit turn action type.
    pub type BoundedCommitTurnAction<T> = oab_common::BoundedCommitTurnAction<T>;

    /// Bounded ghost board type.
    pub type BoundedGhostBoard<T> = oab_common::BoundedGhostBoard<T>;

    // ── Pallet declaration ──────────────────────────────────────────────

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    // ── Config ──────────────────────────────────────────────────────────

    #[pallet::config]
    pub trait Config: frame_system::Config + oab_common::GameEngine {
        /// Because this pallet emits events, it depends on the runtime's definition of an event.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// Type representing the weight of this pallet.
        type WeightInfo: WeightInfo;

        /// Origin that can backfill ghost boards (e.g. root or sudo).
        type AdminOrigin: EnsureOrigin<Self::RuntimeOrigin>;
    }

    // ── WeightInfo trait ────────────────────────────────────────────────

    pub trait WeightInfo {
        fn start_game() -> Weight;
        fn submit_turn() -> Weight;
        fn abandon_game() -> Weight;
        fn end_game() -> Weight;
        fn backfill_ghost_board() -> Weight;
    }

    impl WeightInfo for () {
        fn start_game() -> Weight {
            Weight::from_parts(100_000_000, 0)
        }
        fn submit_turn() -> Weight {
            Weight::from_parts(400_000_000, 0)
        }
        fn abandon_game() -> Weight {
            Weight::from_parts(60_000_000, 0)
        }
        fn end_game() -> Weight {
            Weight::from_parts(120_000_000, 0)
        }
        fn backfill_ghost_board() -> Weight {
            Weight::from_parts(180_000_000, 0)
        }
    }

    // ── Types ───────────────────────────────────────────────────────────

    /// An archived ghost entry with full context for off-chain analysis.
    /// The bracket is implicit in the storage key.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct GhostArchiveEntry<T: Config> {
        /// The player who created this ghost board.
        pub owner: T::AccountId,
        /// The ghost board data.
        pub board: BoundedGhostBoard<T>,
        /// Block number when the ghost was created.
        pub created_at: BlockNumberFor<T>,
    }

    // ── Storage ─────────────────────────────────────────────────────────

    /// Map of active arena games: AccountId -> GameSession.
    #[pallet::storage]
    pub type ActiveGame<T: Config> =
        StorageMap<_, Blake2_128Concat, T::AccountId, BoundedGameSession<T>, OptionQuery>;

    /// Ghost opponents indexed by matchmaking bracket.
    /// Key: (set_id, round, wins, lives)
    /// Value: Vector of ghost entries for that bracket.
    #[pallet::storage]
    pub type GhostOpponents<T: Config> = StorageNMap<
        _,
        (
            NMapKey<Blake2_128Concat, u32>, // set_id
            NMapKey<Blake2_128Concat, i32>, // round
            NMapKey<Blake2_128Concat, i32>, // wins
            NMapKey<Blake2_128Concat, i32>, // lives
        ),
        BoundedVec<oab_common::GhostEntry<T>, <T as oab_common::GameEngine>::MaxGhostsPerBracket>,
        ValueQuery,
    >;

    /// Archive of all ghost boards ever created (for off-chain analytics).
    /// Key: (set_id, round, wins, lives, archive_id)
    /// Value: Individual ghost archive entry.
    #[pallet::storage]
    pub type GhostArchive<T: Config> = StorageNMap<
        _,
        (
            NMapKey<Blake2_128Concat, u32>, // set_id
            NMapKey<Blake2_128Concat, i32>, // round
            NMapKey<Blake2_128Concat, i32>, // wins
            NMapKey<Blake2_128Concat, i32>, // lives
            NMapKey<Blake2_128Concat, u64>, // archive_id
        ),
        GhostArchiveEntry<T>,
        OptionQuery,
    >;

    /// Next available ghost archive ID (global counter).
    #[pallet::storage]
    pub type NextGhostArchiveId<T: Config> = StorageValue<_, u64, ValueQuery>;

    // ── Events ──────────────────────────────────────────────────────────

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A new arena game has started.
        GameStarted { owner: T::AccountId, seed: u64 },
        /// A battle result has been reported.
        BattleReported {
            owner: T::AccountId,
            round: i32,
            result: BattleResult,
            new_seed: u64,
            battle_seed: u64,
            opponent_board: BoundedGhostBoard<T>,
        },
        /// An arena game has been abandoned.
        GameAbandoned { owner: T::AccountId },
        /// An arena game has been finalized.
        GameEnded {
            owner: T::AccountId,
            wins: i32,
            lives: i32,
            round: i32,
        },
        /// A ghost board has been backfilled into a matchmaking bracket.
        GhostBoardBackfilled {
            set_id: u32,
            round: i32,
            wins: i32,
            lives: i32,
            pool_size: u32,
        },
    }

    // ── Errors ──────────────────────────────────────────────────────────

    #[pallet::error]
    pub enum Error<T> {
        /// User tried to submit a turn without starting a game.
        NoActiveGame,
        /// User tried to start a new game while one exists.
        GameAlreadyActive,
        /// The turn action failed verification.
        InvalidTurn,
        /// Tried to perform an action in the wrong phase.
        WrongPhase,
        /// The specified card set does not exist.
        CardSetNotFound,
        /// The supplied ghost bracket is invalid.
        InvalidGhostBracket,
        /// The supplied ghost board cannot be empty.
        EmptyGhostBoard,
        /// A card in the supplied ghost board is not part of the target set.
        GhostCardNotInSet,
    }

    impl<T: Config> From<oab_common::GameError> for Error<T> {
        fn from(e: oab_common::GameError) -> Self {
            match e {
                oab_common::GameError::CardSetNotFound => Error::<T>::CardSetNotFound,
                oab_common::GameError::InvalidTurn => Error::<T>::InvalidTurn,
            }
        }
    }

    // ── Extrinsics ──────────────────────────────────────────────────────

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Start a new arena game session.
        /// Generates a random seed and initializes the game state with a deterministic bag.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::start_game())]
        pub fn start_game(origin: OriginFor<T>, set_id: u32) -> DispatchResult {
            let who = ensure_signed(origin)?;

            ensure!(
                !ActiveGame::<T>::contains_key(&who),
                Error::<T>::GameAlreadyActive
            );

            let (state, seed) =
                oab_common::initialize_game_state::<T>(&who, set_id, b"arena_start")
                    .map_err(|e| -> Error<T> { e.into() })?;

            let session = BoundedGameSession::<T> {
                state,
                set_id,
                config: oab_game::sealed::default_config(),
            };

            ActiveGame::<T>::insert(&who, session);
            Self::deposit_event(Event::GameStarted { owner: who, seed });

            Ok(())
        }

        /// Submit a complete turn: apply shop actions, run the battle, and prepare the next round.
        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::submit_turn())]
        pub fn submit_turn(
            origin: OriginFor<T>,
            action: BoundedCommitTurnAction<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let mut session = ActiveGame::<T>::get(&who).ok_or(Error::<T>::NoActiveGame)?;
            ensure!(
                session.state.phase == GamePhase::Shop,
                Error::<T>::WrongPhase
            );

            let mut battle = oab_common::prepare_battle::<T>(
                &who,
                session.set_id,
                session.config.clone(),
                session.state.clone().into(),
                action,
                b"arena_battle",
            )
            .map_err(|e| -> Error<T> { e.into() })?;

            // Select ghost from arena pool, fallback to empty board
            let enemy_units =
                Self::select_ghost_opponent(&battle.bracket, &battle.card_set, battle.battle_seed)
                    .unwrap_or_default();

            // Store player's board as ghost (after selecting opponent)
            let ghost = oab_common::create_ghost_board::<T>(&battle.core_state);
            Self::store_ghost(&who, &battle.bracket, ghost);

            let turn =
                oab_common::execute_and_advance::<T>(&who, &mut battle, enemy_units, b"arena_shop");

            // Grant bronze achievements for cards on board if battle was won
            if turn.result == BattleResult::Victory {
                oab_common::grant_bronze_achievements::<T>(&who, &battle.core_state);
            }

            // If game is over, mark as Completed for end_game to finalize
            if turn.game_over {
                battle.core_state.phase = GamePhase::Completed;
            }

            let (_, _, _config, local) = battle.core_state.decompose();
            session.state = local.into();
            ActiveGame::<T>::insert(&who, &session);

            Self::deposit_event(Event::BattleReported {
                owner: who,
                round: turn.completed_round,
                result: turn.result,
                new_seed: turn.new_seed,
                battle_seed: battle.battle_seed,
                opponent_board: turn.opponent_ghost,
            });

            Ok(())
        }

        /// Abandon an active arena game.
        #[pallet::call_index(2)]
        #[pallet::weight(T::WeightInfo::abandon_game())]
        pub fn abandon_game(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            ensure!(
                ActiveGame::<T>::contains_key(&who),
                Error::<T>::NoActiveGame
            );

            ActiveGame::<T>::remove(&who);

            Self::deposit_event(Event::GameAbandoned { owner: who });

            Ok(())
        }

        /// Finalize a completed arena game.
        ///
        /// Must be called after `submit_turn` ends the game (phase == Completed).
        /// Archives the final board as a ghost, grants silver/gold achievements,
        /// and removes the game session.
        #[pallet::call_index(3)]
        #[pallet::weight(T::WeightInfo::end_game())]
        pub fn end_game(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let session = ActiveGame::<T>::get(&who).ok_or(Error::<T>::NoActiveGame)?;
            ensure!(
                session.state.phase == GamePhase::Completed,
                Error::<T>::WrongPhase
            );

            Self::finalize_arena_game(&who, session.set_id, &session.config, &session.state);

            ActiveGame::<T>::remove(&who);

            Self::deposit_event(Event::GameEnded {
                owner: who,
                wins: session.state.wins,
                lives: session.state.lives,
                round: session.state.round,
            });

            Ok(())
        }

        /// Backfill a ghost board into a specific matchmaking bracket.
        /// Only callable by AdminOrigin (e.g. root/sudo).
        #[pallet::call_index(4)]
        #[pallet::weight(T::WeightInfo::backfill_ghost_board())]
        pub fn backfill_ghost_board(
            origin: OriginFor<T>,
            set_id: u32,
            round: i32,
            wins: i32,
            lives: i32,
            board: BoundedVec<GhostBoardUnit, T::MaxBoardSize>,
        ) -> DispatchResult {
            T::AdminOrigin::ensure_origin(origin)?;

            ensure!(
                round > 0 && wins >= 0 && lives > 0,
                Error::<T>::InvalidGhostBracket
            );
            ensure!(!board.is_empty(), Error::<T>::EmptyGhostBoard);

            let card_set =
                T::CardRegistry::get_card_set(set_id).ok_or(Error::<T>::CardSetNotFound)?;
            for unit in board.iter() {
                ensure!(
                    card_set
                        .cards
                        .iter()
                        .any(|entry| entry.card_id == unit.card_id),
                    Error::<T>::GhostCardNotInSet
                );
            }

            let bracket = MatchmakingBracket {
                set_id,
                round,
                wins,
                lives,
            };
            let ghost = BoundedGhostBoard::<T> { units: board };

            // Use a fixed zero account as the backfill owner
            let owner =
                T::AccountId::decode(&mut frame::traits::TrailingZeroInput::zeroes()).unwrap();

            Self::store_ghost(&owner, &bracket, ghost);

            let pool_size = GhostOpponents::<T>::get((set_id, round, wins, lives)).len() as u32;
            Self::deposit_event(Event::GhostBoardBackfilled {
                set_id,
                round,
                wins,
                lives,
                pool_size,
            });

            Ok(())
        }
    }

    // ── Helper functions ────────────────────────────────────────────────

    impl<T: Config> Pallet<T> {
        /// Select a ghost opponent from the arena ghost pool.
        fn select_ghost_opponent(
            bracket: &MatchmakingBracket,
            card_set: &CardSet,
            seed: u64,
        ) -> Option<Vec<CombatUnit>> {
            let ghosts = GhostOpponents::<T>::get((
                bracket.set_id,
                bracket.round,
                bracket.wins,
                bracket.lives,
            ));
            oab_common::select_ghost_from_pool::<T>(&ghosts, card_set, seed)
        }

        /// Store a ghost board for the given bracket.
        /// Uses FIFO rotation when at capacity, and archives permanently.
        fn store_ghost(
            owner: &T::AccountId,
            bracket: &MatchmakingBracket,
            ghost: BoundedGhostBoard<T>,
        ) {
            if ghost.units.is_empty() {
                return;
            }

            GhostOpponents::<T>::mutate(
                (bracket.set_id, bracket.round, bracket.wins, bracket.lives),
                |ghosts| {
                    oab_common::push_ghost_to_pool::<T>(ghosts, owner, ghost.clone());
                },
            );

            // Archive permanently for off-chain analysis
            let archive_id = NextGhostArchiveId::<T>::get();
            let archive_entry = GhostArchiveEntry {
                owner: owner.clone(),
                board: ghost,
                created_at: frame_system::Pallet::<T>::block_number(),
            };
            GhostArchive::<T>::insert(
                (
                    bracket.set_id,
                    bracket.round,
                    bracket.wins,
                    bracket.lives,
                    archive_id,
                ),
                archive_entry,
            );
            NextGhostArchiveId::<T>::put(archive_id.saturating_add(1));
        }

        /// Finalize a completed arena game: archive the final board as a ghost
        /// and grant silver/gold achievements.
        fn finalize_arena_game(
            who: &T::AccountId,
            set_id: u32,
            config: &oab_game::GameConfig,
            state: &BoundedLocalGameState<T>,
        ) {
            // Build ghost board from the session's board and store it
            let ghost = oab_common::build_ghost_from_state::<T>(state);

            if !ghost.units.is_empty() {
                let bracket = MatchmakingBracket {
                    set_id,
                    round: state.round,
                    wins: state.wins,
                    lives: state.lives,
                };
                Self::store_ghost(who, &bracket, ghost);
            }

            // Grant silver/gold achievements
            oab_common::finalize_game_achievements::<T>(who, config, state);
        }
    }
}
