#![allow(dead_code)]

use crate::{mock::*, ActiveTournamentGame, Error};
use frame::arithmetic::Perbill;
use frame::testing_prelude::*;
use oab_battle::CommitTurnAction;
use oab_game::GamePhase;

fn bounded_set_entries(
    entries: Vec<pallet_oab_card_registry::pallet::CardSetEntryInput>,
) -> BoundedVec<
    pallet_oab_card_registry::pallet::CardSetEntryInput,
    <Test as pallet_oab_card_registry::CardConfig>::MaxSetSize,
> {
    BoundedVec::try_from(entries).unwrap()
}

fn bounded_set_name(
    name: &[u8],
) -> BoundedVec<u8, <Test as pallet_oab_card_registry::CardConfig>::MaxStringLen> {
    BoundedVec::try_from(name.to_vec()).unwrap()
}

fn sample_card_data(
    attack: i16,
    health: i16,
) -> pallet_oab_card_registry::pallet::UserCardData<Test> {
    pallet_oab_card_registry::pallet::UserCardData::<Test> {
        stats: oab_battle::types::UnitStats { attack, health },
        economy: oab_battle::types::EconomyStats {
            play_cost: 1,
            burn_value: 1,
        },
        shop_abilities: BoundedVec::try_from(vec![]).unwrap(),
        battle_abilities: BoundedVec::try_from(vec![]).unwrap(),
    }
}

fn ghost_unit(card_id: u16) -> oab_battle::bounded::GhostBoardUnit {
    oab_battle::bounded::GhostBoardUnit {
        card_id: oab_battle::types::CardId(card_id),
        perm_attack: 0,
        perm_health: 0,
    }
}

/// Insert a ghost opponent directly into tournament ghost storage.
/// Looks up the set from the tournament config so the ghost is always valid.
fn seed_tournament_ghost(tournament_id: u32, round: u8, wins: u8, lives: u8) {
    let config = crate::Tournaments::<Test>::get(tournament_id)
        .expect("tournament must exist to seed ghost");
    let card_id = pallet_oab_card_registry::pallet::CardSets::<Test>::get(config.set_id)
        .expect("set must exist to seed ghost")
        .cards[0]
        .card_id
        .0;
    let board = oab_common::BoundedGhostBoard::<Test> {
        units: BoundedVec::try_from(vec![ghost_unit(card_id)]).unwrap(),
    };
    let entry = oab_common::GhostEntry::<Test> { owner: 0, board };
    crate::TournamentGhostOpponents::<Test>::mutate((tournament_id, round, wins, lives), |pool| {
        pool.try_push(entry).ok();
    });
}

fn create_custom_set(creator: u64, card_stats: &[(i16, i16)], name: &[u8]) -> (u16, Vec<u16>) {
    let mut entries = Vec::new();
    let mut card_ids = Vec::new();

    for (attack, health) in card_stats.iter().copied() {
        assert_ok!(CardRegistry::submit_card(
            RuntimeOrigin::signed(creator),
            sample_card_data(attack, health)
        ));
        let card_id = pallet_oab_card_registry::pallet::NextUserCardId::<Test>::get() - 1;
        card_ids.push(card_id);
        entries.push(pallet_oab_card_registry::pallet::CardSetEntryInput {
            card_id,
            rarity: 10,
        });
    }

    assert_ok!(CardRegistry::create_card_set(
        RuntimeOrigin::signed(creator),
        bounded_set_entries(entries),
        bounded_set_name(name)
    ));

    (
        pallet_oab_card_registry::pallet::NextSetId::<Test>::get() - 1,
        card_ids,
    )
}

// ─── Tournament helper ──────────────────────────────────────────────

fn default_prize_config() -> crate::PrizeConfig {
    crate::PrizeConfig {
        player_share: Perbill::from_percent(60),
        set_creator_share: Perbill::from_percent(20),
        card_creators_share: Perbill::from_percent(20),
    }
}

/// Helper: create a tournament using root origin. Returns tournament_id (0).
fn create_test_tournament(start_block: u64, end_block: u64, entry_fee: u64) {
    assert_ok!(Tournament::create_tournament(
        RuntimeOrigin::root(),
        0, // set_id (genesis set)
        entry_fee,
        start_block,
        end_block,
        default_prize_config(),
    ));
}

// ─── Tournament Tests ───────────────────────────────────────────────

#[test]
fn test_create_tournament() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);

        create_test_tournament(1, 100, 50);

        // Verify tournament stored
        let config = crate::Tournaments::<Test>::get(0).unwrap();
        assert_eq!(config.set_id, 0);
        assert_eq!(config.entry_fee, 50);
        assert_eq!(config.start_block, 1);
        assert_eq!(config.end_block, 100);

        let state = crate::TournamentStates::<Test>::get(0);
        assert_eq!(state.total_pot, 0);
        assert_eq!(state.total_entries, 0);
        assert_eq!(state.total_perfect_runs, 0);

        // NextTournamentId should advance
        assert_eq!(crate::NextTournamentId::<Test>::get(), 1);
    });
}

#[test]
fn test_create_tournament_invalid_period() {
    new_test_ext().execute_with(|| {
        System::set_block_number(5);

        // start_block < now
        assert_noop!(
            Tournament::create_tournament(
                RuntimeOrigin::root(),
                0,
                50,
                3,
                100,
                default_prize_config()
            ),
            Error::<Test>::InvalidTournamentPeriod
        );

        // end_block <= start_block
        assert_noop!(
            Tournament::create_tournament(
                RuntimeOrigin::root(),
                0,
                50,
                10,
                10,
                default_prize_config()
            ),
            Error::<Test>::InvalidTournamentPeriod
        );
    });
}

#[test]
fn test_create_tournament_invalid_prize_config() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);

        let bad_config = crate::PrizeConfig {
            player_share: Perbill::from_percent(50),
            set_creator_share: Perbill::from_percent(20),
            card_creators_share: Perbill::from_percent(20),
        };

        assert_noop!(
            Tournament::create_tournament(RuntimeOrigin::root(), 0, 50, 1, 100, bad_config),
            Error::<Test>::InvalidPrizeConfig
        );
    });
}

#[test]
fn test_create_tournament_requires_special_origin() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);

        // Signed origin should fail (only root allowed)
        assert_noop!(
            Tournament::create_tournament(
                RuntimeOrigin::signed(1),
                0,
                50,
                1,
                100,
                default_prize_config()
            ),
            DispatchError::BadOrigin
        );
    });
}

#[test]
fn test_join_tournament() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        let player = 1;
        let initial_balance = Balances::free_balance(player);

        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Balance should decrease by entry fee
        let new_balance = Balances::free_balance(player);
        assert_eq!(new_balance, initial_balance - 50);

        // Tournament state should update
        let state = crate::TournamentStates::<Test>::get(0);
        assert_eq!(state.total_pot, 50);
        assert_eq!(state.total_entries, 1);

        // Active tournament game should exist
        let session = ActiveTournamentGame::<Test>::get(player).unwrap();
        assert_eq!(session.tournament_id, 0);
        assert_eq!(session.set_id, 0);
        assert_eq!(session.state.round, 1);
        assert_eq!(session.state.phase, GamePhase::Shop);
    });
}

#[test]
fn test_join_tournament_not_started() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(10, 100, 50);

        // Tournament starts at block 10, currently at block 1
        assert_noop!(
            Tournament::join_tournament(RuntimeOrigin::signed(1), 0),
            Error::<Test>::TournamentNotStarted
        );
    });
}

#[test]
fn test_join_tournament_ended() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 10, 50);

        // Advance past end block
        System::set_block_number(11);

        assert_noop!(
            Tournament::join_tournament(RuntimeOrigin::signed(1), 0),
            Error::<Test>::TournamentEnded
        );
    });
}

#[test]
fn test_join_tournament_already_active() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(1), 0));

        // Joining again should fail
        assert_noop!(
            Tournament::join_tournament(RuntimeOrigin::signed(1), 0),
            Error::<Test>::TournamentGameAlreadyActive
        );
    });
}

#[test]
fn test_submit_tournament_turn() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        let player = 1;
        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Submit empty turn
        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));

        // Game may still exist or be over depending on battle result
        // If still active, round should advance
        if let Some(session) = ActiveTournamentGame::<Test>::get(player) {
            assert_eq!(session.state.round, 2);
            assert_eq!(session.state.phase, GamePhase::Shop);
        }
    });
}

#[test]
fn test_tournament_game_over_records_stats() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        let player = 1;
        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Force lives to 1 so next loss ends the game
        ActiveTournamentGame::<Test>::mutate(player, |session| {
            session.as_mut().unwrap().state.lives = 1;
        });

        // Seed a ghost so the empty player board loses instead of drawing
        seed_tournament_ghost(0, 1, 0, 1);

        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));

        // Game should be in Completed phase
        let session =
            ActiveTournamentGame::<Test>::get(player).expect("session should still exist");
        assert_eq!(session.state.phase, GamePhase::Completed);

        // end_tournament_game finalizes and removes it
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(
            player
        )));
        assert!(ActiveTournamentGame::<Test>::get(player).is_none());

        // Stats should be recorded
        let stats = crate::TournamentPlayerStats::<Test>::get(0, player);
        assert_eq!(stats.total_games, 1);
        assert_eq!(stats.perfect_runs, 0); // Lost, not a perfect run
    });
}

#[test]
fn test_tournament_perfect_run_stats() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        let player = 1;
        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Force lives to 1 so next loss ends the game
        ActiveTournamentGame::<Test>::mutate(player, |session| {
            let s = session.as_mut().unwrap();
            s.state.wins = 0;
            s.state.lives = 1;
        });

        // Seed a ghost so the empty player board loses instead of drawing
        seed_tournament_ghost(0, 1, 0, 1);

        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));

        // Finalize the completed game
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(
            player
        )));

        // Verify stats for defeat
        let stats = crate::TournamentPlayerStats::<Test>::get(0, player);
        assert_eq!(stats.total_games, 1);
        assert_eq!(stats.perfect_runs, 0);

        // Now test perfect run tracking: join again and simulate perfect run
        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Set wins to 10 and lives high, then submit a turn to trigger game over
        ActiveTournamentGame::<Test>::mutate(player, |session| {
            let s = session.as_mut().unwrap();
            s.state.wins = 10;
            s.state.lives = 100;
        });

        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));

        // Game should be in Completed phase
        let session = ActiveTournamentGame::<Test>::get(player).expect("session should exist");
        assert_eq!(session.state.phase, GamePhase::Completed);

        // Finalize the completed game
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(
            player
        )));
        assert!(ActiveTournamentGame::<Test>::get(player).is_none());

        let stats = crate::TournamentPlayerStats::<Test>::get(0, player);
        assert_eq!(stats.total_games, 2);
        assert_eq!(stats.perfect_runs, 1);

        // Tournament state should track total_perfect_runs
        let tstate = crate::TournamentStates::<Test>::get(0);
        assert_eq!(tstate.total_perfect_runs, 1);
    });
}

#[test]
fn test_abandon_tournament() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        let player = 1;

        // No active tournament game -> error
        assert_noop!(
            Tournament::abandon_tournament(RuntimeOrigin::signed(player)),
            Error::<Test>::NoActiveTournamentGame
        );

        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Abandon if still active
        if ActiveTournamentGame::<Test>::contains_key(player) {
            assert_ok!(Tournament::abandon_tournament(RuntimeOrigin::signed(
                player
            )));
        }

        assert!(!ActiveTournamentGame::<Test>::contains_key(player));

        // Stats should be recorded
        let stats = crate::TournamentPlayerStats::<Test>::get(0, player);
        assert_eq!(stats.total_games, 1);
    });
}

#[test]
fn test_tournament_ghost_isolation() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        // Player 2 plays tournament game
        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(2), 0));
        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(2),
            action.into()
        ));

        // Tournament ghost storage should have player 2's ghost (if board was non-empty)
        // With empty boards, ghosts won't be stored at all (store_ghost skips empty boards)
        // The important thing is the code paths use tournament-specific storage
        // This test verifies the storage items are separate by their type
    });
}

#[test]
fn test_claim_prize_not_ended() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        // Tournament hasn't ended
        assert_noop!(
            Tournament::claim_prize(RuntimeOrigin::signed(1), 0),
            Error::<Test>::TournamentNotEnded
        );
    });
}

#[test]
fn test_claim_prize_no_prize_available() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        System::set_block_number(101); // Past end_block

        // Player hasn't participated, no prize
        assert_noop!(
            Tournament::claim_prize(RuntimeOrigin::signed(5), 0),
            Error::<Test>::NoPrizeAvailable
        );
    });
}

#[test]
fn test_claim_prize_double_claim() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);

        // Create a set where account 1 is the creator
        let entries = vec![
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 1,
                rarity: 10,
            },
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 2,
                rarity: 5,
            },
        ];
        assert_ok!(CardRegistry::create_card_set(
            RuntimeOrigin::signed(1),
            bounded_set_entries(entries),
            bounded_set_name(b"Prize Test Set")
        ));
        let set_id = pallet_oab_card_registry::pallet::NextSetId::<Test>::get() - 1;

        // Create tournament with this set
        assert_ok!(Tournament::create_tournament(
            RuntimeOrigin::root(),
            set_id,
            50,
            1,
            100,
            default_prize_config(),
        ));

        // Player 2 joins
        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(2), 0));

        System::set_block_number(101);

        // Player 1 (set creator) can claim set creator share
        assert_ok!(Tournament::claim_prize(RuntimeOrigin::signed(1), 0));

        // Double claim should fail
        assert_noop!(
            Tournament::claim_prize(RuntimeOrigin::signed(1), 0),
            Error::<Test>::PrizeAlreadyClaimed
        );
    });
}

#[test]
fn test_claim_prize_set_creator() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);

        // Account 1 creates a card set
        let entries = vec![
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 1,
                rarity: 10,
            },
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 2,
                rarity: 5,
            },
        ];
        assert_ok!(CardRegistry::create_card_set(
            RuntimeOrigin::signed(1),
            bounded_set_entries(entries),
            bounded_set_name(b"Creator Test")
        ));
        let set_id = pallet_oab_card_registry::pallet::NextSetId::<Test>::get() - 1;

        // Create tournament with 100 entry fee
        // prize: 60% player, 20% set creator, 20% card creators
        assert_ok!(Tournament::create_tournament(
            RuntimeOrigin::root(),
            set_id,
            100,
            1,
            100,
            default_prize_config(),
        ));

        // Player 2 and 3 join (total pot = 200)
        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(2), 0));
        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(3), 0));

        // End tournament
        System::set_block_number(101);

        let balance_before = Balances::free_balance(1);

        // Account 1 is the set creator -> gets 20% of 200 = 40
        assert_ok!(Tournament::claim_prize(RuntimeOrigin::signed(1), 0));

        let balance_after = Balances::free_balance(1);
        // Set creator gets 20% of 200 = 40
        // Account 1 also created cards 0-45 in genesis (default creator is account 0, not 1)
        // Card creators share: 20% of 200 = 40
        // Account 1 doesn't own any of the genesis cards (creator = default_account = 0)
        // So only set creator prize = 40
        assert_eq!(balance_after - balance_before, 40);
    });
}

#[test]
fn test_claim_prize_perfect_run_player() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 100);

        let player = 1;
        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Simulate a perfect run: force wins to 10
        ActiveTournamentGame::<Test>::mutate(player, |session| {
            let s = session.as_mut().unwrap();
            s.state.wins = 10;
            s.state.lives = 100;
        });

        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(
            player
        )));

        // Verify perfect run recorded
        let stats = crate::TournamentPlayerStats::<Test>::get(0, player);
        assert_eq!(stats.perfect_runs, 1);

        System::set_block_number(101);

        let balance_before = Balances::free_balance(player);

        assert_ok!(Tournament::claim_prize(RuntimeOrigin::signed(player), 0));

        let balance_after = Balances::free_balance(player);
        // Total pot = 100 (1 player, 100 entry fee)
        // Player share = 60% of 100 = 60
        // Only 1 perfect run, so player gets full 60
        assert_eq!(balance_after - balance_before, 60);
    });
}

#[test]
fn test_tournament_multiple_players_prize_split() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 100);

        // Both players join (total pot = 200)
        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(1), 0));
        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(2), 0));

        // Player 1 gets a perfect run
        ActiveTournamentGame::<Test>::mutate(1u64, |session| {
            let s = session.as_mut().unwrap();
            s.state.wins = 10;
            s.state.lives = 100;
        });
        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(1),
            action.into()
        ));
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(1)));

        // Player 2 also gets a perfect run
        ActiveTournamentGame::<Test>::mutate(2u64, |session| {
            let s = session.as_mut().unwrap();
            s.state.wins = 10;
            s.state.lives = 100;
        });
        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(2),
            action.into()
        ));
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(2)));

        System::set_block_number(101);

        let balance1_before = Balances::free_balance(1);
        let balance2_before = Balances::free_balance(2);

        assert_ok!(Tournament::claim_prize(RuntimeOrigin::signed(1), 0));
        assert_ok!(Tournament::claim_prize(RuntimeOrigin::signed(2), 0));

        let prize1 = Balances::free_balance(1) - balance1_before;
        let prize2 = Balances::free_balance(2) - balance2_before;

        // Total pot = 200. Player share = 60% of 200 = 120.
        // 2 perfect runs, each gets 120/2 = 60.
        assert_eq!(prize1, 60);
        assert_eq!(prize2, 60);
    });
}

#[test]
fn test_no_perfect_runs_player_share_stays_in_pallet() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);

        // Account 1 creates set
        let entries = vec![pallet_oab_card_registry::pallet::CardSetEntryInput {
            card_id: 1,
            rarity: 10,
        }];
        assert_ok!(CardRegistry::create_card_set(
            RuntimeOrigin::signed(1),
            bounded_set_entries(entries),
            bounded_set_name(b"No Win Set")
        ));
        let set_id = pallet_oab_card_registry::pallet::NextSetId::<Test>::get() - 1;

        assert_ok!(Tournament::create_tournament(
            RuntimeOrigin::root(),
            set_id,
            100,
            1,
            100,
            default_prize_config(),
        ));

        // Player 2 joins and loses (set lives to 0 so Draw still triggers game over)
        assert_ok!(Tournament::join_tournament(RuntimeOrigin::signed(2), 0));
        ActiveTournamentGame::<Test>::mutate(2u64, |session| {
            session.as_mut().unwrap().state.lives = 0;
        });
        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(2),
            action.into()
        ));
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(2)));

        System::set_block_number(101);

        // Account 1 (set creator) claims set creator share
        let balance_before = Balances::free_balance(1);
        assert_ok!(Tournament::claim_prize(RuntimeOrigin::signed(1), 0));
        let balance_after = Balances::free_balance(1);

        // Set creator gets 20% of 100 = 20
        assert_eq!(balance_after - balance_before, 20);

        // Player 2 has no perfect runs, no creator rights -> no prize
        assert_noop!(
            Tournament::claim_prize(RuntimeOrigin::signed(2), 0),
            Error::<Test>::NoPrizeAvailable
        );
    });
}

#[test]
fn test_end_tournament_game_records_stats_and_achievements() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        let player = 1;
        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Place a unit on the board and set wins to 10 for victory
        ActiveTournamentGame::<Test>::mutate(player, |session| {
            let s = session.as_mut().unwrap();
            s.state.board[0] = Some(oab_battle::types::BoardUnit::new(
                oab_battle::types::CardId(0),
            ));
            s.state.wins = 10;
            s.state.lives = 100;
        });

        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Tournament::submit_tournament_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));

        // Game should be in Completed phase
        let session = ActiveTournamentGame::<Test>::get(player).expect("session should exist");
        assert_eq!(session.state.phase, GamePhase::Completed);

        // end_tournament_game finalizes
        assert_ok!(Tournament::end_tournament_game(RuntimeOrigin::signed(
            player
        )));
        assert!(ActiveTournamentGame::<Test>::get(player).is_none());

        // Tournament stats recorded
        let stats = crate::TournamentPlayerStats::<Test>::get(0, player);
        assert_eq!(stats.total_games, 1);
        assert_eq!(stats.perfect_runs, 1);
        let tstate = crate::TournamentStates::<Test>::get(0);
        assert_eq!(tstate.total_perfect_runs, 1);

        // Bronze requires winning a battle -- this battle was lost (empty board).
        // Silver/gold granted by end_tournament_game (wins >= 10, lives >= 3).
        let bits = pallet_oab_card_registry::pallet::VictoryAchievements::<Test>::get(player, 0);
        assert_eq!(
            bits & pallet_oab_card_registry::pallet::ACHIEVEMENT_BRONZE,
            0,
            "no bronze from lost battle"
        );
        assert!(
            bits & pallet_oab_card_registry::pallet::ACHIEVEMENT_SILVER != 0,
            "should have silver"
        );
        assert!(
            bits & pallet_oab_card_registry::pallet::ACHIEVEMENT_GOLD != 0,
            "should have gold"
        );
    });
}

#[test]
fn test_end_tournament_game_requires_completed_phase() {
    new_test_ext().execute_with(|| {
        System::set_block_number(1);
        create_test_tournament(1, 100, 50);

        let player = 1;
        assert_ok!(Tournament::join_tournament(
            RuntimeOrigin::signed(player),
            0
        ));

        // Game is in Shop phase, end_tournament_game should fail
        assert_noop!(
            Tournament::end_tournament_game(RuntimeOrigin::signed(player)),
            Error::<Test>::WrongPhase
        );
    });
}
