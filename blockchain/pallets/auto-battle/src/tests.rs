use crate::{mock::*, Error, ActiveGame};
use frame::testing_prelude::*;
use manalimit_core::{BattleResult, GamePhase};

#[test]
fn test_start_game() {
	new_test_ext().execute_with(|| {
		let account_id = 1;
		
		// Assert game starts successfully
		assert_ok!(AutoBattle::start_game(RuntimeOrigin::signed(account_id)));
		
		// Verify game exists in storage
		let session = ActiveGame::<Test>::get(account_id).unwrap();
		assert_eq!(session.owner, account_id);
		assert_eq!(session.state.round, 1);
		assert_eq!(session.state.phase, GamePhase::Shop);
		assert_eq!(session.state.bag.len(), 10); // 10 Rats from mock genesis
		
		// Assert cannot start another game
		assert_noop!(
			AutoBattle::start_game(RuntimeOrigin::signed(account_id)),
			Error::<Test>::GameAlreadyActive
		);
	});
}

#[test]
fn test_submit_shop_phase_empty() {
	new_test_ext().execute_with(|| {
		let account_id = 1;
		assert_ok!(AutoBattle::start_game(RuntimeOrigin::signed(account_id)));
		
		// Create an empty turn action
		let action = manalimit_core::CommitTurnAction {
			new_board: vec![None, None, None, None, None],
			pitched_from_hand: vec![],
			played_from_hand: vec![],
			pitched_from_board: vec![],
		};
		
		let bounded_action = action.into();
		
		assert_ok!(AutoBattle::submit_shop_phase(RuntimeOrigin::signed(account_id), bounded_action));
		
		let session = ActiveGame::<Test>::get(account_id).unwrap();
		assert_eq!(session.state.phase, GamePhase::Battle);
	});
}

#[test]
fn test_report_battle_outcome_victory() {
	new_test_ext().execute_with(|| {
		let account_id = 1;
		assert_ok!(AutoBattle::start_game(RuntimeOrigin::signed(account_id)));
		
		// Must submit shop phase first to get into Battle phase
		let action = manalimit_core::CommitTurnAction {
			new_board: vec![None, None, None, None, None],
			pitched_from_hand: vec![],
			played_from_hand: vec![],
			pitched_from_board: vec![],
		};
		assert_ok!(AutoBattle::submit_shop_phase(RuntimeOrigin::signed(account_id), action.into()));
		
		// Report victory
		assert_ok!(AutoBattle::report_battle_outcome(RuntimeOrigin::signed(account_id), BattleResult::Victory));
		
		let session = ActiveGame::<Test>::get(account_id).unwrap();
		assert_eq!(session.state.wins, 1);
		assert_eq!(session.state.round, 2);
		assert_eq!(session.state.phase, GamePhase::Shop);
	});
}

#[test]
fn test_report_battle_outcome_defeat() {
	new_test_ext().execute_with(|| {
		let account_id = 1;
		assert_ok!(AutoBattle::start_game(RuntimeOrigin::signed(account_id)));
		
		// Initial lives is 3 (from core)
		let initial_lives = ActiveGame::<Test>::get(account_id).unwrap().state.lives;
		assert_eq!(initial_lives, 3);

		// Must submit shop phase first
		let action = manalimit_core::CommitTurnAction {
			new_board: vec![None, None, None, None, None],
			pitched_from_hand: vec![],
			played_from_hand: vec![],
			pitched_from_board: vec![],
		};
		assert_ok!(AutoBattle::submit_shop_phase(RuntimeOrigin::signed(account_id), action.into()));
		
		// Report defeat
		assert_ok!(AutoBattle::report_battle_outcome(RuntimeOrigin::signed(account_id), BattleResult::Defeat));
		
		let session = ActiveGame::<Test>::get(account_id).unwrap();
		assert_eq!(session.state.lives, initial_lives - 1);
		assert_eq!(session.state.round, 2);
	});
}

#[test]
fn test_game_over_defeat() {
	new_test_ext().execute_with(|| {
		let account_id = 1;
		assert_ok!(AutoBattle::start_game(RuntimeOrigin::signed(account_id)));
		
		// Force lives to 1
		ActiveGame::<Test>::mutate(account_id, |session| {
			session.as_mut().unwrap().state.lives = 1;
		});

		// Submit shop phase
		let action = manalimit_core::CommitTurnAction {
			new_board: vec![None, None, None, None, None],
			pitched_from_hand: vec![],
			played_from_hand: vec![],
			pitched_from_board: vec![],
		};
		assert_ok!(AutoBattle::submit_shop_phase(RuntimeOrigin::signed(account_id), action.into()));
		
		// Report defeat -> Game Over
		assert_ok!(AutoBattle::report_battle_outcome(RuntimeOrigin::signed(account_id), BattleResult::Defeat));
		
		// Session should be removed
		assert!(ActiveGame::<Test>::get(account_id).is_none());
	});
}

#[test]
fn test_phase_enforcement() {
	new_test_ext().execute_with(|| {
		let account_id = 1;
		assert_ok!(AutoBattle::start_game(RuntimeOrigin::signed(account_id)));
		
		// 1. Try to report battle outcome during Shop phase
		assert_noop!(
			AutoBattle::report_battle_outcome(RuntimeOrigin::signed(account_id), BattleResult::Victory),
			Error::<Test>::WrongPhase
		);
		
		// 2. Transition to Battle phase
		let action = manalimit_core::CommitTurnAction {
			new_board: vec![None, None, None, None, None],
			pitched_from_hand: vec![],
			played_from_hand: vec![],
			pitched_from_board: vec![],
		};
		assert_ok!(AutoBattle::submit_shop_phase(RuntimeOrigin::signed(account_id), action.into()));
		
		// 3. Try to submit shop phase again during Battle phase
		let action2 = manalimit_core::CommitTurnAction {
			new_board: vec![None, None, None, None, None],
			pitched_from_hand: vec![],
			played_from_hand: vec![],
			pitched_from_board: vec![],
		};
		assert_noop!(
			AutoBattle::submit_shop_phase(RuntimeOrigin::signed(account_id), action2.into()),
			Error::<Test>::WrongPhase
		);
	});
}
