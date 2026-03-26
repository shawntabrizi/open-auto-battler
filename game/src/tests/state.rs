use crate::state::derive_hand_indices_logic;
use crate::GameState;
use oab_battle::types::*;

#[test]
fn test_hand_derivation_deterministic() {
    let mut state = GameState::new(12345, crate::sealed::default_config());
    for _ in 0..15 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "TestCard", 1, 1, 1, 1);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }

    // Same seed + round should always produce same hand
    let hand1 = derive_hand_indices_logic(state.bag.len(), state.game_seed, state.round, 5);
    let hand2 = derive_hand_indices_logic(state.bag.len(), state.game_seed, state.round, 5);
    assert_eq!(hand1, hand2, "Same state should produce same hand");

    // Different round should produce different hand
    let hand3 = derive_hand_indices_logic(state.bag.len(), state.game_seed, 2, 5);
    assert_ne!(
        hand1, hand3,
        "Different round should produce different hand"
    );

    // Different seed should produce different hand
    let hand4 = derive_hand_indices_logic(state.bag.len(), 99999, state.round, 5);
    assert_ne!(hand1, hand4, "Different seed should produce different hand");
}

#[test]
fn test_hand_derivation_unique_indices() {
    let mut state = GameState::new(42, crate::sealed::default_config());
    for _ in 0..20 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "Test", 1, 1, 1, 1);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }

    let hand = derive_hand_indices_logic(state.bag.len(), state.game_seed, state.round, 5);
    assert_eq!(hand.len(), 5, "Hand should have 5 cards");

    let mut sorted = hand.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), hand.len(), "Hand indices must be unique");

    for &idx in &hand {
        assert!(
            idx < state.bag.len(),
            "Hand index should be within bag bounds"
        );
    }
}
