//! Benchmarking for pallet-auto-battle.
//!
//! This module benchmarks each dispatchable on its heaviest execution path within the
//! configured pallet bounds.

use super::*;
use alloc::vec;
use alloc::vec::Vec;
use frame::arithmetic::Perbill;
use frame::deps::sp_runtime::traits::SaturatedConversion;
use frame::{deps::frame_benchmarking::v2::*, prelude::*};

#[benchmarks]
mod benchmarks {
    use super::*;
    use frame::traits::fungible;
    use frame_system::RawOrigin;
    use oab_core::types::{BoardUnit, CardId, EconomyStats, UnitStats};
    use oab_core::{CommitTurnAction, TurnAction};

    fn default_prize_config() -> PrizeConfig {
        PrizeConfig {
            player_share: Perbill::from_percent(60),
            set_creator_share: Perbill::from_percent(20),
            card_creators_share: Perbill::from_percent(20),
        }
    }

    fn benchmark_balance<T: Config>() -> BalanceOf<T> {
        1_000_000u128.saturated_into()
    }

    fn benchmark_entry_fee<T: Config>() -> BalanceOf<T> {
        1_000u128.saturated_into()
    }

    fn max_name<T: Config>() -> BoundedVec<u8, T::MaxStringLen> {
        let len = T::MaxStringLen::get() as usize;
        BoundedVec::try_from(vec![b'a'; len]).expect("name length is bounded by MaxStringLen")
    }

    fn max_actions<T: Config>() -> BoundedCommitTurnAction<T> {
        let len = T::MaxHandActions::get() as usize;
        let actions = (0..len)
            .map(|_| TurnAction::SwapBoard {
                slot_a: 0,
                slot_b: 0,
            })
            .collect();
        CommitTurnAction { actions }.into()
    }

    fn max_set_entries<T: Config>(card_id: u32) -> BoundedVec<CardSetEntryInput, T::MaxSetSize> {
        let len = T::MaxSetSize::get() as usize;
        let entries: Vec<_> = (0..len)
            .map(|_| CardSetEntryInput { card_id, rarity: 1 })
            .collect();
        BoundedVec::try_from(entries).expect("set size is bounded by MaxSetSize")
    }

    fn max_battle_abilities<T: Config>() -> BoundedVec<BoundedBattleAbility<T>, T::MaxAbilities> {
        let max = T::MaxAbilities::get() as usize;
        if max == 0 {
            return BoundedVec::default();
        }

        for card_id in 0..NextUserCardId::<T>::get() {
            if let Some(card) = UserCards::<T>::get(card_id) {
                if let Some(sample) = card.battle_abilities.into_iter().next() {
                    let abilities: Vec<_> = (0..max).map(|_| sample.clone()).collect();
                    return BoundedVec::try_from(abilities)
                        .expect("ability count is bounded by MaxAbilities");
                }
            }
        }

        BoundedVec::default()
    }

    fn max_shop_abilities<T: Config>() -> BoundedVec<BoundedShopAbility<T>, T::MaxAbilities> {
        let max = T::MaxAbilities::get() as usize;
        if max == 0 {
            return BoundedVec::default();
        }

        for card_id in 0..NextUserCardId::<T>::get() {
            if let Some(card) = UserCards::<T>::get(card_id) {
                if let Some(sample) = card.shop_abilities.into_iter().next() {
                    let abilities: Vec<_> = (0..max).map(|_| sample.clone()).collect();
                    return BoundedVec::try_from(abilities)
                        .expect("ability count is bounded by MaxAbilities");
                }
            }
        }

        BoundedVec::default()
    }

    fn max_card_metadata<T: Config>() -> CardMetadata<T> {
        CardMetadata {
            name: max_name::<T>(),
            emoji: max_name::<T>(),
            description: max_name::<T>(),
        }
    }

    fn fund_account<T: Config>(who: &T::AccountId, amount: BalanceOf<T>) {
        let _ = <T::Currency as fungible::Mutate<T::AccountId>>::mint_into(who, amount);
    }

    fn create_custom_card<T: Config>(creator: &T::AccountId) -> u32 {
        let next_id = NextUserCardId::<T>::get();
        let offset: i32 = next_id.saturated_into();
        let card_data = UserCardData::<T> {
            stats: UnitStats {
                attack: 1_000 + (offset % 100),
                health: 1_100 + (offset % 100),
            },
            economy: EconomyStats {
                play_cost: 1,
                pitch_value: 1,
            },
            shop_abilities: max_shop_abilities::<T>(),
            battle_abilities: max_battle_abilities::<T>(),
        };

        Pallet::<T>::submit_card(RawOrigin::Signed(creator.clone()).into(), card_data)
            .expect("card creation in benchmark setup should succeed");
        next_id
    }

    fn create_max_card_set<T: Config>(creator: &T::AccountId, card_id: u32) -> u32 {
        let set_id = NextSetId::<T>::get();
        Pallet::<T>::create_card_set(
            RawOrigin::Signed(creator.clone()).into(),
            max_set_entries::<T>(card_id),
            max_name::<T>(),
        )
        .expect("card set creation in benchmark setup should succeed");
        set_id
    }

    fn create_active_tournament<T: Config>(set_id: u32, entry_fee: BalanceOf<T>) -> u32 {
        let start_block: BlockNumberFor<T> = 1u32.saturated_into();
        let end_block: BlockNumberFor<T> = 1_000u32.saturated_into();
        frame_system::Pallet::<T>::set_block_number(start_block);

        let tournament_id = NextTournamentId::<T>::get();
        Pallet::<T>::create_tournament(
            RawOrigin::Root.into(),
            set_id,
            entry_fee,
            start_block,
            end_block,
            default_prize_config(),
        )
        .expect("tournament creation in benchmark setup should succeed");
        tournament_id
    }

    fn fill_regular_board<T: Config>(who: &T::AccountId) {
        ActiveGame::<T>::mutate(who, |session| {
            let session = session
                .as_mut()
                .expect("active regular session should exist");
            for (slot_index, slot) in session.state.board.iter_mut().enumerate() {
                let card_id = CardId((slot_index as u32).saturating_add(1));
                *slot = Some(BoardUnit::new(card_id));
            }
        });
    }

    fn fill_tournament_board<T: Config>(who: &T::AccountId) {
        ActiveTournamentGame::<T>::mutate(who, |session| {
            let session = session
                .as_mut()
                .expect("active tournament session should exist");
            for (slot_index, slot) in session.state.board.iter_mut().enumerate() {
                let card_id = CardId((slot_index as u32).saturating_add(1));
                *slot = Some(BoardUnit::new(card_id));
            }
        });
    }

    /// Complexity: `O(1)`.
    /// Dominant path: create and store one `ActiveGame` session.
    #[benchmark]
    fn start_game() {
        let caller: T::AccountId = whitelisted_caller();

        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), 0u32);

        assert!(ActiveGame::<T>::contains_key(&caller));
    }

    /// Complexity: `O(A + B + E)`, where:
    /// - `A` is turn action count (`MaxHandActions`)
    /// - `B` is board scan/build work (`MaxBoardSize`)
    /// - `E` is combat event processing cost
    /// Dominant path: verify/apply actions, resolve battle, write ghost + archive, advance round.
    #[benchmark]
    fn submit_turn() {
        let caller: T::AccountId = whitelisted_caller();
        Pallet::<T>::start_game(RawOrigin::Signed(caller.clone()).into(), 0u32)
            .expect("setup start_game should succeed");
        fill_regular_board::<T>(&caller);
        let action = max_actions::<T>();

        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), action);

        if let Some(session) = ActiveGame::<T>::get(&caller) {
            assert!(session.state.round >= 2);
        }
    }

    /// Complexity: `O(Ab)`, where `Ab` is ability count (`MaxAbilities`).
    /// Dominant path: hash card payload and store card + metadata entries.
    #[benchmark]
    fn submit_card() {
        let caller: T::AccountId = whitelisted_caller();
        let next_id = NextUserCardId::<T>::get();
        let offset: i32 = next_id.saturated_into();
        let card_data = UserCardData::<T> {
            stats: UnitStats {
                attack: 2_000 + (offset % 100),
                health: 2_100 + (offset % 100),
            },
            economy: EconomyStats {
                play_cost: 1,
                pitch_value: 1,
            },
            shop_abilities: max_shop_abilities::<T>(),
            battle_abilities: max_battle_abilities::<T>(),
        };
        let card_hash = T::Hashing::hash_of(&card_data);

        #[extrinsic_call]
        _(RawOrigin::Signed(caller), card_data);

        assert!(UserCardHashes::<T>::contains_key(card_hash));
    }

    /// Complexity: `O(S)`, where `S` is bounded metadata string length (`MaxStringLen`).
    /// Dominant path: load metadata entry, authorization check, write updated metadata.
    #[benchmark]
    fn set_card_metadata() {
        let caller: T::AccountId = whitelisted_caller();
        let card_id = create_custom_card::<T>(&caller);
        let metadata = max_card_metadata::<T>();

        #[extrinsic_call]
        _(RawOrigin::Signed(caller), card_id, metadata.clone());

        let entry = CardMetadataStore::<T>::get(card_id).expect("metadata should be present");
        assert_eq!(entry.metadata.name, metadata.name);
    }

    /// Complexity: `O(N)`, where `N` is set size (`MaxSetSize`).
    /// Dominant path: verify card existence and rarity sum across all entries, then hash and write set.
    #[benchmark]
    fn create_card_set() {
        let caller: T::AccountId = whitelisted_caller();
        let set_id = NextSetId::<T>::get();
        let cards = max_set_entries::<T>(1);
        let name = max_name::<T>();

        #[extrinsic_call]
        _(RawOrigin::Signed(caller), cards, name);

        assert!(CardSets::<T>::contains_key(set_id));
    }

    /// Complexity: `O(S)`, where `S` is bounded set name length (`MaxStringLen`).
    /// Dominant path: read existing set metadata and write updated entry.
    #[benchmark]
    fn set_set_metadata() {
        let caller: T::AccountId = whitelisted_caller();
        let set_id = create_max_card_set::<T>(&caller, 1);
        let name = max_name::<T>();

        #[extrinsic_call]
        _(RawOrigin::Signed(caller), set_id, name.clone());

        let metadata = CardSetMetadataStore::<T>::get(set_id).expect("set metadata should exist");
        assert_eq!(metadata.name, name);
    }

    /// Complexity: `O(1)`.
    /// Dominant path: validate schedule/prize config and write tournament config/state.
    #[benchmark]
    fn create_tournament() {
        let tournament_id = NextTournamentId::<T>::get();
        let start_block: BlockNumberFor<T> = 1u32.saturated_into();
        let end_block: BlockNumberFor<T> = 1_000u32.saturated_into();
        frame_system::Pallet::<T>::set_block_number(start_block);

        #[extrinsic_call]
        _(
            RawOrigin::Root,
            0u32,
            benchmark_entry_fee::<T>(),
            start_block,
            end_block,
            default_prize_config(),
        );

        assert!(Tournaments::<T>::contains_key(tournament_id));
    }

    /// Complexity: `O(1)`.
    /// Dominant path: transfer entry fee, update tournament state counters, store active session.
    #[benchmark]
    fn join_tournament() {
        let caller: T::AccountId = whitelisted_caller();
        let entry_fee = benchmark_entry_fee::<T>();
        let tournament_id = create_active_tournament::<T>(0u32, entry_fee);
        fund_account::<T>(&caller, benchmark_balance::<T>());

        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), tournament_id);

        assert!(ActiveTournamentGame::<T>::contains_key(caller));
    }

    /// Complexity: `O(A + B + E)`, where:
    /// - `A` is turn action count (`MaxHandActions`)
    /// - `B` is board scan/build work (`MaxBoardSize`)
    /// - `E` is combat event processing cost
    /// Dominant path: verify/apply actions, resolve battle, update tournament stats/session.
    #[benchmark]
    fn submit_tournament_turn() {
        let caller: T::AccountId = whitelisted_caller();
        let entry_fee = benchmark_entry_fee::<T>();
        let tournament_id = create_active_tournament::<T>(0u32, entry_fee);
        fund_account::<T>(&caller, benchmark_balance::<T>());
        Pallet::<T>::join_tournament(RawOrigin::Signed(caller.clone()).into(), tournament_id)
            .expect("setup join_tournament should succeed");
        fill_tournament_board::<T>(&caller);
        let action = max_actions::<T>();

        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), action);

        if let Some(session) = ActiveTournamentGame::<T>::get(&caller) {
            assert!(session.state.round >= 2);
        }
    }

    /// Complexity: `O(1)`.
    /// Dominant path: check and delete one active regular session.
    #[benchmark]
    fn abandon_game() {
        let caller: T::AccountId = whitelisted_caller();
        Pallet::<T>::start_game(RawOrigin::Signed(caller.clone()).into(), 0u32)
            .expect("setup start_game should succeed");

        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()));

        assert!(!ActiveGame::<T>::contains_key(caller));
    }

    /// Complexity: `O(1)`.
    /// Dominant path: read active tournament session, bump stats, remove active session.
    #[benchmark]
    fn abandon_tournament() {
        let caller: T::AccountId = whitelisted_caller();
        let entry_fee = benchmark_entry_fee::<T>();
        let tournament_id = create_active_tournament::<T>(0u32, entry_fee);
        fund_account::<T>(&caller, benchmark_balance::<T>());
        Pallet::<T>::join_tournament(RawOrigin::Signed(caller.clone()).into(), tournament_id)
            .expect("setup join_tournament should succeed");

        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()));

        assert!(!ActiveTournamentGame::<T>::contains_key(caller));
    }

    /// Complexity: `O(N)`, where `N` is set size (`MaxSetSize`).
    /// Dominant path: iterate full card set to compute card-creator share and execute payout transfer.
    #[benchmark]
    fn claim_prize() {
        let caller: T::AccountId = whitelisted_caller();
        let participant: T::AccountId = account("participant", 0, 0);
        let entry_fee = benchmark_entry_fee::<T>();
        let card_id = create_custom_card::<T>(&caller);
        let set_id = create_max_card_set::<T>(&caller, card_id);
        let tournament_id = create_active_tournament::<T>(set_id, entry_fee);

        fund_account::<T>(&participant, benchmark_balance::<T>());
        Pallet::<T>::join_tournament(RawOrigin::Signed(participant.clone()).into(), tournament_id)
            .expect("setup participant join_tournament should succeed");

        TournamentPlayerStats::<T>::mutate(tournament_id, &caller, |stats| {
            stats.perfect_runs = 1;
            stats.total_wins = 10;
            stats.total_games = 1;
        });
        TournamentStates::<T>::mutate(tournament_id, |state| {
            state.total_perfect_runs = 1;
        });

        let ended_block: BlockNumberFor<T> = 1_001u32.saturated_into();
        frame_system::Pallet::<T>::set_block_number(ended_block);

        #[extrinsic_call]
        _(RawOrigin::Signed(caller.clone()), tournament_id);

        assert!(TournamentClaimed::<T>::get(tournament_id, caller));
    }

    impl_benchmark_test_suite!(Pallet, crate::mock::new_test_ext(), crate::mock::Test);
}
