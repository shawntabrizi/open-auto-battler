use alloc::collections::BTreeMap;

use crate::state::{GameState, LocalGameState, BOARD_SIZE};
use crate::types::{BoardUnit, *};

#[test]
fn test_generate_card_id_monotonic() {
    let mut state = GameState::new(100);
    let a = state.generate_card_id();
    let b = state.generate_card_id();
    let c = state.generate_card_id();

    assert_eq!(a, CardId(1));
    assert_eq!(b, CardId(2));
    assert_eq!(c, CardId(3));
}

#[test]
fn test_reconstruct_decompose_round_trip() {
    let mut state = GameState::new(200);
    let id = state.generate_card_id();
    state
        .card_pool
        .insert(id, UnitCard::new(id, "Unit", 2, 3, 1, 1));
    state.bag.push(id);
    state.hand.push(id);
    state.board[0] = Some(BoardUnit::new(id));
    state.set_id = 9;

    let (pool, set_id, local) = state.clone().decompose();
    let rebuilt = GameState::reconstruct(pool, set_id, local);

    assert_eq!(rebuilt, state);
}

#[test]
fn test_draw_hand_returns_previous_hand_to_bag_before_redraw() {
    let mut state = GameState::new(300);
    let mut all_ids = Vec::new();

    for _ in 0..8 {
        let id = state.generate_card_id();
        state
            .card_pool
            .insert(id, UnitCard::new(id, "Test", 1, 1, 1, 1));
        state.bag.push(id);
        all_ids.push(id);
    }

    state.draw_hand();
    assert_eq!(state.hand.len(), 5);
    assert_eq!(state.bag.len(), 3);

    state.draw_hand();
    assert_eq!(state.hand.len(), 5);
    assert_eq!(state.bag.len(), 3);

    // Ensure we keep a full partition of original cards (no loss/duplication).
    let mut seen = state.hand.clone();
    seen.extend_from_slice(&state.bag);
    seen.sort();

    let mut expected = all_ids.clone();
    expected.sort();

    assert_eq!(seen, expected);
}

#[test]
fn test_draw_hand_noop_when_bag_and_hand_empty() {
    let mut state = GameState::new(400);
    state.draw_hand();
    assert!(state.hand.is_empty());
    assert!(state.bag.is_empty());
}

#[test]
fn test_find_empty_board_slot_and_count() {
    let mut state = GameState::new(500);
    assert_eq!(state.find_empty_board_slot(), Some(0));
    assert_eq!(state.board_unit_count(), 0);

    let id = state.generate_card_id();
    state
        .card_pool
        .insert(id, UnitCard::new(id, "Filled", 1, 1, 0, 0));
    state.board[0] = Some(BoardUnit::new(id));
    state.board[3] = Some(BoardUnit::new(id));

    assert_eq!(state.find_empty_board_slot(), Some(1));
    assert_eq!(state.board_unit_count(), 2);
}

#[test]
fn test_empty_state_constructor_is_zeroed_and_sized() {
    let state = GameState::empty();

    assert_eq!(state.round, 0);
    assert_eq!(state.mana_limit, 0);
    assert_eq!(state.shop_mana, 0);
    assert_eq!(state.lives, 0);
    assert_eq!(state.wins, 0);
    assert_eq!(state.board.len(), BOARD_SIZE);
}

#[test]
fn test_reconstruct_from_manual_local_state() {
    let card_id = CardId(42);
    let mut pool = BTreeMap::new();
    pool.insert(card_id, UnitCard::new(card_id, "Manual", 2, 2, 1, 1));

    let local = LocalGameState {
        bag: vec![card_id],
        hand: vec![],
        board: vec![Some(BoardUnit::new(card_id)), None, None, None, None],
        mana_limit: 4,
        shop_mana: 2,
        round: 3,
        lives: 2,
        wins: 1,
        phase: crate::state::GamePhase::Shop,
        next_card_id: 99,
        game_seed: 777,
    };

    let state = GameState::reconstruct(pool, 11, local.clone());
    assert_eq!(state.set_id, 11);
    assert_eq!(state.local_state, local);
}
