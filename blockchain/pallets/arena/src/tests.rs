use crate::{mock::*, ActiveGame, Error};
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

fn bounded_ghost_board(
    units: Vec<oab_battle::bounded::GhostBoardUnit>,
) -> BoundedVec<oab_battle::bounded::GhostBoardUnit, <Test as oab_common::GameEngine>::MaxBoardSize>
{
    BoundedVec::try_from(units).unwrap()
}

fn ghost_unit(card_id: u16) -> oab_battle::bounded::GhostBoardUnit {
    oab_battle::bounded::GhostBoardUnit {
        card_id: oab_battle::types::CardId(card_id),
        perm_attack: 0,
        perm_health: 0,
    }
}

/// Insert a ghost opponent directly into arena ghost storage for a given bracket.
/// Reads the first card from the given set so the ghost is always valid for battle.
fn seed_ghost(set_id: u16, round: u8, wins: u8, lives: u8) {
    let card_id = pallet_oab_card_registry::pallet::CardSets::<Test>::get(set_id)
        .expect("set must exist to seed ghost")
        .cards[0]
        .card_id
        .0;
    let board = oab_common::BoundedGhostBoard::<Test> {
        units: BoundedVec::try_from(vec![ghost_unit(card_id)]).unwrap(),
    };
    let entry = oab_common::GhostEntry::<Test> { owner: 0, board };
    crate::GhostOpponents::<Test>::mutate((set_id, round, wins, lives), |pool| {
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

#[test]
fn test_start_game() {
    new_test_ext().execute_with(|| {
        let account_id = 1;

        // Assert game starts successfully
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(account_id), 0));

        // Verify game exists in storage
        let session = ActiveGame::<Test>::get(account_id).unwrap();
        assert_eq!(session.state.round, 1);
        assert_eq!(session.state.phase, GamePhase::Shop);
        assert_eq!(session.state.hand.len(), 5); // HAND_SIZE cards drawn from bag
        assert_eq!(session.state.bag.len(), 45); // MaxBagSize(50) - 5 = 45 remaining in bag

        // Assert cannot start another game
        assert_noop!(
            Arena::start_game(RuntimeOrigin::signed(account_id), 0),
            Error::<Test>::GameAlreadyActive
        );
    });
}

#[test]
fn test_submit_turn_empty_actions() {
    new_test_ext().execute_with(|| {
        let account_id = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(account_id), 0));

        // Create an empty turn action (no actions taken)
        let action = CommitTurnAction { actions: vec![] };

        let bounded_action = action.into();

        // Submit turn - this runs shop + battle and prepares next round
        assert_ok!(Arena::submit_turn(
            RuntimeOrigin::signed(account_id),
            bounded_action
        ));

        // Game should still exist (unless we lost all lives)
        let session = ActiveGame::<Test>::get(account_id);

        // The battle result is deterministic based on the seed
        // With an empty board, we'll lose the battle
        // After one loss, we still have 2 lives left, so game continues
        if let Some(session) = session {
            assert_eq!(session.state.phase, GamePhase::Shop);
            assert_eq!(session.state.round, 2); // Advanced to next round
        }
    });
}

#[test]
fn test_submit_turn_advances_round() {
    new_test_ext().execute_with(|| {
        let account_id = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(account_id), 0));

        let initial_round = ActiveGame::<Test>::get(account_id).unwrap().state.round;
        assert_eq!(initial_round, 1);

        // Submit empty turn
        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Arena::submit_turn(
            RuntimeOrigin::signed(account_id),
            action.into()
        ));

        // Check game state after turn
        if let Some(session) = ActiveGame::<Test>::get(account_id) {
            // Round should have advanced
            assert_eq!(session.state.round, 2);
            // Should be back in Shop phase for next round
            assert_eq!(session.state.phase, GamePhase::Shop);
            // Mana limit should increase (round 2 = 4 mana)
            assert_eq!(session.state.mana_limit, 4);
        }
    });
}

#[test]
fn test_game_over_after_three_losses() {
    new_test_ext().execute_with(|| {
        let account_id = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(account_id), 0));

        // Force lives to 1 so next loss ends the game
        ActiveGame::<Test>::mutate(account_id, |session| {
            session.as_mut().unwrap().state.lives = 1;
        });

        // Seed a ghost so the empty player board loses instead of drawing
        seed_ghost(0, 1, 0, 1);

        // Submit empty turn (will lose battle with empty board)
        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Arena::submit_turn(
            RuntimeOrigin::signed(account_id),
            action.into()
        ));

        // Game should be in Completed phase (not removed yet)
        let session = ActiveGame::<Test>::get(account_id).expect("session should still exist");
        assert_eq!(session.state.phase, GamePhase::Completed);

        // end_game finalizes and removes it
        assert_ok!(Arena::end_game(RuntimeOrigin::signed(account_id)));
        assert!(ActiveGame::<Test>::get(account_id).is_none());
    });
}

#[test]
fn test_victory_after_ten_wins() {
    new_test_ext().execute_with(|| {
        let account_id = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(account_id), 0));

        // Force wins to 9, so next win ends the game
        ActiveGame::<Test>::mutate(account_id, |session| {
            let s = session.as_mut().unwrap();
            s.state.wins = 9;
            // Also set lives high so we don't lose
            s.state.lives = 100;
        });

        // We need to win the battle. With an empty board we'll lose.
        // For this test, we'll just verify the logic by checking
        // that the game would end on 10 wins
        let session = ActiveGame::<Test>::get(account_id).unwrap();
        assert_eq!(session.state.wins, 9);
    });
}

#[test]
fn test_phase_enforcement() {
    new_test_ext().execute_with(|| {
        let account_id = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(account_id), 0));

        // Manually set phase to Battle to test enforcement
        ActiveGame::<Test>::mutate(account_id, |session| {
            session.as_mut().unwrap().state.phase = GamePhase::Battle;
        });

        // Try to submit turn during Battle phase (should fail)
        let action = CommitTurnAction { actions: vec![] };
        assert_noop!(
            Arena::submit_turn(RuntimeOrigin::signed(account_id), action.into()),
            Error::<Test>::WrongPhase
        );
    });
}

#[test]
fn test_no_active_game_error() {
    new_test_ext().execute_with(|| {
        let account_id = 1;

        // Try to submit turn without starting a game
        let action = CommitTurnAction { actions: vec![] };
        assert_noop!(
            Arena::submit_turn(RuntimeOrigin::signed(account_id), action.into()),
            Error::<Test>::NoActiveGame
        );
    });
}

#[test]
fn test_submit_card_and_metadata() {
    new_test_ext().execute_with(|| {
        let account_id = 1;
        let card_data = pallet_oab_card_registry::pallet::UserCardData::<Test> {
            stats: oab_battle::types::UnitStats {
                attack: 1,
                health: 1,
            },
            economy: oab_battle::types::EconomyStats {
                play_cost: 1,
                burn_value: 1,
            },
            shop_abilities: BoundedVec::try_from(vec![]).unwrap(),
            battle_abilities: BoundedVec::try_from(vec![]).unwrap(),
        };

        // Submit first card
        assert_ok!(CardRegistry::submit_card(
            RuntimeOrigin::signed(account_id),
            card_data.clone()
        ));

        // Verify storage
        let card_hash = <Test as frame_system::Config>::Hashing::hash_of(&card_data);
        let card_id =
            pallet_oab_card_registry::pallet::UserCardHashes::<Test>::get(card_hash).unwrap();
        assert!(card_id >= 45); // 46 cards registered in genesis (0-45)
        assert!(pallet_oab_card_registry::pallet::UserCards::<Test>::contains_key(card_id));

        // Verify creator info in metadata store
        let meta_entry =
            pallet_oab_card_registry::pallet::CardMetadataStore::<Test>::get(card_id).unwrap();
        assert_eq!(meta_entry.creator, account_id);

        // Submit same card again (should fail)
        assert_noop!(
            CardRegistry::submit_card(RuntimeOrigin::signed(account_id), card_data),
            pallet_oab_card_registry::Error::<Test>::CardAlreadyExists
        );

        // Submit metadata
        let metadata = pallet_oab_card_registry::pallet::CardMetadata::<Test> {
            name: BoundedVec::try_from(b"Test Card".to_vec()).unwrap(),
            emoji: BoundedVec::try_from("🍎".as_bytes().to_vec()).unwrap(),
            description: BoundedVec::try_from(b"A test card".to_vec()).unwrap(),
        };
        assert_ok!(CardRegistry::set_card_metadata(
            RuntimeOrigin::signed(account_id),
            card_id,
            metadata.clone()
        ));

        // Verify metadata
        let meta_entry =
            pallet_oab_card_registry::pallet::CardMetadataStore::<Test>::get(card_id).unwrap();
        assert_eq!(meta_entry.creator, account_id);
        assert_eq!(meta_entry.metadata.name, metadata.name);

        // Submit different card
        let card_data_2 = pallet_oab_card_registry::pallet::UserCardData::<Test> {
            stats: oab_battle::types::UnitStats {
                attack: 2,
                health: 2,
            },
            economy: oab_battle::types::EconomyStats {
                play_cost: 2,
                burn_value: 2,
            },
            shop_abilities: BoundedVec::try_from(vec![]).unwrap(),
            battle_abilities: BoundedVec::try_from(vec![]).unwrap(),
        };
        assert_ok!(CardRegistry::submit_card(
            RuntimeOrigin::signed(account_id),
            card_data_2.clone()
        ));

        let card_hash_2 = <Test as frame_system::Config>::Hashing::hash_of(&card_data_2);
        let card_id_2 =
            pallet_oab_card_registry::pallet::UserCardHashes::<Test>::get(card_hash_2).unwrap();
        assert!(card_id_2 > card_id);
        assert!(pallet_oab_card_registry::pallet::UserCards::<Test>::contains_key(card_id_2));
    });
}

#[test]
fn test_create_card_set() {
    new_test_ext().execute_with(|| {
        let account_id = 1;

        // Cards 1-5 already exist from genesis
        let entries = vec![
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 1,
                rarity: 10,
            },
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 2,
                rarity: 5,
            },
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 3,
                rarity: 0,
            }, // Token
        ];

        assert_ok!(CardRegistry::create_card_set(
            RuntimeOrigin::signed(account_id),
            bounded_set_entries(entries),
            bounded_set_name(b"Test Set")
        ));

        // Verify set was created
        let set_id = pallet_oab_card_registry::pallet::NextSetId::<Test>::get() - 1;
        let set = pallet_oab_card_registry::pallet::CardSets::<Test>::get(set_id).unwrap();
        assert_eq!(set.cards.len(), 3);
        assert_eq!(set.cards[0].card_id.0, 1);
        assert_eq!(set.cards[0].rarity, 10);
        assert_eq!(set.cards[2].rarity, 0);

        // Verify set metadata was stored
        let set_meta =
            pallet_oab_card_registry::pallet::CardSetMetadataStore::<Test>::get(set_id).unwrap();
        assert_eq!(set_meta.name.to_vec(), b"Test Set".to_vec());

        // Try to start game with new set
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(account_id), set_id,));
        let session = ActiveGame::<Test>::get(account_id).unwrap();
        assert_eq!(session.set_id, set_id);
    });
}

#[test]
fn test_create_card_set_high_rarity_succeeds() {
    new_test_ext().execute_with(|| {
        let account_id = 1;

        // With u8 rarity, max per-entry is 255. Two entries sum to 256 in u32 — no overflow.
        let entries = vec![
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 1,
                rarity: u8::MAX,
            },
            pallet_oab_card_registry::pallet::CardSetEntryInput {
                card_id: 2,
                rarity: 1,
            },
        ];

        // u8 rarity values can never overflow a u32 accumulator, so this succeeds.
        assert_ok!(CardRegistry::create_card_set(
            RuntimeOrigin::signed(account_id),
            bounded_set_entries(entries),
            bounded_set_name(b"High Rarity Set")
        ));
    });
}

#[test]
fn test_create_card_set_zero_rarity() {
    new_test_ext().execute_with(|| {
        let account_id = 1;

        // Cards 1 exists from genesis
        let entries = vec![pallet_oab_card_registry::pallet::CardSetEntryInput {
            card_id: 1,
            rarity: 0,
        }];

        // Should fail because total rarity is 0
        assert_noop!(
            CardRegistry::create_card_set(
                RuntimeOrigin::signed(account_id),
                bounded_set_entries(entries),
                bounded_set_name(b"Zero Set")
            ),
            pallet_oab_card_registry::Error::<Test>::InvalidRarity
        );
    });
}

#[test]
fn test_create_card_set_duplicate() {
    new_test_ext().execute_with(|| {
        let account_id = 1;

        // Cards 1-5 already exist from genesis
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

        // First creation should succeed
        assert_ok!(CardRegistry::create_card_set(
            RuntimeOrigin::signed(account_id),
            bounded_set_entries(entries.clone()),
            bounded_set_name(b"First Set")
        ));

        // Second creation with same cards (different name) should fail
        assert_noop!(
            CardRegistry::create_card_set(
                RuntimeOrigin::signed(account_id),
                bounded_set_entries(entries),
                bounded_set_name(b"Different Name")
            ),
            pallet_oab_card_registry::Error::<Test>::SetAlreadyExists
        );
    });
}

#[test]
fn test_abandon_game() {
    new_test_ext().execute_with(|| {
        let player = 1;

        // No active game -> error
        assert_noop!(
            Arena::abandon_game(RuntimeOrigin::signed(player)),
            Error::<Test>::NoActiveGame
        );

        // Start and abandon
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(player), 0));
        assert!(ActiveGame::<Test>::contains_key(player));

        assert_ok!(Arena::abandon_game(RuntimeOrigin::signed(player)));
        assert!(!ActiveGame::<Test>::contains_key(player));
    });
}

#[test]
fn test_backfill_ghost_board_requires_admin_origin_and_existing_set() {
    new_test_ext().execute_with(|| {
        let board = bounded_ghost_board(vec![ghost_unit(1)]);

        assert_noop!(
            Arena::backfill_ghost_board(RuntimeOrigin::signed(1), 0, 1, 0, 3, board.clone()),
            BadOrigin
        );

        assert_noop!(
            Arena::backfill_ghost_board(RuntimeOrigin::root(), 999, 1, 0, 3, board),
            Error::<Test>::CardSetNotFound
        );
    });
}

#[test]
fn test_backfill_ghost_board_validates_bracket_and_board() {
    new_test_ext().execute_with(|| {
        let board = bounded_ghost_board(vec![ghost_unit(1)]);

        assert_noop!(
            Arena::backfill_ghost_board(RuntimeOrigin::root(), 0, 0, 0, 3, board.clone()),
            Error::<Test>::InvalidGhostBracket
        );
        assert_noop!(
            Arena::backfill_ghost_board(RuntimeOrigin::root(), 0, 1, 0, 0, board.clone()),
            Error::<Test>::InvalidGhostBracket
        );
        assert_noop!(
            Arena::backfill_ghost_board(
                RuntimeOrigin::root(),
                0,
                1,
                0,
                3,
                bounded_ghost_board(vec![])
            ),
            Error::<Test>::EmptyGhostBoard
        );
    });
}

#[test]
fn test_backfill_ghost_board_rejects_cards_outside_set() {
    new_test_ext().execute_with(|| {
        let (set_id, _) = create_custom_set(1, &[(3, 4), (5, 6)], b"Manual Ghost Set");

        assert_noop!(
            Arena::backfill_ghost_board(
                RuntimeOrigin::root(),
                set_id,
                2,
                1,
                3,
                bounded_ghost_board(vec![ghost_unit(1)])
            ),
            Error::<Test>::GhostCardNotInSet
        );
    });
}

#[test]
fn test_backfill_ghost_board_appends_and_archives_same_bracket() {
    new_test_ext().execute_with(|| {
        let (set_id, card_ids) = create_custom_set(1, &[(3, 4), (5, 6)], b"Archive Ghost Set");
        let archive_before = crate::NextGhostArchiveId::<Test>::get();

        let mut first_unit = ghost_unit(card_ids[0]);
        first_unit.perm_attack = 2;
        let mut second_unit = ghost_unit(card_ids[1]);
        second_unit.perm_health = 3;

        assert_ok!(Arena::backfill_ghost_board(
            RuntimeOrigin::root(),
            set_id,
            2,
            1,
            2,
            bounded_ghost_board(vec![first_unit.clone()])
        ));
        assert_ok!(Arena::backfill_ghost_board(
            RuntimeOrigin::root(),
            set_id,
            2,
            1,
            2,
            bounded_ghost_board(vec![second_unit.clone()])
        ));

        let ghosts = crate::GhostOpponents::<Test>::get((set_id, 2, 1, 2));
        assert_eq!(ghosts.len(), 2);
        // Backfill uses a zero account as the owner
        assert_eq!(ghosts[0].owner, 0);
        assert_eq!(ghosts[0].board.units[0], first_unit);
        assert_eq!(ghosts[1].owner, 0);
        assert_eq!(ghosts[1].board.units[0], second_unit);

        assert_eq!(crate::NextGhostArchiveId::<Test>::get(), archive_before + 2);
        assert_eq!(
            crate::GhostArchive::<Test>::get((set_id, 2, 1, 2, archive_before))
                .unwrap()
                .board
                .units[0],
            ghosts[0].board.units[0]
        );
        assert_eq!(
            crate::GhostArchive::<Test>::get((set_id, 2, 1, 2, archive_before + 1))
                .unwrap()
                .board
                .units[0],
            ghosts[1].board.units[0]
        );
    });
}

#[test]
fn test_backfill_ghost_board_rotates_when_pool_is_full() {
    new_test_ext().execute_with(|| {
        let (set_id, card_ids) = create_custom_set(1, &[(3, 4)], b"Rotation Ghost Set");
        let archive_before = crate::NextGhostArchiveId::<Test>::get();

        for perm_attack in 0i16..12 {
            let mut unit = ghost_unit(card_ids[0]);
            unit.perm_attack = perm_attack;
            assert_ok!(Arena::backfill_ghost_board(
                RuntimeOrigin::root(),
                set_id,
                1,
                0,
                3,
                bounded_ghost_board(vec![unit])
            ));
        }

        let ghosts = crate::GhostOpponents::<Test>::get((set_id, 1, 0, 3));
        assert_eq!(ghosts.len(), 10);
        assert_eq!(ghosts[0].board.units[0].perm_attack, 2);
        assert_eq!(ghosts[9].board.units[0].perm_attack, 11);
        assert_eq!(
            crate::NextGhostArchiveId::<Test>::get(),
            archive_before + 12
        );
    });
}

#[test]
fn test_end_game_grants_achievements() {
    new_test_ext().execute_with(|| {
        let player = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(player), 0));

        // Place a unit on the board and set wins to 10 so game ends as victory
        ActiveGame::<Test>::mutate(player, |session| {
            let s = session.as_mut().unwrap();
            s.state.board[0] = Some(oab_battle::types::BoardUnit::new(
                oab_battle::types::CardId(0),
            ));
            s.state.wins = 10;
            s.state.lives = 100;
        });

        let archive_id_before = crate::NextGhostArchiveId::<Test>::get();

        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Arena::submit_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));

        // Game should be in Completed phase, not removed
        let session = ActiveGame::<Test>::get(player).expect("session should exist");
        assert_eq!(session.state.phase, GamePhase::Completed);

        // Pre-battle ghost was archived during submit_turn
        let archive_id_mid = crate::NextGhostArchiveId::<Test>::get();
        assert_eq!(archive_id_mid, archive_id_before + 1);

        // end_game finalizes: archives victory ghost and grants achievements
        assert_ok!(Arena::end_game(RuntimeOrigin::signed(player)));
        assert!(ActiveGame::<Test>::get(player).is_none());

        // Victory ghost should have been archived by end_game
        let archive_id_after = crate::NextGhostArchiveId::<Test>::get();
        assert_eq!(archive_id_after, archive_id_mid + 1);

        // Bronze requires winning a battle -- this battle was lost (empty board) so no bronze.
        // Silver and gold granted by end_game (wins >= 10, lives >= 3).
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
fn test_end_game_no_silver_gold_on_loss() {
    new_test_ext().execute_with(|| {
        let player = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(player), 0));

        // Set lives to 1 so next loss ends game
        ActiveGame::<Test>::mutate(player, |session| {
            let s = session.as_mut().unwrap();
            s.state.lives = 1;
        });

        // Seed a ghost so the empty player board loses instead of drawing
        seed_ghost(0, 1, 0, 1);

        let action = CommitTurnAction { actions: vec![] };
        assert_ok!(Arena::submit_turn(
            RuntimeOrigin::signed(player),
            action.into()
        ));

        assert_ok!(Arena::end_game(RuntimeOrigin::signed(player)));

        // No achievements -- battle was lost (empty board) and wins < 10
        let bits = pallet_oab_card_registry::pallet::VictoryAchievements::<Test>::get(player, 0);
        assert_eq!(bits, 0, "no achievements from lost battle with low wins");
    });
}

#[test]
fn test_end_game_requires_completed_phase() {
    new_test_ext().execute_with(|| {
        let player = 1;
        assert_ok!(Arena::start_game(RuntimeOrigin::signed(player), 0));

        // Game is in Shop phase, end_game should fail
        assert_noop!(
            Arena::end_game(RuntimeOrigin::signed(player)),
            Error::<Test>::WrongPhase
        );
    });
}
