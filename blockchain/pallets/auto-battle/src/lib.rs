#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

pub mod weights;

mod impls;

#[frame::pallet]
pub mod pallet {

    use crate::weights::WeightInfo;
    use alloc::vec::Vec;
    use frame::arithmetic::Perbill;
    use frame::prelude::*;
    use frame::traits::{fungible, tokens::Preservation, Get, Randomness};
    use pallet_oab_card_registry::CardRegistryProvider;

    // Import types from core engine
    use oab_battle::bounded::{
        BoundedCommitTurnAction as CoreBoundedCommitTurnAction,
        BoundedGhostBoard as CoreBoundedGhostBoard, GhostBoardUnit as CoreGhostBoardUnit,
        MatchmakingBracket,
    };
    use oab_battle::{BattleResult, CardSet, CombatUnit};
    use oab_game::bounded::{
        BoundedGameSession as CoreBoundedGameSession, BoundedGameState as CoreBoundedGameState,
        BoundedLocalGameState as CoreBoundedLocalGameState,
    };
    use oab_game::GamePhase;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    /// Configure the pallet by specifying the parameters and types on which it depends.
    /// Inherits game engine capabilities (Randomness, CardRegistry, Max* bounds) from GameEngine.
    #[pallet::config]
    pub trait Config: frame_system::Config + oab_game_common::GameEngine {
        /// Because this pallet emits events, it depends on the runtime's definition of an event.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// Type representing the weight of this pallet
        type WeightInfo: WeightInfo;

        /// Currency for tournament entry fees and prize payouts.
        type Currency: fungible::Inspect<Self::AccountId> + fungible::Mutate<Self::AccountId>;

        /// Origin that can create tournaments (e.g. root or sudo).
        type TournamentOrigin: EnsureOrigin<Self::RuntimeOrigin>;

        /// Pallet ID used to derive the pallet's account for holding tournament funds.
        #[pallet::constant]
        type PalletId: Get<frame::deps::frame_support::PalletId>;
    }

    /// Type alias for the bounded game state using pallet config.
    pub type BoundedGameState<T> = CoreBoundedGameState<
        <T as oab_game_common::GameEngine>::MaxBagSize,
        <T as oab_game_common::GameEngine>::MaxBoardSize,
        <T as oab_game_common::GameEngine>::MaxAbilities,
        <T as oab_game_common::GameEngine>::MaxStringLen,
        <T as oab_game_common::GameEngine>::MaxHandActions,
        <T as oab_game_common::GameEngine>::MaxConditions,
    >;

    /// Type alias for the bounded local game state using pallet config.
    pub type BoundedLocalGameState<T> = CoreBoundedLocalGameState<
        <T as oab_game_common::GameEngine>::MaxBagSize,
        <T as oab_game_common::GameEngine>::MaxBoardSize,
        <T as oab_game_common::GameEngine>::MaxHandActions,
    >;

    /// Type alias for the bounded game session using pallet config.
    pub type BoundedGameSession<T> = CoreBoundedGameSession<
        <T as oab_game_common::GameEngine>::MaxBagSize,
        <T as oab_game_common::GameEngine>::MaxBoardSize,
        <T as oab_game_common::GameEngine>::MaxHandActions,
    >;

    /// Type alias for the bounded turn action using pallet config.
    /// MaxHandActions is used as the max number of actions in a turn.
    pub type BoundedCommitTurnAction<T> =
        CoreBoundedCommitTurnAction<<T as oab_game_common::GameEngine>::MaxHandActions>;

    /// Type alias for bounded ghost board using pallet config.
    pub type BoundedGhostBoard<T> =
        CoreBoundedGhostBoard<<T as oab_game_common::GameEngine>::MaxBoardSize>;

    /// Type alias for the balance type from the configured Currency.
    pub type BalanceOf<T> = <<T as Config>::Currency as fungible::Inspect<
        <T as frame_system::Config>::AccountId,
    >>::Balance;

    /// A ghost entry that includes the owner who created the board.
    /// Used for matchmaking storage.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct GhostEntry<T: Config> {
        /// The player who created this ghost board
        pub owner: T::AccountId,
        /// The ghost board data
        pub board: BoundedGhostBoard<T>,
    }

    /// An archived ghost entry with full context for off-chain analysis.
    /// The bracket is implicit in the storage key.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct GhostArchiveEntry<T: Config> {
        /// The player who created this ghost board
        pub owner: T::AccountId,
        /// The ghost board data
        pub board: BoundedGhostBoard<T>,
        /// Block number when the ghost was created
        pub created_at: BlockNumberFor<T>,
    }

    /// Prize distribution configuration for a tournament.
    /// Uses `Perbill` (parts-per-billion, u32) for precise share calculation.
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        Clone,
        PartialEq,
        RuntimeDebug,
        MaxEncodedLen,
    )]
    pub struct PrizeConfig {
        /// Share of the pot awarded to players who achieve perfect (10-win) runs.
        pub player_share: Perbill,
        /// Share of the pot awarded to the card set creator.
        pub set_creator_share: Perbill,
        /// Share of the pot distributed among individual card creators.
        pub card_creators_share: Perbill,
    }

    /// Configuration for a tournament.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct TournamentConfig<T: Config> {
        pub set_id: u32,
        pub entry_fee: BalanceOf<T>,
        pub start_block: BlockNumberFor<T>,
        pub end_block: BlockNumberFor<T>,
        pub prize_config: PrizeConfig,
    }

    /// Mutable state tracked for a tournament.
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        CloneNoBound,
        PartialEqNoBound,
        MaxEncodedLen,
        DefaultNoBound,
    )]
    #[scale_info(skip_type_params(T))]
    pub struct TournamentState<T: Config> {
        pub total_pot: BalanceOf<T>,
        pub total_entries: u32,
        pub total_perfect_runs: u32,
    }

    /// Per-player statistics within a tournament.
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        Clone,
        PartialEq,
        RuntimeDebug,
        MaxEncodedLen,
        Default,
    )]
    pub struct PlayerTournamentStats {
        pub perfect_runs: u32,
        pub total_wins: u32,
        pub total_games: u32,
    }

    /// A tournament game session extends the normal session payload with tournament metadata.
    /// The field order intentionally starts with the shared game session prefix so the browser
    /// WASM engine can decode the normal session fields and ignore the trailing tournament ID.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct TournamentGameSession<T: Config> {
        pub state: BoundedLocalGameState<T>,
        pub set_id: u32,
        pub config: oab_game::GameConfig,
        pub tournament_id: u32,
    }

    /// Map of Active Games: AccountId -> GameSession
    #[pallet::storage]
    pub type ActiveGame<T: Config> =
        StorageMap<_, Blake2_128Concat, T::AccountId, BoundedGameSession<T>, OptionQuery>;

    /// Ghost opponents indexed by matchmaking bracket.
    /// Key: (set_id, round, wins, lives)
    /// Value: Vector of ghost entries (with owner) for that bracket
    #[pallet::storage]
    pub type GhostOpponents<T: Config> = StorageNMap<
        _,
        (
            NMapKey<Blake2_128Concat, u32>, // set_id
            NMapKey<Blake2_128Concat, i32>, // round
            NMapKey<Blake2_128Concat, i32>, // wins
            NMapKey<Blake2_128Concat, i32>, // lives
        ),
        BoundedVec<GhostEntry<T>, <T as oab_game_common::GameEngine>::MaxGhostsPerBracket>,
        ValueQuery,
    >;

    /// Archive of all ghost boards ever created (for off-chain analytics).
    /// Key: (set_id, round, wins, lives, archive_id)
    /// Value: Individual ghost archive entry
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

    /// Next available tournament ID.
    #[pallet::storage]
    pub type NextTournamentId<T: Config> = StorageValue<_, u32, ValueQuery>;

    /// Tournament configurations.
    #[pallet::storage]
    pub type Tournaments<T: Config> =
        StorageMap<_, Blake2_128Concat, u32, TournamentConfig<T>, OptionQuery>;

    /// Mutable tournament state (pot, entries, perfect runs).
    #[pallet::storage]
    pub type TournamentStates<T: Config> =
        StorageMap<_, Blake2_128Concat, u32, TournamentState<T>, ValueQuery>;

    /// Active tournament game sessions (separate from regular games).
    #[pallet::storage]
    pub type ActiveTournamentGame<T: Config> =
        StorageMap<_, Blake2_128Concat, T::AccountId, TournamentGameSession<T>, OptionQuery>;

    /// Per-player stats within a tournament.
    #[pallet::storage]
    pub type TournamentPlayerStats<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        u32, // tournament_id
        Blake2_128Concat,
        T::AccountId, // player
        PlayerTournamentStats,
        ValueQuery,
    >;

    /// Whether a player has claimed their prize for a tournament.
    #[pallet::storage]
    pub type TournamentClaimed<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat,
        u32, // tournament_id
        Blake2_128Concat,
        T::AccountId, // player
        bool,
        ValueQuery,
    >;

    /// Tournament-specific ghost opponents (separate from regular ghosts).
    #[pallet::storage]
    pub type TournamentGhostOpponents<T: Config> = StorageNMap<
        _,
        (
            NMapKey<Blake2_128Concat, u32>, // tournament_id
            NMapKey<Blake2_128Concat, i32>, // round
            NMapKey<Blake2_128Concat, i32>, // wins
            NMapKey<Blake2_128Concat, i32>, // lives
        ),
        BoundedVec<GhostEntry<T>, <T as oab_game_common::GameEngine>::MaxGhostsPerBracket>,
        ValueQuery,
    >;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        /// A new game has started.
        GameStarted { owner: T::AccountId, seed: u64 },
        /// A turn has been committed (Shop Phase complete).
        TurnCommitted {
            owner: T::AccountId,
            round: i32,
            new_seed: u64,
        },
        /// A battle result has been reported (Battle Phase complete).
        BattleReported {
            owner: T::AccountId,
            round: i32,
            result: BattleResult,
            new_seed: u64,
            battle_seed: u64,
            opponent_board: BoundedGhostBoard<T>,
        },
        /// A new tournament has been created.
        TournamentCreated { tournament_id: u32, set_id: u32 },
        /// A player has joined a tournament and started a game.
        TournamentGameStarted {
            owner: T::AccountId,
            tournament_id: u32,
            seed: u64,
        },
        /// A tournament game has been completed (win or loss).
        TournamentGameCompleted {
            owner: T::AccountId,
            tournament_id: u32,
            wins: i32,
        },
        /// A tournament game has been abandoned.
        TournamentGameAbandoned {
            owner: T::AccountId,
            tournament_id: u32,
        },
        /// A regular game has been abandoned.
        GameAbandoned { owner: T::AccountId },
        /// A tournament prize has been claimed.
        PrizeClaimed {
            tournament_id: u32,
            player: T::AccountId,
            amount: BalanceOf<T>,
        },
        /// A ghost board has been backfilled into a specific matchmaking bracket.
        GhostBoardBackfilled {
            set_id: u32,
            round: i32,
            wins: i32,
            lives: i32,
            pool_size: u32,
        },
        /// A game has been finalized via end_game or end_tournament_game.
        GameEnded {
            owner: T::AccountId,
            wins: i32,
            lives: i32,
            round: i32,
        },
    }

    #[pallet::error]
    pub enum Error<T> {
        /// User tried to submit a turn without starting a game.
        NoActiveGame,
        /// The turn action failed verification (e.g. invalid move, cheating).
        InvalidTurn,
        /// User tried to start a new game while one exists.
        GameAlreadyActive,
        /// Tried to perform an action in the wrong phase
        WrongPhase,
        /// The specified card set does not exist.
        CardSetNotFound,
        /// The specified tournament does not exist.
        TournamentNotFound,
        /// The supplied ghost bracket is invalid.
        InvalidGhostBracket,
        /// The supplied ghost board cannot be empty.
        EmptyGhostBoard,
        /// A card in the supplied ghost board is not part of the target set.
        GhostCardNotInSet,
        /// The tournament has not started yet.
        TournamentNotStarted,
        /// The tournament has ended (past end_block).
        TournamentEnded,
        /// The tournament has not ended yet (before end_block).
        TournamentNotEnded,
        /// The prize configuration shares do not sum to 100%.
        InvalidPrizeConfig,
        /// The tournament period is invalid (end <= start or start < now).
        InvalidTournamentPeriod,
        /// No prize available for this player.
        NoPrizeAvailable,
        /// Prize has already been claimed for this tournament.
        PrizeAlreadyClaimed,
        /// Player already has an active tournament game.
        TournamentGameAlreadyActive,
        /// No active tournament game found.
        NoActiveTournamentGame,
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Start a new game session.
        /// Generates a random seed and initializes the game state with a deterministic bag.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::start_game())]
        pub fn start_game(origin: OriginFor<T>, set_id: u32) -> DispatchResult {
            let who = ensure_signed(origin)?;

            ensure!(
                !ActiveGame::<T>::contains_key(&who),
                Error::<T>::GameAlreadyActive
            );

            let (state, seed) = Self::initialize_game_state(&who, set_id, b"start_game")?;

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
        /// This is the main extrinsic for gameplay - it handles the full turn cycle on-chain.
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

            let mut battle = Self::prepare_battle(
                &who,
                session.set_id,
                session.config.clone(),
                session.state.clone().into(),
                action,
                b"battle",
            )?;

            // Select ghost from regular pool, fallback to empty board
            let enemy_units =
                Self::select_ghost_opponent(&battle.bracket, &battle.card_set, battle.battle_seed)
                    .unwrap_or_default();

            // Store player's board as ghost (after selecting opponent)
            let ghost = Self::create_ghost_board(&battle.core_state);
            Self::store_ghost(&who, &battle.bracket, ghost.clone());

            let turn = Self::execute_and_advance(&who, &mut battle, enemy_units, b"shop");

            // Grant bronze achievements for cards on board if battle was won
            if turn.result == BattleResult::Victory {
                Self::grant_bronze_achievements(&who, &battle.core_state);
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

        /// Create a new tournament. Only callable by TournamentOrigin (e.g. root/sudo).
        #[pallet::call_index(7)]
        #[pallet::weight(T::WeightInfo::create_tournament())]
        pub fn create_tournament(
            origin: OriginFor<T>,
            set_id: u32,
            entry_fee: BalanceOf<T>,
            start_block: BlockNumberFor<T>,
            end_block: BlockNumberFor<T>,
            prize_config: PrizeConfig,
        ) -> DispatchResult {
            T::TournamentOrigin::ensure_origin(origin)?;

            // Validate set exists
            ensure!(
                T::CardRegistry::card_set_exists(set_id),
                Error::<T>::CardSetNotFound
            );

            // Validate tournament period
            let now = frame_system::Pallet::<T>::block_number();
            ensure!(start_block >= now, Error::<T>::InvalidTournamentPeriod);
            ensure!(end_block > start_block, Error::<T>::InvalidTournamentPeriod);

            // Validate prize config sums to 100%
            let total = prize_config
                .player_share
                .saturating_add(prize_config.set_creator_share)
                .saturating_add(prize_config.card_creators_share);
            ensure!(total == Perbill::one(), Error::<T>::InvalidPrizeConfig);

            let tournament_id = NextTournamentId::<T>::get();

            let config = TournamentConfig {
                set_id,
                entry_fee,
                start_block,
                end_block,
                prize_config,
            };

            Tournaments::<T>::insert(tournament_id, config);
            // TournamentStates uses ValueQuery so defaults are already correct
            NextTournamentId::<T>::put(tournament_id.saturating_add(1));

            Self::deposit_event(Event::TournamentCreated {
                tournament_id,
                set_id,
            });

            Ok(())
        }

        /// Join a tournament and start a tournament game.
        #[pallet::call_index(8)]
        #[pallet::weight(T::WeightInfo::join_tournament())]
        pub fn join_tournament(origin: OriginFor<T>, tournament_id: u32) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let config =
                Tournaments::<T>::get(tournament_id).ok_or(Error::<T>::TournamentNotFound)?;

            let now = frame_system::Pallet::<T>::block_number();
            ensure!(now >= config.start_block, Error::<T>::TournamentNotStarted);
            ensure!(now <= config.end_block, Error::<T>::TournamentEnded);

            ensure!(
                !ActiveTournamentGame::<T>::contains_key(&who),
                Error::<T>::TournamentGameAlreadyActive
            );

            // Transfer entry fee to pallet account
            let pallet_account = Self::pallet_account_id();
            <T::Currency as fungible::Mutate<T::AccountId>>::transfer(
                &who,
                &pallet_account,
                config.entry_fee,
                Preservation::Expendable,
            )?;

            TournamentStates::<T>::mutate(tournament_id, |state| {
                state.total_pot = state.total_pot.saturating_add(config.entry_fee);
                state.total_entries = state.total_entries.saturating_add(1);
            });

            let (state, seed) =
                Self::initialize_game_state(&who, config.set_id, b"tournament_start")?;

            let session = TournamentGameSession::<T> {
                state,
                set_id: config.set_id,
                config: oab_game::sealed::default_config(),
                tournament_id,
            };

            ActiveTournamentGame::<T>::insert(&who, session);

            Self::deposit_event(Event::TournamentGameStarted {
                owner: who,
                tournament_id,
                seed,
            });

            Ok(())
        }

        /// Submit a turn for an active tournament game.
        #[pallet::call_index(9)]
        #[pallet::weight(T::WeightInfo::submit_tournament_turn())]
        pub fn submit_tournament_turn(
            origin: OriginFor<T>,
            action: BoundedCommitTurnAction<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let mut session =
                ActiveTournamentGame::<T>::get(&who).ok_or(Error::<T>::NoActiveTournamentGame)?;
            ensure!(
                session.state.phase == GamePhase::Shop,
                Error::<T>::WrongPhase
            );

            let tid = session.tournament_id;

            let mut battle = Self::prepare_battle(
                &who,
                session.set_id,
                session.config.clone(),
                session.state.clone().into(),
                action,
                b"tournament_battle",
            )?;

            // Select ghost from tournament pool, fallback to empty board
            let enemy_units = Self::select_tournament_ghost_opponent(
                tid,
                &battle.bracket,
                &battle.card_set,
                battle.battle_seed,
            )
            .unwrap_or_default();

            // Store player's board as tournament ghost
            let ghost = Self::create_ghost_board(&battle.core_state);
            Self::store_tournament_ghost(&who, tid, &battle.bracket, ghost.clone());

            let turn =
                Self::execute_and_advance(&who, &mut battle, enemy_units, b"tournament_shop");

            // Grant bronze achievements for cards on board if battle was won
            if turn.result == BattleResult::Victory {
                Self::grant_bronze_achievements(&who, &battle.core_state);
            }

            // If game is over, mark as Completed for end_tournament_game to finalize
            if turn.game_over {
                battle.core_state.phase = GamePhase::Completed;
            }

            let (_, _, _config, local) = battle.core_state.decompose();
            session.state = local.into();
            ActiveTournamentGame::<T>::insert(&who, &session);

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

        /// Abandon an active regular game.
        #[pallet::call_index(10)]
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

        /// Abandon an active tournament game. Stats are recorded as a defeat.
        #[pallet::call_index(11)]
        #[pallet::weight(T::WeightInfo::abandon_tournament())]
        pub fn abandon_tournament(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let session =
                ActiveTournamentGame::<T>::get(&who).ok_or(Error::<T>::NoActiveTournamentGame)?;

            let tid = session.tournament_id;

            // Record stats as defeat
            TournamentPlayerStats::<T>::mutate(tid, &who, |stats| {
                stats.total_games += 1;
                stats.total_wins += session.state.wins as u32;
            });

            ActiveTournamentGame::<T>::remove(&who);

            Self::deposit_event(Event::TournamentGameAbandoned {
                owner: who,
                tournament_id: tid,
            });

            Ok(())
        }

        /// Claim tournament prizes. Sums player prize, set creator prize, and card creator prize.
        #[pallet::call_index(12)]
        #[pallet::weight(T::WeightInfo::claim_prize())]
        pub fn claim_prize(origin: OriginFor<T>, tournament_id: u32) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let config =
                Tournaments::<T>::get(tournament_id).ok_or(Error::<T>::TournamentNotFound)?;

            // Ensure tournament has ended
            let now = frame_system::Pallet::<T>::block_number();
            ensure!(now > config.end_block, Error::<T>::TournamentNotEnded);

            // Ensure not already claimed
            ensure!(
                !TournamentClaimed::<T>::get(tournament_id, &who),
                Error::<T>::PrizeAlreadyClaimed
            );

            let tournament_state = TournamentStates::<T>::get(tournament_id);
            let player_stats = TournamentPlayerStats::<T>::get(tournament_id, &who);

            let mut total_prize = BalanceOf::<T>::zero();

            // 1. Player prize (if caller has perfect runs)
            if player_stats.perfect_runs > 0 && tournament_state.total_perfect_runs > 0 {
                let player_pot = config
                    .prize_config
                    .player_share
                    .mul_floor(tournament_state.total_pot);
                // player_prize = player_pot * my_perfect_runs / total_perfect_runs
                let my_runs: BalanceOf<T> = player_stats.perfect_runs.into();
                let total_runs: BalanceOf<T> = tournament_state.total_perfect_runs.into();
                let player_prize = player_pot
                    .saturating_mul(my_runs)
                    .checked_div(&total_runs)
                    .unwrap_or(BalanceOf::<T>::zero());
                total_prize = total_prize.saturating_add(player_prize);
            }

            // 2. Set creator prize (if caller == set creator)
            if let Some(set_creator) = T::CardRegistry::get_set_creator(config.set_id) {
                if set_creator == who {
                    let set_creator_prize = config
                        .prize_config
                        .set_creator_share
                        .mul_floor(tournament_state.total_pot);
                    total_prize = total_prize.saturating_add(set_creator_prize);
                }
            }

            // 3. Card creator prize (if caller created any cards in the set)
            let (my_cards, total_cards) =
                T::CardRegistry::count_cards_created_by(config.set_id, &who);
            if my_cards > 0 && total_cards > 0 {
                let card_creators_pot = config
                    .prize_config
                    .card_creators_share
                    .mul_floor(tournament_state.total_pot);
                let my: BalanceOf<T> = my_cards.into();
                let total: BalanceOf<T> = total_cards.into();
                let card_creator_prize = card_creators_pot
                    .saturating_mul(my)
                    .checked_div(&total)
                    .unwrap_or(BalanceOf::<T>::zero());
                total_prize = total_prize.saturating_add(card_creator_prize);
            }

            // Ensure there's actually a prize to claim
            ensure!(
                total_prize > BalanceOf::<T>::zero(),
                Error::<T>::NoPrizeAvailable
            );

            // Transfer prize from pallet account
            let pallet_account = Self::pallet_account_id();
            <T::Currency as fungible::Mutate<T::AccountId>>::transfer(
                &pallet_account,
                &who,
                total_prize,
                Preservation::Expendable,
            )?;

            TournamentClaimed::<T>::insert(tournament_id, &who, true);

            Self::deposit_event(Event::PrizeClaimed {
                tournament_id,
                player: who,
                amount: total_prize,
            });

            Ok(())
        }

        /// Backfill a ghost board into a specific matchmaking bracket.
        /// Only callable by TournamentOrigin (e.g. root/sudo).
        #[pallet::call_index(13)]
        #[pallet::weight(T::WeightInfo::backfill_ghost_board())]
        pub fn backfill_ghost_board(
            origin: OriginFor<T>,
            set_id: u32,
            round: i32,
            wins: i32,
            lives: i32,
            board: BoundedVec<CoreGhostBoardUnit, T::MaxBoardSize>,
        ) -> DispatchResult {
            T::TournamentOrigin::ensure_origin(origin)?;

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
            let owner = Self::pallet_account_id();

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

        /// Finalize a completed regular game.
        ///
        /// Must be called after `submit_turn` ends the game (phase == Completed).
        /// Archives the final board as a victory ghost (if 10+ wins), grants
        /// silver/gold achievements, and removes the game session.
        #[pallet::call_index(15)]
        #[pallet::weight(T::WeightInfo::end_game())]
        pub fn end_game(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let session = ActiveGame::<T>::get(&who).ok_or(Error::<T>::NoActiveGame)?;
            ensure!(
                session.state.phase == GamePhase::Completed,
                Error::<T>::WrongPhase
            );

            Self::finalize_game(&who, session.set_id, &session.config, &session.state);

            ActiveGame::<T>::remove(&who);

            Self::deposit_event(Event::GameEnded {
                owner: who,
                wins: session.state.wins,
                lives: session.state.lives,
                round: session.state.round,
            });

            Ok(())
        }

        /// Finalize a completed tournament game.
        ///
        /// Must be called after `submit_tournament_turn` ends the game (phase == Completed).
        /// Archives the final board, grants achievements, records tournament stats,
        /// and removes the tournament game session.
        #[pallet::call_index(16)]
        #[pallet::weight(T::WeightInfo::end_tournament_game())]
        pub fn end_tournament_game(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let session =
                ActiveTournamentGame::<T>::get(&who).ok_or(Error::<T>::NoActiveTournamentGame)?;
            ensure!(
                session.state.phase == GamePhase::Completed,
                Error::<T>::WrongPhase
            );

            let tid = session.tournament_id;
            let wins = session.state.wins;

            Self::finalize_game(&who, session.set_id, &session.config, &session.state);

            // Update tournament statistics
            TournamentPlayerStats::<T>::mutate(tid, &who, |stats| {
                stats.total_games += 1;
                stats.total_wins += wins as u32;
                if wins >= session.config.wins_to_victory {
                    stats.perfect_runs += 1;
                }
            });
            if wins >= session.config.wins_to_victory {
                TournamentStates::<T>::mutate(tid, |state| {
                    state.total_perfect_runs += 1;
                });
            }

            ActiveTournamentGame::<T>::remove(&who);

            Self::deposit_event(Event::GameEnded {
                owner: who.clone(),
                wins: session.state.wins,
                lives: session.state.lives,
                round: session.state.round,
            });
            Self::deposit_event(Event::TournamentGameCompleted {
                owner: who,
                tournament_id: tid,
                wins,
            });

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Select a ghost opponent from the regular ghost pool.
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
            Self::select_ghost_from_pool(&ghosts, card_set, seed)
        }

        /// Select a ghost opponent from the tournament-specific ghost pool.
        fn select_tournament_ghost_opponent(
            tournament_id: u32,
            bracket: &MatchmakingBracket,
            card_set: &CardSet,
            seed: u64,
        ) -> Option<Vec<CombatUnit>> {
            let ghosts = TournamentGhostOpponents::<T>::get((
                tournament_id,
                bracket.round,
                bracket.wins,
                bracket.lives,
            ));
            Self::select_ghost_from_pool(&ghosts, card_set, seed)
        }

        /// Store a ghost board for the given bracket.
        /// Uses FIFO rotation when at capacity, and archives permanently.
        pub(crate) fn store_ghost(
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
                    Self::push_ghost_to_pool(ghosts, owner, ghost.clone());
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

        /// Store a ghost board in the tournament-specific ghost pool.
        pub(crate) fn store_tournament_ghost(
            owner: &T::AccountId,
            tournament_id: u32,
            bracket: &MatchmakingBracket,
            ghost: BoundedGhostBoard<T>,
        ) {
            if ghost.units.is_empty() {
                return;
            }

            TournamentGhostOpponents::<T>::mutate(
                (tournament_id, bracket.round, bracket.wins, bracket.lives),
                |ghosts| {
                    Self::push_ghost_to_pool(ghosts, owner, ghost);
                },
            );
        }
    }
}
