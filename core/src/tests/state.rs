use crate::state::GameState;
use crate::types::*;

#[test]
fn test_hand_derivation_deterministic() {
    use crate::units::get_starter_templates;

    // Create a state with a known bag
    let mut state = GameState::new(12345);
    let templates = get_starter_templates();
    for template in &templates {
        if template.is_token {
            continue;
        }
        for _ in 0..3 {
            let id = state.generate_card_id();
            let card = UnitCard::new(
                id,
                template.template_id,
                template.name,
                template.attack,
                template.health,
                template.play_cost,
                template.pitch_value,
                template.is_token,
            );
            state.card_pool.insert(id, card);
            state.bag.push(id);
        }
    }

    // Same seed + round should always produce same hand
    let hand1 = state.derive_hand_indices();
    let hand2 = state.derive_hand_indices();
    assert_eq!(hand1, hand2, "Same state should produce same hand");

    // Different round should produce different hand
    let mut state2 = state.clone();
    state2.round = 2;
    let hand3 = state2.derive_hand_indices();
    assert_ne!(
        hand1, hand3,
        "Different round should produce different hand"
    );

    // Different seed should produce different hand
    let mut state3 = state.clone();
    state3.game_seed = 99999;
    let hand4 = state3.derive_hand_indices();
    assert_ne!(hand1, hand4, "Different seed should produce different hand");
}

#[test]
fn test_hand_derivation_unique_indices() {
    let mut state = GameState::new(42);
    // Add enough cards
    for i in 0..20 {
        let id = state.generate_card_id();
        let card = UnitCard::new(id, "test", "Test", 1, 1, 1, 1, false);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }

    let hand = state.derive_hand_indices();
    assert_eq!(hand.len(), 7, "Hand should have HAND_SIZE cards");

    // All indices should be unique
    let mut sorted = hand.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), hand.len(), "Hand indices must be unique");

    // All indices should be valid
    for &idx in &hand {
        assert!(
            idx < state.bag.len(),
            "Hand index should be within bag bounds"
        );
    }
}