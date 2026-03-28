//! # OAB Constructed Pallet
//!
//! FRAME pallet for the Open Auto Battler constructed game mode.
//! Players bring their own 50-card deck (validated on-chain), then play
//! the standard 10-win / 3-life game loop with ghost opponents.
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
    use oab_battle::bounded::MatchmakingBracket;
    use oab_battle::state::CardSet;
    use oab_battle::types::CardId;
    use oab_battle::{BattleResult, CombatUnit};
    use oab_game::GamePhase;
    use pallet_oab_card_registry::CardRegistryProvider;

    // ── Type aliases (convenience re-exports from oab_common) ──────

    pub type BoundedGameSession<T> = oab_common::BoundedGameSession<T>;
    pub type BoundedLocalGameState<T> = oab_common::BoundedLocalGameState<T>;
    pub type BoundedCommitTurnAction<T> = oab_common::BoundedCommitTurnAction<T>;
    pub type BoundedGhostBoard<T> = oab_common::BoundedGhostBoard<T>;

    // ── Pallet declaration ──────────────────────────────────────────────

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    // ── Config ──────────────────────────────────────────────────────────

    #[pallet::config]
    pub trait Config: frame_system::Config + oab_common::GameEngine {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
        type WeightInfo: WeightInfo;
    }

    // ── WeightInfo trait ────────────────────────────────────────────────

    pub trait WeightInfo {
        fn start_game() -> Weight;
        fn submit_turn() -> Weight;
        fn abandon_game() -> Weight;
        fn end_game() -> Weight;
    }

    impl WeightInfo for () {
        fn start_game() -> Weight {
            Weight::from_parts(150_000_000, 0)
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
    }

    // ── Storage ─────────────────────────────────────────────────────────

    /// Map of active constructed games: AccountId -> GameSession.
    #[pallet::storage]
    pub type ActiveGame<T: Config> =
        StorageMap<_, Blake2_128Concat, T::AccountId, BoundedGameSession<T>, OptionQuery>;

    /// Ghost opponents for constructed mode, indexed by bracket.
    /// Key: (round, wins, lives) — no set_id since constructed uses the full pool.
    #[pallet::storage]
    pub type GhostOpponents<T: Config> = StorageNMap<
        _,
        (
            NMapKey<Blake2_128Concat, i32>, // round
            NMapKey<Blake2_128Concat, i32>, // wins
            NMapKey<Blake2_128Concat, i32>, // lives
        ),
        BoundedVec<oab_common::GhostEntry<T>, <T as oab_common::GameEngine>::MaxGhostsPerBracket>,
        ValueQuery,
    >;

    // ── Events ──────────────────────────────────────────────────────────

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A new constructed game has started.
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
        /// A constructed game has been abandoned.
        GameAbandoned { owner: T::AccountId },
        /// A constructed game has been finalized.
        GameEnded {
            owner: T::AccountId,
            wins: i32,
            lives: i32,
            round: i32,
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
        /// The submitted deck is invalid (wrong size, invalid cards, too many copies).
        InvalidDeck,
        /// Card set not found (internal error).
        CardSetNotFound,
    }

    impl<T: Config> From<oab_common::GameError> for Error<T> {
        fn from(e: oab_common::GameError) -> Self {
            match e {
                oab_common::GameError::CardSetNotFound => Error::<T>::CardSetNotFound,
                oab_common::GameError::InvalidTurn => Error::<T>::InvalidTurn,
                oab_common::GameError::InvalidDeck => Error::<T>::InvalidDeck,
            }
        }
    }

    // ── Extrinsics ──────────────────────────────────────────────────────

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Start a new constructed game with a user-provided deck.
        ///
        /// The deck must contain exactly 50 card IDs. Each card must exist
        /// in the card registry (no tokens), and no card may appear more than
        /// 5 times.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::start_game())]
        pub fn start_game(
            origin: OriginFor<T>,
            deck: BoundedVec<u32, T::MaxBagSize>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            ensure!(
                !ActiveGame::<T>::contains_key(&who),
                Error::<T>::GameAlreadyActive
            );

            // Build a synthetic "full" card set from all cards in the registry
            // so validate_deck can check every card exists and isn't a token.
            let (card_set, card_pool) = Self::build_full_card_set();

            let (state, seed) = oab_common::initialize_constructed_game_state::<T>(
                &who,
                deck.into_inner(),
                &card_set,
                &card_pool,
                b"constructed_start",
            )
            .map_err(|e| -> Error<T> { e.into() })?;

            let session = BoundedGameSession::<T> {
                state,
                set_id: 0,
                config: oab_game::constructed::default_config(),
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
                b"constructed_battle",
            )
            .map_err(|e| -> Error<T> { e.into() })?;

            // Select ghost from constructed pool, fallback to empty board
            let enemy_units =
                Self::select_ghost_opponent(&battle.bracket, &battle.card_set, battle.battle_seed)
                    .unwrap_or_default();

            // Store player's board as ghost (after selecting opponent)
            let ghost = oab_common::create_ghost_board::<T>(&battle.core_state);
            Self::store_ghost(&who, &battle.bracket, ghost);

            let turn = oab_common::execute_and_advance::<T>(
                &who,
                &mut battle,
                enemy_units,
                b"constructed_shop",
            );

            if turn.result == BattleResult::Victory {
                oab_common::grant_bronze_achievements::<T>(&who, &battle.core_state);
            }

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

        /// Abandon an active constructed game.
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

        /// Finalize a completed constructed game.
        ///
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

            // Store ghost and grant achievements
            let ghost = oab_common::build_ghost_from_state::<T>(&session.state);
            if !ghost.units.is_empty() {
                let bracket = MatchmakingBracket {
                    set_id: 0,
                    round: session.state.round,
                    wins: session.state.wins,
                    lives: session.state.lives,
                };
                Self::store_ghost(&who, &bracket, ghost);
            }
            oab_common::finalize_game_achievements::<T>(&who, &session.config, &session.state);

            ActiveGame::<T>::remove(&who);

            Self::deposit_event(Event::GameEnded {
                owner: who,
                wins: session.state.wins,
                lives: session.state.lives,
                round: session.state.round,
            });

            Ok(())
        }
    }

    // ── Helper functions ────────────────────────────────────────────────

    impl<T: Config> Pallet<T> {
        /// Get the full card pool from the card registry.
        fn build_full_card_set() -> (
            CardSet,
            alloc::collections::BTreeMap<CardId, oab_battle::types::UnitCard>,
        ) {
            T::CardRegistry::get_full_card_pool()
        }

        /// Select a ghost opponent from the constructed ghost pool.
        fn select_ghost_opponent(
            bracket: &MatchmakingBracket,
            card_set: &CardSet,
            seed: u64,
        ) -> Option<Vec<CombatUnit>> {
            let ghosts = GhostOpponents::<T>::get((bracket.round, bracket.wins, bracket.lives));
            oab_common::select_ghost_from_pool::<T>(&ghosts, card_set, seed)
        }

        /// Store a ghost board in the constructed ghost pool.
        fn store_ghost(
            owner: &T::AccountId,
            bracket: &MatchmakingBracket,
            ghost: BoundedGhostBoard<T>,
        ) {
            if ghost.units.is_empty() {
                return;
            }

            GhostOpponents::<T>::mutate((bracket.round, bracket.wins, bracket.lives), |ghosts| {
                oab_common::push_ghost_to_pool::<T>(ghosts, owner, ghost);
            });
        }
    }
}
