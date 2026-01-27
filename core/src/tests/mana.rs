use crate::state::GameState;

#[test]
fn test_mana_limit_calculation() {
    let state = GameState::new(42);
    assert_eq!(
        state.calculate_mana_limit(),
        3,
        "Round 1 mana limit should be 3"
    );

    let mut state2 = GameState::new(42);
    state2.round = 5;
    assert_eq!(
        state2.calculate_mana_limit(),
        7,
        "Round 5 mana limit should be 7"
    );

    let mut state3 = GameState::new(42);
    state3.round = 20;
    assert_eq!(state3.calculate_mana_limit(), 10, "Mana limit caps at 10");
}
