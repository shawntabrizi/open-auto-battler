use crate::state::{GamePhase, GameState};
use crate::types::{BoardUnit, CardId, UnitCard};
use crate::view::GameView;

#[test]
fn test_game_view_from_state_maps_hand_board_and_affordability() {
    let mut state = GameState::new(123);
    state.round = 4;
    state.lives = 2;
    state.wins = 3;
    state.mana_limit = 5;
    state.phase = GamePhase::Battle;

    let known_id = CardId(1);
    let missing_id = CardId(999);
    state
        .card_pool
        .insert(known_id, UnitCard::new(known_id, "Known", 2, 5, 2, 1));

    state.hand = vec![known_id, missing_id];

    let mut board_known = BoardUnit::new(known_id);
    board_known.perm_attack = 3;
    board_known.perm_health = -2;
    state.board[0] = Some(board_known);
    state.board[1] = Some(BoardUnit::new(missing_id)); // missing template should be filtered out
    state.bag = vec![known_id, known_id, missing_id];

    let view = GameView::from_state(&state, 1, &[false, true], true);

    assert_eq!(view.round, 4);
    assert_eq!(view.lives, 2);
    assert_eq!(view.wins, 3);
    assert_eq!(view.mana, 1);
    assert_eq!(view.mana_limit, 5);
    assert_eq!(view.phase, "battle");
    assert_eq!(view.bag_count, 3);
    assert!(view.can_undo);

    assert!(view.hand[0].is_some());
    assert!(view.hand[1].is_none(), "used hand cards should be hidden");
    assert_eq!(view.can_afford, vec![false, false]);

    let board0 = view.board[0].as_ref().expect("known board card should map");
    assert_eq!(board0.attack, 5);
    assert_eq!(board0.health, 3);
    assert!(
        view.board[1].is_none(),
        "board cards missing from card_pool should be omitted"
    );
}

#[test]
fn test_game_view_phase_mapping() {
    let mut state = GameState::new(456);
    let card_id = CardId(10);
    state
        .card_pool
        .insert(card_id, UnitCard::new(card_id, "Card", 1, 1, 0, 0));
    state.hand = vec![card_id];

    let cases = [
        (GamePhase::Shop, "shop"),
        (GamePhase::Battle, "battle"),
        (GamePhase::Victory, "victory"),
        (GamePhase::Defeat, "defeat"),
    ];

    for (phase, expected) in cases {
        state.phase = phase;
        let view = GameView::from_state(&state, 0, &[false], false);
        assert_eq!(view.phase, expected);
    }
}
