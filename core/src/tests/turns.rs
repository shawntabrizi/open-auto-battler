use crate::state::GameState;
use crate::types::*;

#[test]
fn test_verify_and_apply_turn() {
    use crate::commit::verify_and_apply_turn;
    use crate::state::BOARD_SIZE;

    let mut state = GameState::new(42);
    state.mana_limit = 5;
    // Add cards with known costs
    for i in 0..10 {
        let card = UnitCard::new(i + 1, "test", "Test", 2, 2, 1, 2, false);
        state.bag.push(card);
    }
    state.draw_hand();

    let hand_size = state.hand.len();
    let bag_len_before = state.bag.len();

    // Pitch hand card 0 for mana, play hand card 1 to board slot 0
    let card_to_play = state.hand[1].clone();
    let mut new_board: Vec<Option<BoardUnit>> = vec![None; BOARD_SIZE];
    new_board[0] = Some(BoardUnit::from_card(card_to_play));

    let action = CommitTurnAction {
        new_board,
        pitched_from_hand: vec![0],
        played_from_hand: vec![1],
        pitched_from_board: vec![],
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
    use crate::state::BOARD_SIZE;

    let mut state = GameState::new(42);
    state.mana_limit = 4; // Capacity is 4

    // Add cards with cost 4 and pitch 4
    for i in 0..10 {
        let card = UnitCard::new(i + 1, "test", "Test", 2, 2, 4, 4, false);
        state.bag.push(card);
    }
    state.draw_hand();

    // Scenario:
    // 1. Pitch hand[0] (value 4). Current mana = 4.
    // 2. Play hand[1] (cost 4). Current mana = 0.
    // 3. Pitch hand[2] (value 4). Current mana = 4.
    // 4. Play hand[3] (cost 4). Current mana = 0.
    // Total spent = 8. Total earned = 8. Limit = 4.
    // This should be LEGAL because each card is <= limit and total spend <= total earned.

    let card_1 = state.hand[1].clone();
    let card_3 = state.hand[3].clone();

    let mut new_board: Vec<Option<BoardUnit>> = vec![None; BOARD_SIZE];
    new_board[0] = Some(BoardUnit::from_card(card_1));
    new_board[1] = Some(BoardUnit::from_card(card_3));

    let action = CommitTurnAction {
        new_board,
        pitched_from_hand: vec![0, 2],
        played_from_hand: vec![1, 3],
        pitched_from_board: vec![],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(
        result.is_ok(),
        "Turn with refill should succeed: {:?}",
        result
    );
}
