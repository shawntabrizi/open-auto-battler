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

#[frame::pallet]
pub mod pallet {
    use alloc::collections::BTreeMap;
    use alloc::{vec, vec::Vec};
    use frame::prelude::*;
    use frame::traits::{Get, Randomness};

    // Import types from core engine
    use oab_core::bounded::{
        BoundedAbility as CoreBoundedAbility, BoundedCardSet as CoreBoundedCardSet,
        BoundedCommitTurnAction as CoreBoundedCommitTurnAction,
        BoundedGameState as CoreBoundedGameState, BoundedGhostBoard as CoreBoundedGhostBoard,
        BoundedLocalGameState as CoreBoundedLocalGameState, GhostBoardUnit, MatchmakingBracket,
    };
    use oab_core::rng::BattleRng;
    use oab_core::types::{EconomyStats, UnitStats};
    use oab_core::{
        apply_shop_start_triggers, get_opponent_for_round, resolve_battle,
        units::create_starting_bag, verify_and_apply_turn, BattleResult, CardSet, CombatUnit,
        CommitTurnAction, GamePhase, GameState, UnitCard, XorShiftRng,
    };

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
            use oab_core::cards::{get_all_card_metas, get_all_cards, get_all_sets};

            let cards = get_all_cards();
            let metas = get_all_card_metas();
            let sets = get_all_sets();

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
                CardSets::<T>::insert(i as u32, BoundedCardSet::<T>::from(card_set));
            }
            NextSetId::<T>::put(num_sets as u32);
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

            let card_set_bounded = CardSets::<T>::get(set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();

            // Reconstruct card pool from storage for this set
            let card_pool = Self::get_card_pool(&card_set);

            // Generate initial seed
            let seed = Self::generate_next_seed(&who, b"start_game");

            // Create initial state
            let mut state = GameState::reconstruct(
                card_pool,
                set_id,
                oab_core::state::LocalGameState {
                    bag: create_starting_bag(&card_set, seed),
                    hand: Vec::new(),
                    board: vec![None; 5], // BOARD_SIZE is 5
                    mana_limit: 3,        // STARTING_MANA_LIMIT is 3
                    round: 1,
                    lives: 3, // STARTING_LIVES is 3
                    wins: 0,
                    phase: GamePhase::Shop,
                    next_card_id: 1000, // Reserve 1-999 for templates
                    game_seed: seed,
                },
            );

            // Draw initial hand from bag
            state.draw_hand();
            apply_shop_start_triggers(&mut state);

            let (_, _, local_state) = state.decompose();

            let session = GameSession {
                state: local_state.into(),
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

            // Ensure we are in the correct phase
            ensure!(
                session.state.phase == GamePhase::Shop,
                Error::<T>::WrongPhase
            );

            // Reconstruct full core state
            let card_set_bounded =
                CardSets::<T>::get(session.set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();
            let card_pool = Self::get_card_pool(&card_set);

            let mut core_state =
                GameState::reconstruct(card_pool, session.set_id, session.state.clone().into());

            let core_action: CommitTurnAction = action.into();

            // Verify and apply shop phase actions
            verify_and_apply_turn(&mut core_state, &core_action)
                .map_err(|_| Error::<T>::InvalidTurn)?;

            // Generate battle seed
            let battle_seed = Self::generate_next_seed(&who, b"battle");

            // Convert player board to CombatUnits
            let player_units: Vec<CombatUnit> = core_state
                .local_state
                .board
                .iter()
                .flatten()
                .filter_map(|board_unit| {
                    core_state.card_pool.get(&board_unit.card_id).map(|card| {
                        let mut cu = CombatUnit::from_card(card.clone());
                        cu.health = board_unit.current_health.max(0);
                        cu
                    })
                })
                .collect();

            // Build matchmaking bracket for ghost opponent lookup
            let bracket = MatchmakingBracket {
                set_id: session.set_id,
                round: core_state.local_state.round,
                wins: core_state.local_state.wins,
                lives: core_state.local_state.lives,
            };

            // Select ghost opponent first, fallback to procedural if none available
            let enemy_units = Self::select_ghost_opponent(&bracket, &card_set, battle_seed)
                .unwrap_or_else(|| {
                    get_opponent_for_round(
                        core_state.local_state.round,
                        battle_seed.wrapping_add(999),
                        &core_state.card_pool,
                    )
                    .unwrap_or_default()
                });

            // Capture opponent board for event emission
            let opponent_ghost: BoundedGhostBoard<T> = {
                let units: Vec<GhostBoardUnit> = enemy_units
                    .iter()
                    .map(|cu| GhostBoardUnit {
                        card_id: cu.card_id,
                        current_health: cu.health,
                    })
                    .collect();
                CoreBoundedGhostBoard {
                    units: units.try_into().unwrap_or_default(),
                }
            };

            // Store player's board as a ghost for future opponents (after selecting opponent)
            let ghost = Self::create_ghost_board(&core_state);
            Self::store_ghost(&who, &bracket, ghost);

            // Run the battle
            let mut rng = XorShiftRng::seed_from_u64(battle_seed);
            let events = resolve_battle(player_units, enemy_units, &mut rng, &core_state.card_pool);

            // Extract battle result from the last event
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

            // Apply battle result
            match result {
                BattleResult::Victory => {
                    core_state.local_state.wins += 1;
                }
                BattleResult::Defeat => {
                    core_state.local_state.lives -= 1;
                }
                BattleResult::Draw => {}
            }

            let completed_round = core_state.local_state.round;

            // Check for game over conditions
            if core_state.local_state.lives <= 0 {
                // Game over - defeat
                ActiveGame::<T>::remove(&who);
                Self::deposit_event(Event::BattleReported {
                    owner: who,
                    round: completed_round,
                    result,
                    new_seed: 0,
                    battle_seed,
                    opponent_board: opponent_ghost,
                });
                return Ok(());
            }

            if core_state.local_state.wins >= 10 {
                // Game over - victory
                ActiveGame::<T>::remove(&who);
                Self::deposit_event(Event::BattleReported {
                    owner: who,
                    round: completed_round,
                    result,
                    new_seed: 0,
                    battle_seed,
                    opponent_board: opponent_ghost,
                });
                return Ok(());
            }

            // Prepare for next round
            let new_seed = Self::generate_next_seed(&who, b"shop");
            core_state.local_state.game_seed = new_seed;
            core_state.local_state.round += 1;
            core_state.local_state.mana_limit = core_state.calculate_mana_limit();
            core_state.local_state.phase = GamePhase::Shop;

            // Draw new hand for the next shop phase
            core_state.draw_hand();
            apply_shop_start_triggers(&mut core_state);

            // Update session state
            session.state = core_state.local_state.into();

            ActiveGame::<T>::insert(&who, &session);

            Self::deposit_event(Event::BattleReported {
                owner: who,
                round: completed_round,
                result,
                new_seed,
                battle_seed,
                opponent_board: opponent_ghost,
            });

            Ok(())
        }

        /// Report the result of a battle (Optimistic).
        /// Updates wins/lives and proceeds to next round.
        #[pallet::call_index(2)]
        #[pallet::weight(Weight::default())]
        pub fn report_battle_outcome(origin: OriginFor<T>, result: BattleResult) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let mut session = ActiveGame::<T>::get(&who).ok_or(Error::<T>::NoActiveGame)?;

            // Ensure we are in the correct phase
            ensure!(
                session.state.phase == GamePhase::Battle,
                Error::<T>::WrongPhase
            );

            // Apply result
            match result {
                BattleResult::Victory => {
                    session.state.wins += 1;
                }
                BattleResult::Defeat => {
                    session.state.lives -= 1;
                }
                BattleResult::Draw => {
                    // No change in wins or lives usually
                }
            }

            let empty_ghost: BoundedGhostBoard<T> = CoreBoundedGhostBoard {
                units: Default::default(),
            };

            // Check Game Over
            if session.state.lives <= 0 {
                session.state.phase = GamePhase::Defeat;
                // Remove session
                ActiveGame::<T>::remove(&who);
                Self::deposit_event(Event::BattleReported {
                    owner: who,
                    round: session.state.round,
                    result,
                    new_seed: 0, // Game over
                    battle_seed: 0,
                    opponent_board: empty_ghost,
                });
                return Ok(());
            } else if session.state.wins >= 10 {
                // WINS_TO_VICTORY is 10 in core
                session.state.phase = GamePhase::Victory;
                ActiveGame::<T>::remove(&who);
                Self::deposit_event(Event::BattleReported {
                    owner: who,
                    round: session.state.round,
                    result,
                    new_seed: 0, // Game over
                    battle_seed: 0,
                    opponent_board: empty_ghost,
                });
                return Ok(());
            }

            // Generate new seed for next Shop phase
            let new_seed = Self::generate_next_seed(&who, b"shop");

            // Reconstruct core state to use its methods (draw_hand, calculate_mana_limit)
            let card_set_bounded =
                CardSets::<T>::get(session.set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();
            let card_pool = Self::get_card_pool(&card_set);

            let mut core_state =
                GameState::reconstruct(card_pool, session.set_id, session.state.clone().into());

            core_state.local_state.game_seed = new_seed;

            // Capture completed round for event
            let completed_round = core_state.local_state.round;

            // Increment round for next phase
            core_state.local_state.round += 1;
            core_state.local_state.phase = GamePhase::Shop;

            // Update mana limit for new round
            core_state.local_state.mana_limit = core_state.calculate_mana_limit();

            // Draw hand for the next shop phase
            core_state.draw_hand();
            apply_shop_start_triggers(&mut core_state);

            // Update session state
            session.state = core_state.local_state.into();

            ActiveGame::<T>::insert(&who, session);

            Self::deposit_event(Event::BattleReported {
                owner: who,
                round: completed_round,
                result,
                new_seed,
                battle_seed: 0,
                opponent_board: empty_ghost,
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

            CardSets::<T>::insert(set_id, BoundedCardSet::<T>::from(card_set));
            NextSetId::<T>::put(set_id.saturating_add(1));

            Self::deposit_event(Event::SetCreated {
                creator: who,
                set_id,
            });

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
        /// Helper to reconstruct a card pool from storage based on a card set.
        fn get_card_pool(card_set: &CardSet) -> BTreeMap<oab_core::types::CardId, UnitCard> {
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

        /// Helper to convert UserCardData to UnitCard.
        fn entry_to_unit_card(id: oab_core::types::CardId, data: UserCardData<T>) -> UnitCard {
            UnitCard {
                id,
                name: alloc::string::String::new(), // Name is metadata, not used in game logic
                stats: data.stats,
                economy: data.economy,
                abilities: data.abilities.into_iter().map(|a| a.into()).collect(),
            }
        }
        /// Helper to generate a unique seed per user/block/context
        fn generate_next_seed(who: &T::AccountId, context: &[u8]) -> u64 {
            let random = T::Randomness::random(context);
            let mut seed_data = Vec::new();
            seed_data.extend_from_slice(&random.0.encode());
            seed_data.extend_from_slice(&who.encode());

            // Simple hash to u64
            let hash = frame::hashing::blake2_128(&seed_data);
            let mut bytes = [0u8; 8];
            bytes.copy_from_slice(&hash[0..8]);
            u64::from_le_bytes(bytes)
        }

        /// Select a ghost opponent from the given bracket, if any exist.
        /// Returns None if no ghosts are available for the bracket.
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

            if ghosts.is_empty() {
                return None;
            }

            // Deterministic selection based on seed
            let mut rng = XorShiftRng::seed_from_u64(seed);
            let index = rng.gen_range(ghosts.len());
            let ghost_entry = &ghosts[index];

            // Reconstruct card pool for this set
            let card_pool = Self::get_card_pool(card_set);

            // Convert ghost board to combat units using the card pool
            Some(Self::ghost_to_combat_units(&ghost_entry.board, &card_pool))
        }

        /// Convert a ghost board to combat units using the provided card pool.
        fn ghost_to_combat_units(
            ghost: &BoundedGhostBoard<T>,
            card_pool: &BTreeMap<oab_core::types::CardId, UnitCard>,
        ) -> Vec<CombatUnit> {
            ghost
                .units
                .iter()
                .filter_map(|unit| {
                    card_pool.get(&unit.card_id).map(|card| {
                        let mut combat_unit = CombatUnit::from_card(card.clone());
                        combat_unit.health = unit.current_health;
                        combat_unit
                    })
                })
                .collect()
        }

        /// Create a ghost board from the current game state.
        fn create_ghost_board(core_state: &GameState) -> BoundedGhostBoard<T> {
            let units: Vec<GhostBoardUnit> = core_state
                .local_state
                .board
                .iter()
                .flatten()
                .map(|board_unit| GhostBoardUnit {
                    card_id: board_unit.card_id,
                    current_health: board_unit.current_health,
                })
                .collect();

            let bounded_units: BoundedVec<GhostBoardUnit, T::MaxBoardSize> =
                units.try_into().unwrap_or_default();

            CoreBoundedGhostBoard {
                units: bounded_units,
            }
        }

        /// Store a ghost board for the given bracket.
        /// Uses FIFO rotation when at capacity for matchmaking storage.
        /// Also archives the ghost permanently for off-chain analysis.
        fn store_ghost(
            owner: &T::AccountId,
            bracket: &MatchmakingBracket,
            ghost: BoundedGhostBoard<T>,
        ) {
            // Only store non-empty ghost boards
            if ghost.units.is_empty() {
                return;
            }

            // Create ghost entry with owner
            let ghost_entry = GhostEntry {
                owner: owner.clone(),
                board: ghost.clone(),
            };

            // Store in matchmaking bracket (with FIFO rotation)
            GhostOpponents::<T>::mutate(
                (bracket.set_id, bracket.round, bracket.wins, bracket.lives),
                |ghosts| {
                    // FIFO rotation when at capacity
                    if ghosts.len() >= T::MaxGhostsPerBracket::get() as usize {
                        ghosts.remove(0);
                    }
                    let _ = ghosts.try_push(ghost_entry);
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
    }
}
