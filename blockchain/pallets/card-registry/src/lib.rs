//! # OAB Card Registry Pallet
//!
//! Manages card definitions, card sets, metadata, and achievements for the
//! Open Auto Battler. Game-mode pallets (arena, tournament, constructed)
//! access card data through the [`CardRegistryProvider`] trait.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

pub use pallet::*;

use alloc::collections::BTreeMap;
use frame::prelude::Get;
use oab_battle::types::{CardId, UnitCard};
use oab_battle::CardSet;

/// Bounds shared between the card registry and game-mode pallets.
/// Implemented once on `Runtime`; card-registry's Config and
/// `oab_common::GameEngine` both extend this.
pub trait CardConfig: frame::deps::frame_system::Config {
    /// Maximum number of abilities per card.
    type MaxAbilities: Get<u32>;
    /// Maximum length of strings (names, descriptions).
    type MaxStringLen: Get<u32>;
    /// Maximum number of conditions per ability.
    type MaxConditions: Get<u32>;
    /// Maximum number of cards in a set.
    type MaxSetSize: Get<u32>;
}

/// Trait for reading card registry data.
/// Implemented by this pallet, consumed by game-mode pallets.
pub trait CardRegistryProvider<AccountId> {
    /// Get a card set by ID. Returns None if the set doesn't exist.
    fn get_card_set(set_id: u16) -> Option<CardSet>;

    /// Check whether a card set exists.
    fn card_set_exists(set_id: u16) -> bool;

    /// Build a card pool (CardId -> UnitCard) from a CardSet.
    /// Looks up each card's data from storage.
    fn get_card_pool(card_set: &CardSet) -> BTreeMap<CardId, UnitCard>;

    /// Get the creator of a card set.
    fn get_set_creator(set_id: u16) -> Option<AccountId>;

    /// Count how many cards in a set were created by `who`.
    /// Returns (cards_by_who, total_cards_in_set).
    fn count_cards_created_by(set_id: u16, who: &AccountId) -> (u32, u32);

    /// Read the current achievement bitmap for (player, card_id).
    fn get_achievements(who: &AccountId, card_id: u16) -> u8;

    /// Set the achievement bitmap for (player, card_id).
    fn set_achievements(who: &AccountId, card_id: u16, bitmap: u8);

    /// Build a synthetic card set containing every non-token card,
    /// plus the full card pool. Used by constructed mode.
    fn get_full_card_pool() -> (CardSet, BTreeMap<CardId, UnitCard>);
}

#[frame::pallet]
pub mod pallet {

    use super::*;
    use frame::prelude::*;

    use oab_battle::bounded::{
        BoundedBattleAbility as CoreBoundedBattleAbility, BoundedCardSet as CoreBoundedCardSet,
        BoundedShopAbility as CoreBoundedShopAbility,
    };
    use oab_battle::state::CardSetEntry;
    use oab_battle::types::{EconomyStats, UnitStats};
    use oab_battle::CardSet;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::config]
    pub trait Config: frame_system::Config + crate::CardConfig {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;

        type WeightInfo: WeightInfo;
    }

    // ── Weight trait ─────────────────────────────────────────────────────

    pub trait WeightInfo {
        fn submit_card() -> Weight;
        fn set_card_metadata() -> Weight;
        fn create_card_set() -> Weight;
        fn set_set_metadata() -> Weight;
    }

    impl WeightInfo for () {
        fn submit_card() -> Weight {
            Weight::from_parts(120_000_000, 0)
        }
        fn set_card_metadata() -> Weight {
            Weight::from_parts(80_000_000, 0)
        }
        fn create_card_set() -> Weight {
            Weight::from_parts(180_000_000, 0)
        }
        fn set_set_metadata() -> Weight {
            Weight::from_parts(80_000_000, 0)
        }
    }

    // ── Type aliases ─────────────────────────────────────────────────────

    pub type BoundedCardSet<T> = CoreBoundedCardSet<<T as crate::CardConfig>::MaxSetSize>;
    pub type BoundedBattleAbility<T> =
        CoreBoundedBattleAbility<<T as crate::CardConfig>::MaxConditions>;
    pub type BoundedShopAbility<T> =
        CoreBoundedShopAbility<<T as crate::CardConfig>::MaxConditions>;

    // ── Types ────────────────────────────────────────────────────────────

    /// The core game data of a user-submitted card (used for hashing).
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
        pub stats: UnitStats,
        pub economy: EconomyStats,
        pub shop_abilities: BoundedVec<BoundedShopAbility<T>, T::MaxAbilities>,
        pub battle_abilities: BoundedVec<BoundedBattleAbility<T>, T::MaxAbilities>,
    }

    /// Metadata for a card (not used in game logic).
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
        pub name: BoundedVec<u8, T::MaxStringLen>,
        pub emoji: BoundedVec<u8, T::MaxStringLen>,
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
        pub creator: T::AccountId,
        pub metadata: CardMetadata<T>,
        pub created_at: BlockNumberFor<T>,
    }

    /// Metadata for a card set.
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
        pub name: BoundedVec<u8, T::MaxStringLen>,
        pub creator: T::AccountId,
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
        pub card_id: u16,
        pub rarity: u8,
    }

    /// Achievement bitmap flags.
    pub const ACHIEVEMENT_BRONZE: u8 = 0b001;
    pub const ACHIEVEMENT_SILVER: u8 = 0b010;
    pub const ACHIEVEMENT_GOLD: u8 = 0b100;

    // ── Storage ──────────────────────────────────────────────────────────

    #[pallet::storage]
    pub type UserCards<T: Config> =
        StorageMap<_, Blake2_128Concat, u16, UserCardData<T>, OptionQuery>;

    #[pallet::storage]
    pub type CardSets<T: Config> =
        StorageMap<_, Blake2_128Concat, u16, BoundedCardSet<T>, OptionQuery>;

    #[pallet::storage]
    pub type NextUserCardId<T: Config> = StorageValue<_, u16, ValueQuery>;

    #[pallet::storage]
    pub type NextSetId<T: Config> = StorageValue<_, u16, ValueQuery>;

    #[pallet::storage]
    pub type UserCardHashes<T: Config> = StorageMap<_, Blake2_128Concat, T::Hash, u16, OptionQuery>;

    #[pallet::storage]
    pub type CardSetHashes<T: Config> = StorageMap<_, Blake2_128Concat, T::Hash, u16, OptionQuery>;

    #[pallet::storage]
    pub type CardMetadataStore<T: Config> =
        StorageMap<_, Blake2_128Concat, u16, CardMetadataEntry<T>, OptionQuery>;

    #[pallet::storage]
    pub type CardSetMetadataStore<T: Config> =
        StorageMap<_, Blake2_128Concat, u16, SetMetadata<T>, OptionQuery>;

    #[pallet::storage]
    pub type VictoryAchievements<T: Config> =
        StorageDoubleMap<_, Blake2_128Concat, T::AccountId, Blake2_128Concat, u16, u8, ValueQuery>;

    // ── Events ───────────────────────────────────────────────────────────

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        CardSubmitted {
            creator: T::AccountId,
            card_id: u16,
            card_hash: T::Hash,
        },
        CardMetadataUpdated {
            creator: T::AccountId,
            card_id: u16,
        },
        SetCreated {
            creator: T::AccountId,
            set_id: u16,
        },
        SetMetadataUpdated {
            updater: T::AccountId,
            set_id: u16,
        },
    }

    // ── Errors ───────────────────────────────────────────────────────────

    #[pallet::error]
    pub enum Error<T> {
        CardSetNotFound,
        CardAlreadyExists,
        CardNotFound,
        NotCardCreator,
        RarityOverflow,
        InvalidRarity,
        SetAlreadyExists,
    }

    // ── Genesis ──────────────────────────────────────────────────────────

    #[pallet::genesis_config]
    #[derive(frame::prelude::DefaultNoBound)]
    pub struct GenesisConfig<T: Config> {
        #[expect(clippy::type_complexity)]
        pub _phantom: core::marker::PhantomData<T>,
    }

    #[pallet::genesis_build]
    impl<T: Config> BuildGenesisConfig for GenesisConfig<T> {
        fn build(&self) {
            let cards = oab_assets::cards::get_all();
            let metas = oab_assets::cards::get_all_metas();
            let sets = oab_assets::sets::get_all();
            let set_metas = oab_assets::sets::get_all_metas();

            let default_creator =
                T::AccountId::decode(&mut frame::traits::TrailingZeroInput::zeroes()).unwrap();

            // Store all cards
            for (card, meta) in cards.iter().zip(metas.iter()) {
                let card_id = card.id.0;
                let data = UserCardData::<T> {
                    stats: card.stats.clone(),
                    economy: card.economy.clone(),
                    shop_abilities: BoundedVec::truncate_from(
                        card.shop_abilities
                            .iter()
                            .cloned()
                            .map(|a| BoundedShopAbility::<T>::from(a))
                            .collect(),
                    ),
                    battle_abilities: BoundedVec::truncate_from(
                        card.battle_abilities
                            .iter()
                            .cloned()
                            .map(|a| BoundedBattleAbility::<T>::from(a))
                            .collect(),
                    ),
                };

                UserCards::<T>::insert(card_id, data);

                let metadata_entry = CardMetadataEntry {
                    creator: default_creator.clone(),
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
                CardSetHashes::<T>::insert(set_hash, i as u16);
                CardSets::<T>::insert(i as u16, bounded);
            }
            NextSetId::<T>::put(num_sets as u16);

            // Store set metadata
            for set_meta in set_metas {
                let metadata = SetMetadata {
                    name: BoundedVec::truncate_from(set_meta.name.as_bytes().to_vec()),
                    creator: default_creator.clone(),
                };
                CardSetMetadataStore::<T>::insert(set_meta.id as u16, metadata);
            }
        }
    }

    // ── Extrinsics ───────────────────────────────────────────────────────

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        /// Submit a new user-created card.
        #[pallet::call_index(0)]
        #[pallet::weight(T::WeightInfo::submit_card())]
        pub fn submit_card(origin: OriginFor<T>, card_data: UserCardData<T>) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let card_hash = T::Hashing::hash_of(&card_data);
            ensure!(
                !UserCardHashes::<T>::contains_key(&card_hash),
                Error::<T>::CardAlreadyExists
            );

            let card_id = NextUserCardId::<T>::get();

            UserCards::<T>::insert(card_id, &card_data);

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
        #[pallet::call_index(1)]
        #[pallet::weight(T::WeightInfo::set_card_metadata())]
        pub fn set_card_metadata(
            origin: OriginFor<T>,
            card_id: u16,
            metadata: CardMetadata<T>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let mut entry = CardMetadataStore::<T>::get(card_id).ok_or(Error::<T>::CardNotFound)?;
            ensure!(entry.creator == who, Error::<T>::NotCardCreator);

            entry.metadata = metadata;
            CardMetadataStore::<T>::insert(card_id, entry);

            Self::deposit_event(Event::CardMetadataUpdated {
                creator: who,
                card_id,
            });

            Ok(())
        }

        /// Create a new card set.
        #[pallet::call_index(2)]
        #[pallet::weight(T::WeightInfo::create_card_set())]
        pub fn create_card_set(
            origin: OriginFor<T>,
            cards: BoundedVec<CardSetEntryInput, T::MaxSetSize>,
            name: BoundedVec<u8, T::MaxStringLen>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            for entry in &cards {
                ensure!(
                    UserCards::<T>::contains_key(entry.card_id),
                    Error::<T>::CardNotFound
                );
            }

            let mut total_rarity: u32 = 0;
            for entry in &cards {
                total_rarity = total_rarity
                    .checked_add(entry.rarity as u32)
                    .ok_or(Error::<T>::RarityOverflow)?;
            }
            ensure!(total_rarity > 0, Error::<T>::InvalidRarity);

            let set_id = NextSetId::<T>::get();

            let card_set = CardSet {
                cards: cards
                    .into_iter()
                    .map(|entry| CardSetEntry {
                        card_id: CardId(entry.card_id),
                        rarity: entry.rarity,
                    })
                    .collect(),
            };

            let bounded_set = BoundedCardSet::<T>::from(card_set);
            let set_hash = T::Hashing::hash_of(&bounded_set);
            ensure!(
                !CardSetHashes::<T>::contains_key(&set_hash),
                Error::<T>::SetAlreadyExists
            );

            CardSets::<T>::insert(set_id, bounded_set);
            CardSetHashes::<T>::insert(&set_hash, set_id);

            let set_metadata = SetMetadata {
                name,
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
        #[pallet::call_index(3)]
        #[pallet::weight(T::WeightInfo::set_set_metadata())]
        pub fn set_set_metadata(
            origin: OriginFor<T>,
            set_id: u16,
            name: BoundedVec<u8, T::MaxStringLen>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;

            let existing =
                CardSetMetadataStore::<T>::get(set_id).ok_or(Error::<T>::CardSetNotFound)?;

            let set_metadata = SetMetadata {
                name,
                creator: existing.creator,
            };
            CardSetMetadataStore::<T>::insert(set_id, set_metadata);

            Self::deposit_event(Event::SetMetadataUpdated {
                updater: who,
                set_id,
            });

            Ok(())
        }
    }

    // ── Trait Implementation ─────────────────────────────────────────────

    impl<T: Config> CardRegistryProvider<T::AccountId> for Pallet<T> {
        fn get_card_set(set_id: u16) -> Option<CardSet> {
            CardSets::<T>::get(set_id).map(|bounded| bounded.into())
        }

        fn card_set_exists(set_id: u16) -> bool {
            CardSets::<T>::contains_key(set_id)
        }

        fn get_card_pool(card_set: &CardSet) -> BTreeMap<CardId, UnitCard> {
            let mut pool = BTreeMap::new();
            for entry in &card_set.cards {
                if let Some(user_data) = UserCards::<T>::get(entry.card_id.0) {
                    pool.insert(
                        entry.card_id,
                        Self::entry_to_unit_card(entry.card_id, user_data),
                    );
                }
            }
            pool
        }

        fn get_set_creator(set_id: u16) -> Option<T::AccountId> {
            CardSetMetadataStore::<T>::get(set_id).map(|meta| meta.creator)
        }

        fn count_cards_created_by(set_id: u16, who: &T::AccountId) -> (u32, u32) {
            let Some(card_set) = CardSets::<T>::get(set_id) else {
                return (0, 0);
            };
            let total = card_set.cards.len() as u32;
            let mut mine = 0u32;
            for entry in card_set.cards.iter() {
                if let Some(card_meta) = CardMetadataStore::<T>::get(entry.card_id.0) {
                    if card_meta.creator == *who {
                        mine += 1;
                    }
                }
            }
            (mine, total)
        }

        fn get_achievements(who: &T::AccountId, card_id: u16) -> u8 {
            VictoryAchievements::<T>::get(who, card_id)
        }

        fn set_achievements(who: &T::AccountId, card_id: u16, bitmap: u8) {
            VictoryAchievements::<T>::insert(who, card_id, bitmap);
        }

        fn get_full_card_pool() -> (CardSet, BTreeMap<CardId, UnitCard>) {
            use oab_battle::state::CardSetEntry;

            let next_id = NextUserCardId::<T>::get();
            let mut entries = alloc::vec::Vec::new();
            let mut pool = BTreeMap::new();

            for id in 0..next_id {
                if let Some(user_data) = UserCards::<T>::get(id) {
                    let card_id = CardId(id);
                    let unit_card = Self::entry_to_unit_card(card_id, user_data);
                    // Exclude tokens (play_cost == 0)
                    if unit_card.economy.play_cost > 0 {
                        entries.push(CardSetEntry { card_id, rarity: 1 });
                        pool.insert(card_id, unit_card);
                    }
                }
            }

            (CardSet { cards: entries }, pool)
        }
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    impl<T: Config> Pallet<T> {
        fn entry_to_unit_card(id: CardId, data: UserCardData<T>) -> UnitCard {
            UnitCard {
                id,
                name: alloc::string::String::new(),
                stats: data.stats,
                economy: data.economy,
                shop_abilities: data.shop_abilities.into_iter().map(|a| a.into()).collect(),
                battle_abilities: data
                    .battle_abilities
                    .into_iter()
                    .map(|a| a.into())
                    .collect(),
            }
        }
    }
}
