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
        BoundedLocalGameState as CoreBoundedLocalGameState,
    };
    use manalimit_core::{
        create_genesis_bag, verify_and_apply_turn, BattleResult, CardSet, CommitTurnAction,
        GamePhase, GameState,
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
    pub type BoundedCommitTurnAction<T> =
        CoreBoundedCommitTurnAction<<T as Config>::MaxBoardSize, <T as Config>::MaxHandActions>;

    /// A game session stored on-chain.
    #[derive(Encode, Decode, TypeInfo, CloneNoBound, PartialEqNoBound)]
    #[scale_info(skip_type_params(T))]
    pub struct GameSession<T: Config> {
        pub state: BoundedLocalGameState<T>,
        pub set_id: u32,
        pub current_seed: u64,
        pub owner: T::AccountId,
    }

    /// Map of Active Games: AccountId -> GameSession
    #[pallet::storage]
    #[pallet::getter(fn active_game)]
    pub type ActiveGame<T: Config> =
        StorageMap<_, Blake2_128Concat, T::AccountId, GameSession<T>, OptionQuery>;

    /// Map of Card Sets: u32 -> CardSet
    #[pallet::storage]
    #[pallet::getter(fn card_set)]
    pub type CardSets<T: Config> =
        StorageMap<_, Blake2_128Concat, u32, BoundedCardSet<T>, OptionQuery>;

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

            // Check if card set exists, if not, create it (MVP: auto-create if missing)
            if !CardSets::<T>::contains_key(set_id) {
                let mut card_pool = alloc::collections::BTreeMap::new();
                for card in create_genesis_bag() {
                    card_pool.insert(card.id, card);
                }
                let card_set = CardSet { card_pool };
                CardSets::<T>::insert(set_id, BoundedCardSet::<T>::from(card_set));
            }

            let card_set_bounded = CardSets::<T>::get(set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();

            // Generate initial seed
            let seed = Self::generate_next_seed(&who, b"start_game");

            // Create initial state
            let mut state = GameState::reconstruct(card_set.card_pool, manalimit_core::state::LocalGameState {
                bag: Vec::new(),
                hand: Vec::new(),
                board: vec![None; 5], // BOARD_SIZE is 5
                mana_limit: 3, // STARTING_MANA_LIMIT is 3
                round: 1,
                lives: 3, // STARTING_LIVES is 3
                wins: 0,
                phase: GamePhase::Shop,
                next_card_id: 1,
                game_seed: seed,
            });

            // Populate bag from card pool
            for &id in state.card_pool.keys() {
                state.local_state.bag.push(id);
            }

            // Draw initial hand from bag
            state.draw_hand();

            let (_, local_state) = state.decompose();

            let session = GameSession {
                state: local_state.into(),
                set_id,
                current_seed: seed,
                owner: who.clone(),
            };

            ActiveGame::<T>::insert(&who, session);

            Self::deposit_event(Event::GameStarted { owner: who, seed });

            Ok(())
        }

        /// Submit actions for the Shop Phase.
        /// Verifies the moves using the core engine and updates the state.
        #[pallet::call_index(1)]
        #[pallet::weight(Weight::default())]
        pub fn submit_shop_phase(
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
            let mut core_state = GameState::reconstruct(card_set.card_pool, session.state.clone().into());
            
            let core_action: CommitTurnAction = action.into();

            // Verify and apply logic
            verify_and_apply_turn(&mut core_state, &core_action)
                .map_err(|_| Error::<T>::InvalidTurn)?;

            // Set phase to battle
            core_state.local_state.phase = GamePhase::Battle;

            // If success, generate new seed for the battle phase
            let new_seed = Self::generate_next_seed(&who, b"battle");
            session.current_seed = new_seed;
            core_state.local_state.game_seed = new_seed;

            // Update session state
            session.state = core_state.local_state.into();

            ActiveGame::<T>::insert(&who, &session);

            Self::deposit_event(Event::TurnCommitted {
                owner: who,
                round: session.state.round,
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
            session.current_seed = new_seed;
            
            // Reconstruct core state to use its methods (draw_hand, calculate_mana_limit)
            let card_set_bounded = CardSets::<T>::get(session.set_id).ok_or(Error::<T>::CardSetNotFound)?;
            let card_set: CardSet = card_set_bounded.into();
            let mut core_state = GameState::reconstruct(card_set.card_pool, session.state.clone().into());

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
    }
}
