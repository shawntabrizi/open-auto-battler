use crate::state::GameState;
use crate::types::*;

#[test]
fn test_verify_and_apply_turn() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(42);
    state.mana_limit = 5;
    // Add cards with known costs
    for _ in 0..10 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "test", "Test", 2, 2, 1, 2);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }
    state.draw_hand();

    let hand_size = state.hand.len();
    let bag_len_before = state.bag.len();

    // Pitch hand card 0 for mana, play hand card 1 to board slot 0
    // Using the new sequential action format
    let action = CommitTurnAction {
        actions: vec![
            TurnAction::PitchFromHand { hand_index: 0 },
            TurnAction::PlayFromHand {
                hand_index: 1,
                board_slot: 0,
            },
        ],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "Valid turn should succeed: {:?}", result);

    // 2 cards removed from hand
    assert_eq!(state.hand.len(), hand_size - 2);
    // bag size should be unchanged because verify_and_apply_turn now removes from hand
    assert_eq!(state.bag.len(), bag_len_before);

    // Board should have the played card
    assert!(state.board[0].is_some());
}

#[test]
fn test_verify_and_apply_turn_with_refill() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(42);
    state.mana_limit = 4; // Capacity is 4

    // Add cards with cost 4 and pitch 4
    for _ in 0..10 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "test", "Test", 2, 2, 4, 4);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }
    state.draw_hand();

    // Scenario:
    // 1. Pitch hand[0] (value 4). Current mana = 4.
    // 2. Play hand[1] (cost 4). Current mana = 0.
    // 3. Pitch hand[2] (value 4). Current mana = 4.
    // 4. Play hand[3] (cost 4). Current mana = 0.
    // Total spent = 8. Total earned = 8. Limit = 4.
    // This should be LEGAL because each card is <= limit and total spend <= total earned.

    // Using the new sequential action format - order matters!
    let action = CommitTurnAction {
        actions: vec![
            TurnAction::PitchFromHand { hand_index: 0 },
            TurnAction::PlayFromHand {
                hand_index: 1,
                board_slot: 0,
            },
            TurnAction::PitchFromHand { hand_index: 2 },
            TurnAction::PlayFromHand {
                hand_index: 3,
                board_slot: 1,
            },
        ],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(
        result.is_ok(),
        "Turn with refill should succeed: {:?}",
        result
    );

    // Board should have two played cards
    assert!(state.board[0].is_some());
    assert!(state.board[1].is_some());
}

#[test]
fn test_sequential_order_matters() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(42);
    state.mana_limit = 4;

    // Add cards with cost 4 and pitch 4
    for _ in 0..10 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "test", "Test", 2, 2, 4, 4);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }
    state.draw_hand();

    // Try to play before pitching - should fail because no mana
    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_err(), "Playing without mana should fail");
}

#[test]
fn test_pitch_then_pitch_same_card_fails() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(42);
    state.mana_limit = 10;

    // Add cards
    for _ in 0..10 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "test", "Test", 2, 2, 1, 2);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }
    state.draw_hand();

    // Try to pitch the same card twice - should fail
    let action = CommitTurnAction {
        actions: vec![
            TurnAction::PitchFromHand { hand_index: 0 },
            TurnAction::PitchFromHand { hand_index: 0 }, // Same card!
        ],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_err(), "Pitching same card twice should fail");
}

#[test]
fn test_swap_board_positions() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(42);
    state.mana_limit = 10;

    // Add cards
    for _ in 0..10 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "test", "Test", 2, 2, 1, 2);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }
    state.draw_hand();

    // Play two cards, then swap them
    let action = CommitTurnAction {
        actions: vec![
            TurnAction::PitchFromHand { hand_index: 0 },
            TurnAction::PlayFromHand {
                hand_index: 1,
                board_slot: 0,
            },
            TurnAction::PitchFromHand { hand_index: 2 },
            TurnAction::PlayFromHand {
                hand_index: 3,
                board_slot: 1,
            },
            TurnAction::SwapBoard {
                slot_a: 0,
                slot_b: 1,
            },
        ],
    };

    let card_id_at_slot_0_before = state.hand[1]; // Will be at slot 0 initially
    let card_id_at_slot_1_before = state.hand[3]; // Will be at slot 1 initially

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "Swapping should succeed: {:?}", result);

    // After swap, cards should be in opposite positions
    assert_eq!(
        state.board[0].as_ref().unwrap().card_id,
        card_id_at_slot_1_before
    );
    assert_eq!(
        state.board[1].as_ref().unwrap().card_id,
        card_id_at_slot_0_before
    );
}

#[test]
fn test_pitch_from_board() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(42);
    state.mana_limit = 10;

    // Add cards
    for _ in 0..10 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "test", "Test", 2, 2, 1, 2);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }
    state.draw_hand();

    // Pre-place a card on the board
    let pre_placed_id = state.generate_card_id();
    let pre_placed_card = UnitCard::new(pre_placed_id, "pre", "Pre", 1, 1, 1, 3);
    state
        .card_pool
        .insert(pre_placed_id, pre_placed_card.clone());
    state.board[0] = Some(BoardUnit::new(pre_placed_id, pre_placed_card.stats.health));

    // Pitch from board, then play a card to that slot
    let action = CommitTurnAction {
        actions: vec![
            TurnAction::PitchFromBoard { board_slot: 0 },
            TurnAction::PlayFromHand {
                hand_index: 0,
                board_slot: 0,
            },
        ],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(
        result.is_ok(),
        "Pitching from board and playing should succeed: {:?}",
        result
    );

    // Board slot 0 should have a new card
    assert!(state.board[0].is_some());
    assert_ne!(state.board[0].as_ref().unwrap().card_id, pre_placed_id);
}
