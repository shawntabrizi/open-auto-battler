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

    use alloc::vec::Vec;
    use frame::prelude::*;
    use frame::traits::{
        fungible,
        tokens::Preservation,
        Get, Randomness,
    };
    use frame::arithmetic::Perbill;

    // Import types from core engine
    use oab_core::bounded::{
        BoundedAbility as CoreBoundedAbility, BoundedCardSet as CoreBoundedCardSet,
        BoundedCommitTurnAction as CoreBoundedCommitTurnAction,
        BoundedGameState as CoreBoundedGameState, BoundedGhostBoard as CoreBoundedGhostBoard,
        BoundedLocalGameState as CoreBoundedLocalGameState, MatchmakingBracket,
    };
    use oab_core::types::{EconomyStats, UnitStats};
    use oab_core::{get_opponent_for_round, BattleResult, CardSet, CombatUnit, GamePhase};

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    /// Configure the pallet by specifying the parameters and types on which it depends.
    #[pallet::config]
    pub trait Config: frame_system::Config {
        /// Because this pallet emits events, it depends on the runtime's definition of an event.
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        /// Type representing the weight of this pallet
        //type WeightInfo: (); // Using () for now until weights are generated

        /// Source of randomness
        type Randomness: Randomness<Self::Hash, BlockNumberFor<Self>>;

        /// Maximum number of cards in the bag
        #[pallet::constant]
        type MaxBagSize: Get<u32>;

        /// Maximum number of board slots
        #[pallet::constant]
        type MaxBoardSize: Get<u32>;

        /// Maximum number of cards that can be played/pitched from hand in one turn.
        #[pallet::constant]
        type MaxHandActions: Get<u32>;

        /// Maximum number of abilities per card.
        #[pallet::constant]
        type MaxAbilities: Get<u32>;

        /// Maximum length of strings (names, descriptions, template IDs).
        #[pallet::constant]
        type MaxStringLen: Get<u32>;

        /// Maximum number of ghost opponents stored per matchmaking bracket.
        #[pallet::constant]
        type MaxGhostsPerBracket: Get<u32>;

        /// Maximum number of conditions per ability.
        #[pallet::constant]
        type MaxConditions: Get<u32>;

        /// Maximum number of cards in a set.
        #[pallet::constant]
        type MaxSetSize: Get<u32>;

        /// Currency for tournament entry fees and prize payouts.
        type Currency: fungible::Inspect<Self::AccountId>
            + fungible::Mutate<Self::AccountId>;

        /// Origin that can create tournaments (e.g. root or sudo).
        type TournamentOrigin: EnsureOrigin<Self::RuntimeOrigin>;

        /// Pallet ID used to derive the pallet's account for holding tournament funds.
        #[pallet::constant]
        type PalletId: Get<frame::deps::frame_support::PalletId>;
    }

    /// Type alias for the bounded game state using pallet config.
    pub type BoundedGameState<T> = CoreBoundedGameState<
        <T as Config>::MaxBagSize,
        <T as Config>::MaxBoardSize,
        <T as Config>::MaxAbilities,
        <T as Config>::MaxStringLen,
        <T as Config>::MaxHandActions,
        <T as Config>::MaxConditions,
    >;

    /// Type alias for the bounded local game state using pallet config.
    pub type BoundedLocalGameState<T> = CoreBoundedLocalGameState<
        <T as Config>::MaxBagSize,
        <T as Config>::MaxBoardSize,
        <T as Config>::MaxHandActions,
    >;

    /// Type alias for the bounded card set using pallet config.
    pub type BoundedCardSet<T> = CoreBoundedCardSet<<T as Config>::MaxSetSize>;

    /// Type alias for the bounded turn action using pallet config.
    /// MaxHandActions is used as the max number of actions in a turn.
    pub type BoundedCommitTurnAction<T> =
        CoreBoundedCommitTurnAction<<T as Config>::MaxHandActions>;

    /// Type alias for bounded ghost board using pallet config.
    pub type BoundedGhostBoard<T> = CoreBoundedGhostBoard<<T as Config>::MaxBoardSize>;

    /// Type alias for bounded ability using pallet config.
    pub type BoundedAbility<T> =
        CoreBoundedAbility<<T as Config>::MaxStringLen, <T as Config>::MaxConditions>;

    /// Type alias for the balance type from the configured Currency.
    pub type BalanceOf<T> = <<T as Config>::Currency as fungible::Inspect<
        <T as frame_system::Config>::AccountId,
    >>::Balance;

    /// The core game data of a user-submitted card (used for hashing).
    /// Does not include metadata like name or emoji - those are stored separately.
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        CloneNoBound,
        PartialEqNoBound,
        RuntimeDebugNoBound,
        MaxEncodedLen,
    )]
    #[scale_info(skip_type_params(T))]
    pub struct UserCardData<T: Config> {
        /// Combat stats (attack, health)
        pub stats: UnitStats,
        /// Economy stats (play_cost, pitch_value)
        pub economy: EconomyStats,
        /// Card abilities
        pub abilities: BoundedVec<BoundedAbility<T>, T::MaxAbilities>,
    }

    /// Metadata for a card (name, emoji, etc. - not used in game logic).
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        CloneNoBound,
        PartialEqNoBound,
        RuntimeDebugNoBound,
        MaxEncodedLen,
    )]
    #[scale_info(skip_type_params(T))]
    pub struct CardMetadata<T: Config> {
        /// Display name of the card
        pub name: BoundedVec<u8, T::MaxStringLen>,
        /// Emoji representation (UTF-8 encoded)
        pub emoji: BoundedVec<u8, T::MaxStringLen>,
        /// Card description
        pub description: BoundedVec<u8, T::MaxStringLen>,
    }

    /// A card metadata entry stored on-chain.
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        CloneNoBound,
        PartialEqNoBound,
        RuntimeDebugNoBound,
        MaxEncodedLen,
    )]
    #[scale_info(skip_type_params(T))]
    pub struct CardMetadataEntry<T: Config> {
        /// The creator who submitted this card
        pub creator: T::AccountId,
        /// The metadata
        pub metadata: CardMetadata<T>,
        /// Block number when the card was created
        pub created_at: BlockNumberFor<T>,
    }

    /// Metadata for a card set (name, etc.).
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        CloneNoBound,
        PartialEqNoBound,
        RuntimeDebugNoBound,
        MaxEncodedLen,
    )]
    #[scale_info(skip_type_params(T))]
    pub struct SetMetadata<T: Config> {
        /// Display name of the set
        pub name: BoundedVec<u8, T::MaxStringLen>,
        /// The creator of this card set
        pub creator: T::AccountId,
    }

    /// A game session stored on-chain.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct GameSession<T: Config> {
        pub state: BoundedLocalGameState<T>,
        pub set_id: u32,
        pub owner: T::AccountId,
    }

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
        Encode, Decode, DecodeWithMemTracking, TypeInfo, Clone, PartialEq, RuntimeDebug, MaxEncodedLen,
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
        Encode, Decode, DecodeWithMemTracking, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen, DefaultNoBound,
    )]
    #[scale_info(skip_type_params(T))]
    pub struct TournamentState<T: Config> {
        pub total_pot: BalanceOf<T>,
        pub total_entries: u32,
        pub total_perfect_runs: u32,
    }

    /// Per-player statistics within a tournament.
    #[derive(
        Encode, Decode, DecodeWithMemTracking, TypeInfo, Clone, PartialEq, RuntimeDebug, MaxEncodedLen, Default,
    )]
    pub struct PlayerTournamentStats {
        pub perfect_runs: u32,
        pub total_wins: u32,
        pub total_games: u32,
    }

    /// A tournament game session (separate from regular GameSession).
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound, MaxEncodedLen)]
    #[scale_info(skip_type_params(T))]
    pub struct TournamentGameSession<T: Config> {
        pub state: BoundedLocalGameState<T>,
        pub set_id: u32,
        pub owner: T::AccountId,
        pub tournament_id: u32,
    }

    /// Map of Active Games: AccountId -> GameSession
    #[pallet::storage]
    pub type ActiveGame<T: Config> =
        StorageMap<_, Blake2_128Concat, T::AccountId, GameSession<T>, OptionQuery>;

    /// Map of Card Sets: u32 -> CardSet
    #[pallet::storage]
    pub type CardSets<T: Config> =
        StorageMap<_, Blake2_128Concat, u32, BoundedCardSet<T>, OptionQuery>;

    /// Next available ID for card sets.
    #[pallet::storage]
    pub type NextSetId<T: Config> = StorageValue<_, u32, ValueQuery>;

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
        BoundedVec<GhostEntry<T>, <T as Config>::MaxGhostsPerBracket>,
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

    /// Next available ID for user-submitted cards.
    #[pallet::storage]
    pub type NextUserCardId<T: Config> = StorageValue<_, u32, ValueQuery>;

    /// Map of card hashes to their unique CardId.
    /// Used to prevent duplicate cards from being stored.
    #[pallet::storage]
    pub type UserCardHashes<T: Config> = StorageMap<_, Blake2_128Concat, T::Hash, u32, OptionQuery>;

    /// User-submitted cards indexed by their unique CardId.
    #[pallet::storage]
    pub type UserCards<T: Config> =
        StorageMap<_, Blake2_128Concat, u32, UserCardData<T>, OptionQuery>;

    /// Card metadata indexed by CardId.
    /// Metadata is separate from game logic data and can be updated by the creator.
    #[pallet::storage]
    pub type CardMetadataStore<T: Config> =
        StorageMap<_, Blake2_128Concat, u32, CardMetadataEntry<T>, OptionQuery>;

    /// Set metadata indexed by set_id.
    #[pallet::storage]
    pub type CardSetMetadataStore<T: Config> =
        StorageMap<_, Blake2_128Concat, u32, SetMetadata<T>, OptionQuery>;

    /// Map of card set hashes to their unique set ID.
    /// Used to prevent duplicate card sets from being stored.
    #[pallet::storage]
    pub type CardSetHashes<T: Config> =
        StorageMap<_, Blake2_128Concat, T::Hash, u32, OptionQuery>;

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
        Blake2_128Concat, u32,          // tournament_id
        Blake2_128Concat, T::AccountId, // player
        PlayerTournamentStats,
        ValueQuery,
    >;

    /// Whether a player has claimed their prize for a tournament.
    #[pallet::storage]
    pub type TournamentClaimed<T: Config> = StorageDoubleMap<
        _,
        Blake2_128Concat, u32,          // tournament_id
        Blake2_128Concat, T::AccountId, // player
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
        BoundedVec<GhostEntry<T>, <T as Config>::MaxGhostsPerBracket>,
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
        /// A new user card has been submitted.
        CardSubmitted {
            creator: T::AccountId,
            card_id: u32,
            card_hash: T::Hash,
        },
        /// Card metadata has been set or updated.
        CardMetadataUpdated { creator: T::AccountId, card_id: u32 },
        /// A new card set has been created.
        SetCreated { creator: T::AccountId, set_id: u32 },
        /// Card set metadata has been set or updated.
        SetMetadataUpdated { updater: T::AccountId, set_id: u32 },
        /// A new tournament has been created.
        TournamentCreated { tournament_id: u32, set_id: u32 },
        /// A player has joined a tournament and started a game.
        TournamentGameStarted { owner: T::AccountId, tournament_id: u32, seed: u64 },
        /// A tournament game has been completed (win or loss).
        TournamentGameCompleted { owner: T::AccountId, tournament_id: u32, wins: i32 },
        /// A tournament game has been abandoned.
        TournamentGameAbandoned { owner: T::AccountId, tournament_id: u32 },
        /// A regular game has been abandoned.
        GameAbandoned { owner: T::AccountId },
        /// A tournament prize has been claimed.
        PrizeClaimed { tournament_id: u32, player: T::AccountId, amount: BalanceOf<T> },
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
        /// A card with this hash already exists.
        CardAlreadyExists,
        /// The specified card does not exist.
        CardNotFound,
        /// Only the card creator can perform this action.
        NotCardCreator,
        /// The total rarity of the cards in the set would overflow.
        RarityOverflow,
        /// The total rarity of the cards in the set is zero.
        InvalidRarity,
        /// A card set with this exact card list already exists.
        SetAlreadyExists,
        /// The specified tournament does not exist.
        TournamentNotFound,
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

    /// Input for creating a card set.
    #[derive(
        Encode,
        Decode,
        DecodeWithMemTracking,
        TypeInfo,
        MaxEncodedLen,
        Clone,
        RuntimeDebug,
        PartialEq,
        Eq,
    )]
    pub struct CardSetEntryInput {
        pub card_id: u32,
        pub rarity: u32,
    }

    #[pallet::genesis_config]
    #[derive(frame::prelude::DefaultNoBound)]
    pub struct GenesisConfig<T: Config> {
        #[expect(clippy::type_complexity)]
        pub _phantom: core::marker::PhantomData<T>,
    }

    #[pallet::genesis_build]
    impl<T: Config> BuildGenesisConfig for GenesisConfig<T> {
        fn build(&self) {
            use oab_core::cards::{get_all_card_metas, get_all_cards, get_all_set_metas, get_all_sets};

            let cards = get_all_cards();
            let metas = get_all_card_metas();
            let sets = get_all_sets();
            let set_metas = get_all_set_metas();

            // Store all cards
            for (card, meta) in cards.iter().zip(metas.iter()) {
                let card_id = card.id.0;
                let data = UserCardData::<T> {
                    stats: card.stats.clone(),
                    economy: card.economy.clone(),
                    abilities: BoundedVec::truncate_from(
                        card.abilities
                            .iter()
                            .cloned()
                            .map(|a| BoundedAbility::<T>::from(a))
                            .collect(),
                    ),
                };

                UserCards::<T>::insert(card_id, data);

                let metadata_entry = CardMetadataEntry {
                    creator: T::AccountId::decode(&mut frame::traits::TrailingZeroInput::zeroes())
                        .unwrap(),
                    metadata: CardMetadata {
                        name: BoundedVec::truncate_from(meta.name.as_bytes().to_vec()),
                        emoji: BoundedVec::truncate_from(meta.emoji.as_bytes().to_vec()),
                        description: BoundedVec::default(),
                    },
                    created_at: Zero::zero(),
                };
                CardMetadataStore::<T>::insert(card_id, metadata_entry);

                if card_id >= NextUserCardId::<T>::get() {
                    NextUserCardId::<T>::put(card_id + 1);
                }
            }

            // Store all sets
            let num_sets = sets.len();
            for (i, card_set) in sets.into_iter().enumerate() {
                let bounded = BoundedCardSet::<T>::from(card_set);
                let set_hash = T::Hashing::hash_of(&bounded);
                CardSetHashes::<T>::insert(set_hash, i as u32);
                CardSets::<T>::insert(i as u32, bounded);
            }
            NextSetId::<T>::put(num_sets as u32);

            // Store set metadata
            let default_creator =
                T::AccountId::decode(&mut frame::traits::TrailingZeroInput::zeroes()).unwrap();
            for set_meta in set_metas {
                let metadata = SetMetadata {
                    name: BoundedVec::truncate_from(set_meta.name.as_bytes().to_vec()),
                    creator: default_creator.clone(),
                };
                CardSetMetadataStore::<T>::insert(set_meta.id, metadata);
            }
        }
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Start a new game session.
        /// Generates a random seed and initializes the game state with a deterministic bag.
        #[pallet::call_index(0)]
        #[pallet::weight(Weight::default())]
        pub fn start_game(origin: OriginFor<T>, set_id: u32) -> DispatchResult {
            let who = ensure_signed(origin)?;

            ensure!(
                !ActiveGame::<T>::contains_key(&who),
                Error::<T>::GameAlreadyActive
            );

            let (state, seed) = Self::initialize_game_state(&who, set_id, b"start_game")?;

            let session = GameSession {
                state,
                set_id,
                owner: who.clone(),
            };

            ActiveGame::<T>::insert(&who, session);
            Self::deposit_event(Event::GameStarted { owner: who, seed });

            Ok(())
        }

        /// Submit a complete turn: apply shop actions, run the battle, and prepare the next round.
        /// This is the main extrinsic for gameplay - it handles the full turn cycle on-chain.
        #[pallet::call_index(1)]
        #[pallet::weight(Weight::default())]
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
                &who, session.set_id, session.state.clone().into(), action, b"battle",
            )?;

            // Select ghost from regular pool, fallback to procedural
            let enemy_units = Self::select_ghost_opponent(
                &battle.bracket, &battle.card_set, battle.battle_seed,
            ).unwrap_or_else(|| {
                get_opponent_for_round(
                    battle.core_state.local_state.round,
                    battle.battle_seed.wrapping_add(999),
                    &battle.core_state.card_pool,
                )
                .unwrap_or_default()
            });

            // Store player's board as ghost (after selecting opponent)
            let ghost = Self::create_ghost_board(&battle.core_state);
            Self::store_ghost(&who, &battle.bracket, ghost);

            let turn = Self::execute_and_advance(&who, &mut battle, enemy_units, b"shop");

            if turn.game_over {
                ActiveGame::<T>::remove(&who);
                Self::deposit_event(Event::BattleReported {
                    owner: who,
                    round: turn.completed_round,
                    result: turn.result,
                    new_seed: 0,
                    battle_seed: battle.battle_seed,
                    opponent_board: turn.opponent_ghost,
                });
                return Ok(());
            }

            session.state = battle.core_state.local_state.into();
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

        /// Submit a new user-created card.
        /// The card's unique identifier is a hash of its game logic data.
        /// Metadata (name, emoji, description) should be set separately via `set_card_metadata`.
        #[pallet::call_index(3)]
        #[pallet::weight(Weight::default())]
        pub fn submit_card(origin: OriginFor<T>, card_data: UserCardData<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Generate unique hash from the card data
            let card_hash = T::Hashing::hash_of(&card_data);

            // Ensure card doesn't already exist (de-duplication)
            ensure!(
                !UserCardHashes::<T>::contains_key(&card_hash),
                Error::<T>::CardAlreadyExists
            );

            // Get next ID and increment
            let card_id = NextUserCardId::<T>::get();

            // Create and store the card data
            UserCards::<T>::insert(card_id, &card_data);

            // Create and store initial metadata
            let metadata_entry = CardMetadataEntry {
                creator: who.clone(),
                metadata: CardMetadata {
                    name: BoundedVec::default(),
                    emoji: BoundedVec::default(),
                    description: BoundedVec::default(),
                },
                created_at: frame_system::Pallet::<T>::block_number(),
            };

            UserCardHashes::<T>::insert(&card_hash, card_id);
            CardMetadataStore::<T>::insert(card_id, metadata_entry);
            NextUserCardId::<T>::put(card_id.saturating_add(1));

            Self::deposit_event(Event::CardSubmitted {
                creator: who,
                card_id,
                card_hash,
            });

            Ok(())
        }

        /// Set or update metadata for a card.
        /// Only the card creator can update the metadata.
        #[pallet::call_index(4)]
        #[pallet::weight(Weight::default())]
        pub fn set_card_metadata(
            origin: OriginFor<T>,
            card_id: u32,
            metadata: CardMetadata<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Ensure the card exists
            let mut entry = CardMetadataStore::<T>::get(card_id).ok_or(Error::<T>::CardNotFound)?;

            // Ensure the caller is the card creator
            ensure!(entry.creator == who, Error::<T>::NotCardCreator);

            // Update the metadata
            entry.metadata = metadata;

            CardMetadataStore::<T>::insert(card_id, entry);

            Self::deposit_event(Event::CardMetadataUpdated {
                creator: who,
                card_id,
            });

            Ok(())
        }

        /// Create a new card set.
        #[pallet::call_index(5)]
        #[pallet::weight(Weight::default())]
        pub fn create_card_set(
            origin: OriginFor<T>,
            cards: Vec<CardSetEntryInput>,
            name: Vec<u8>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Verify all cards exist
            for entry in &cards {
                ensure!(
                    UserCards::<T>::contains_key(entry.card_id),
                    Error::<T>::CardNotFound
                );
            }

            // Check for total rarity overflow
            let mut total_rarity: u32 = 0;
            for entry in &cards {
                total_rarity = total_rarity
                    .checked_add(entry.rarity)
                    .ok_or(Error::<T>::RarityOverflow)?;
            }
            ensure!(total_rarity > 0, Error::<T>::InvalidRarity);

            let set_id = NextSetId::<T>::get();

            let card_set = CardSet {
                cards: cards
                    .into_iter()
                    .map(|entry| oab_core::state::CardSetEntry {
                        card_id: oab_core::types::CardId(entry.card_id),
                        rarity: entry.rarity,
                    })
                    .collect(),
            };

            let bounded_set = BoundedCardSet::<T>::from(card_set);
            let set_hash = T::Hashing::hash_of(&bounded_set);
            ensure!(!CardSetHashes::<T>::contains_key(&set_hash), Error::<T>::SetAlreadyExists);

            CardSets::<T>::insert(set_id, bounded_set);
            CardSetHashes::<T>::insert(&set_hash, set_id);

            // Store set metadata
            let set_metadata = SetMetadata {
                name: BoundedVec::truncate_from(name),
                creator: who.clone(),
            };
            CardSetMetadataStore::<T>::insert(set_id, set_metadata);

            NextSetId::<T>::put(set_id.saturating_add(1));

            Self::deposit_event(Event::SetCreated {
                creator: who,
                set_id,
            });

            Ok(())
        }

        /// Set or update metadata for a card set.
        #[pallet::call_index(6)]
        #[pallet::weight(Weight::default())]
        pub fn set_set_metadata(
            origin: OriginFor<T>,
            set_id: u32,
            name: Vec<u8>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            // Ensure the set exists and get existing metadata for creator
            let existing = CardSetMetadataStore::<T>::get(set_id)
                .ok_or(Error::<T>::CardSetNotFound)?;

            let set_metadata = SetMetadata {
                name: BoundedVec::truncate_from(name),
                creator: existing.creator,
            };
            CardSetMetadataStore::<T>::insert(set_id, set_metadata);

            Self::deposit_event(Event::SetMetadataUpdated {
                updater: who,
                set_id,
            });

            Ok(())
        }

        /// Create a new tournament. Only callable by TournamentOrigin (e.g. root/sudo).
        #[pallet::call_index(7)]
        #[pallet::weight(Weight::default())]
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
            ensure!(CardSets::<T>::contains_key(set_id), Error::<T>::CardSetNotFound);

            // Validate tournament period
            let now = frame_system::Pallet::<T>::block_number();
            ensure!(start_block >= now, Error::<T>::InvalidTournamentPeriod);
            ensure!(end_block > start_block, Error::<T>::InvalidTournamentPeriod);

            // Validate prize config sums to 100%
            let total = prize_config.player_share
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

            Self::deposit_event(Event::TournamentCreated { tournament_id, set_id });

            Ok(())
        }

        /// Join a tournament and start a tournament game.
        #[pallet::call_index(8)]
        #[pallet::weight(Weight::default())]
        pub fn join_tournament(
            origin: OriginFor<T>,
            tournament_id: u32,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let config = Tournaments::<T>::get(tournament_id)
                .ok_or(Error::<T>::TournamentNotFound)?;

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

            let (state, seed) = Self::initialize_game_state(
                &who, config.set_id, b"tournament_start",
            )?;

            let session = TournamentGameSession {
                state,
                set_id: config.set_id,
                owner: who.clone(),
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
        #[pallet::weight(Weight::default())]
        pub fn submit_tournament_turn(
            origin: OriginFor<T>,
            action: BoundedCommitTurnAction<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let mut session = ActiveTournamentGame::<T>::get(&who)
                .ok_or(Error::<T>::NoActiveTournamentGame)?;
            ensure!(
                session.state.phase == GamePhase::Shop,
                Error::<T>::WrongPhase
            );

            let tid = session.tournament_id;

            let mut battle = Self::prepare_battle(
                &who, session.set_id, session.state.clone().into(), action, b"tournament_battle",
            )?;

            // Select ghost from tournament pool, fallback to procedural
            let enemy_units = Self::select_tournament_ghost_opponent(
                tid, &battle.bracket, &battle.card_set, battle.battle_seed,
            ).unwrap_or_else(|| {
                get_opponent_for_round(
                    battle.core_state.local_state.round,
                    battle.battle_seed.wrapping_add(999),
                    &battle.core_state.card_pool,
                )
                .unwrap_or_default()
            });

            // Store player's board as tournament ghost
            let ghost = Self::create_ghost_board(&battle.core_state);
            Self::store_tournament_ghost(&who, tid, &battle.bracket, ghost);

            let turn = Self::execute_and_advance(
                &who, &mut battle, enemy_units, b"tournament_shop",
            );

            if turn.game_over {
                TournamentPlayerStats::<T>::mutate(tid, &who, |stats| {
                    stats.total_games += 1;
                    stats.total_wins += turn.current_wins as u32;
                    if turn.current_wins >= 10 {
                        stats.perfect_runs += 1;
                    }
                });
                if turn.current_wins >= 10 {
                    TournamentStates::<T>::mutate(tid, |state| {
                        state.total_perfect_runs += 1;
                    });
                }

                ActiveTournamentGame::<T>::remove(&who);
                Self::deposit_event(Event::TournamentGameCompleted {
                    owner: who,
                    tournament_id: tid,
                    wins: turn.current_wins,
                });
                return Ok(());
            }

            session.state = battle.core_state.local_state.into();
            ActiveTournamentGame::<T>::insert(&who, &session);

            Ok(())
        }

        /// Abandon an active regular game.
        #[pallet::call_index(10)]
        #[pallet::weight(Weight::default())]
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
        #[pallet::weight(Weight::default())]
        pub fn abandon_tournament(origin: OriginFor<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let session = ActiveTournamentGame::<T>::get(&who)
                .ok_or(Error::<T>::NoActiveTournamentGame)?;

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
        #[pallet::weight(Weight::default())]
        pub fn claim_prize(
            origin: OriginFor<T>,
            tournament_id: u32,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let config = Tournaments::<T>::get(tournament_id)
                .ok_or(Error::<T>::TournamentNotFound)?;

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
                let player_pot = config.prize_config.player_share.mul_floor(tournament_state.total_pot);
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
            if let Some(set_meta) = CardSetMetadataStore::<T>::get(config.set_id) {
                if set_meta.creator == who {
                    let set_creator_prize = config.prize_config.set_creator_share
                        .mul_floor(tournament_state.total_pot);
                    total_prize = total_prize.saturating_add(set_creator_prize);
                }
            }

            // 3. Card creator prize (if caller created any cards in the set)
            if let Some(card_set_bounded) = CardSets::<T>::get(config.set_id) {
                let mut my_cards: u32 = 0;
                let total_cards = card_set_bounded.cards.len() as u32;

                for entry in card_set_bounded.cards.iter() {
                    if let Some(card_meta) = CardMetadataStore::<T>::get(entry.card_id.0) {
                        if card_meta.creator == who {
                            my_cards += 1;
                        }
                    }
                }

                if my_cards > 0 && total_cards > 0 {
                    let card_creators_pot = config.prize_config.card_creators_share
                        .mul_floor(tournament_state.total_pot);
                    let my: BalanceOf<T> = my_cards.into();
                    let total: BalanceOf<T> = total_cards.into();
                    let card_creator_prize = card_creators_pot
                        .saturating_mul(my)
                        .checked_div(&total)
                        .unwrap_or(BalanceOf::<T>::zero());
                    total_prize = total_prize.saturating_add(card_creator_prize);
                }
            }

            // Ensure there's actually a prize to claim
            ensure!(total_prize > BalanceOf::<T>::zero(), Error::<T>::NoPrizeAvailable);

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
        fn store_tournament_ghost(
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
