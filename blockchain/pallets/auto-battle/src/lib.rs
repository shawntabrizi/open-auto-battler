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
    use alloc::{vec, vec::Vec};
    use frame::prelude::*;
    use frame::traits::{Get, Randomness};

    // Import types from core engine
    use manalimit_core::bounded::{
        BoundedCardSet as CoreBoundedCardSet,
        BoundedCommitTurnAction as CoreBoundedCommitTurnAction,
        BoundedGameState as CoreBoundedGameState,
        BoundedGhostBoard as CoreBoundedGhostBoard,
        BoundedLocalGameState as CoreBoundedLocalGameState,
        GhostBoardUnit, MatchmakingBracket,
    };
    use manalimit_core::rng::BattleRng;
    use manalimit_core::{
        verify_and_apply_turn, BattleResult, CardSet, CommitTurnAction,
        GamePhase, GameState, CombatUnit, resolve_battle,
        get_opponent_for_round, XorShiftRng,
        units::{get_card_set, create_genesis_bag},
    };

    #[pallet::pallet]
    #[pallet::without_storage_info]
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
    }

    /// Type alias for the bounded game state using pallet config.
    pub type BoundedGameState<T> = CoreBoundedGameState<
        <T as Config>::MaxBagSize,
        <T as Config>::MaxBoardSize,
        <T as Config>::MaxAbilities,
        <T as Config>::MaxStringLen,
        <T as Config>::MaxHandActions,
    >;

    /// Type alias for the bounded local game state using pallet config.
    pub type BoundedLocalGameState<T> = CoreBoundedLocalGameState<
        <T as Config>::MaxBagSize,
        <T as Config>::MaxBoardSize,
        <T as Config>::MaxHandActions,
    >;

    /// Type alias for the bounded card set using pallet config.
    pub type BoundedCardSet<T> = CoreBoundedCardSet<
        <T as Config>::MaxBagSize,
        <T as Config>::MaxAbilities,
        <T as Config>::MaxStringLen,
    >;

    /// Type alias for the bounded turn action using pallet config.
    /// MaxHandActions is used as the max number of actions in a turn.
    pub type BoundedCommitTurnAction<T> = CoreBoundedCommitTurnAction<<T as Config>::MaxHandActions>;

    /// Type alias for bounded ghost board using pallet config.
    pub type BoundedGhostBoard<T> = CoreBoundedGhostBoard<<T as Config>::MaxBoardSize>;

    /// A game session stored on-chain.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound)]
    #[scale_info(skip_type_params(T))]
    pub struct GameSession<T: Config> {
        pub state: BoundedLocalGameState<T>,
        pub set_id: u32,
        pub owner: T::AccountId,
    }

    /// A ghost entry that includes the owner who created the board.
    /// Used for matchmaking storage.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound)]
    #[scale_info(skip_type_params(T))]
    pub struct GhostEntry<T: Config> {
        /// The player who created this ghost board
        pub owner: T::AccountId,
        /// The ghost board data
        pub board: BoundedGhostBoard<T>,
    }

    /// An archived ghost entry with full context for off-chain analysis.
    /// The bracket is implicit in the storage key.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound)]
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

            // Check if card set exists, if not, create it from core templates
            if !CardSets::<T>::contains_key(set_id) {
                let card_set = get_card_set(set_id).ok_or(Error::<T>::CardSetNotFound)?;
                CardSets::<T>::insert(set_id, BoundedCardSet::<T>::from(card_set));
            }

            let card_set_bounded = CardSets::<T>::get(set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();

            // Generate initial seed
            let seed = Self::generate_next_seed(&who, b"start_game");

            // Create initial state
            let mut state = GameState::reconstruct(card_set.card_pool, set_id, manalimit_core::state::LocalGameState {
                bag: create_genesis_bag(set_id, seed),
                hand: Vec::new(),
                board: vec![None; 5], // BOARD_SIZE is 5
                mana_limit: 3, // STARTING_MANA_LIMIT is 3
                round: 1,
                lives: 3, // STARTING_LIVES is 3
                wins: 0,
                phase: GamePhase::Shop,
                next_card_id: 1000, // Reserve 1-999 for templates
                game_seed: seed,
            });

            // Draw initial hand from bag
            state.draw_hand();

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
            let card_set_bounded = CardSets::<T>::get(session.set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();
            let mut core_state = GameState::reconstruct(card_set.card_pool.clone(), session.set_id, session.state.clone().into());

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
                        &mut core_state.local_state.next_card_id,
                        battle_seed.wrapping_add(999),
                    )
                    .unwrap_or_default()
                });

            // Store player's board as a ghost for future opponents (after selecting opponent)
            let ghost = Self::create_ghost_board(&core_state);
            Self::store_ghost(&who, &bracket, ghost);

            // Run the battle
            let mut rng = XorShiftRng::seed_from_u64(battle_seed);
            let events = resolve_battle(player_units, enemy_units, &mut rng);

            // Extract battle result from the last event
            let result = events
                .iter()
                .rev()
                .find_map(|e| {
                    if let manalimit_core::battle::CombatEvent::BattleEnd { result } = e {
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

            // Update session state
            session.state = core_state.local_state.into();

            ActiveGame::<T>::insert(&who, &session);

            Self::deposit_event(Event::BattleReported {
                owner: who,
                round: completed_round,
                result,
                new_seed,
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
                });
                return Ok(());
            }

            // Generate new seed for next Shop phase
            let new_seed = Self::generate_next_seed(&who, b"shop");

            // Reconstruct core state to use its methods (draw_hand, calculate_mana_limit)
            let card_set_bounded = CardSets::<T>::get(session.set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();
            let mut core_state = GameState::reconstruct(card_set.card_pool, session.set_id, session.state.clone().into());

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

            // Update session state
            session.state = core_state.local_state.into();

            ActiveGame::<T>::insert(&who, session);

            Self::deposit_event(Event::BattleReported {
                owner: who,
                round: completed_round,
                result,
                new_seed,
            });

            Ok(())
        }
    }

    impl<T: Config> Pallet<T> {
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

            // Convert ghost board to combat units using the card set
            Some(Self::ghost_to_combat_units(&ghost_entry.board, card_set))
        }

        /// Convert a ghost board to combat units using the provided card set.
        fn ghost_to_combat_units(
            ghost: &BoundedGhostBoard<T>,
            card_set: &CardSet,
        ) -> Vec<CombatUnit> {
            ghost
                .units
                .iter()
                .filter_map(|unit| {
                    card_set.card_pool.get(&unit.card_id).map(|card| {
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
                (bracket.set_id, bracket.round, bracket.wins, bracket.lives, archive_id),
                archive_entry,
            );
            NextGhostArchiveId::<T>::put(archive_id.saturating_add(1));
        }
    }
}
