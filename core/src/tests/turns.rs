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
        let card = UnitCard::new(id, "Test", 2, 2, 1, 2);
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
        let card = UnitCard::new(id, "Test", 2, 2, 4, 4);
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
        let card = UnitCard::new(id, "Test", 2, 2, 4, 4);
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
        let card = UnitCard::new(id, "Test", 2, 2, 1, 2);
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
        let card = UnitCard::new(id, "Test", 2, 2, 1, 2);
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
        let card = UnitCard::new(id, "Test", 2, 2, 1, 2);
        state.card_pool.insert(id, card);
        state.bag.push(id);
    }
    state.draw_hand();

    // Pre-place a card on the board
    let pre_placed_id = state.generate_card_id();
    let pre_placed_card = UnitCard::new(pre_placed_id, "Pre", 1, 1, 1, 3);
    state
        .card_pool
        .insert(pre_placed_id, pre_placed_card.clone());
    state.board[0] = Some(BoardUnit::new(pre_placed_id));

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

#[test]
fn test_on_buy_trigger_applies_in_shop() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(7);
    state.mana_limit = 10;

    let support_id = state.generate_card_id();
    let buyer_id = state.generate_card_id();

    let support_card = UnitCard::new(support_id, "Support", 1, 2, 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnBuy,
        effect: AbilityEffect::ModifyStats {
            health: 2,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        name: "Shop Cheer".to_string(),
        description: "Gain +2 health when a unit is bought".to_string(),
        conditions: vec![],
        max_triggers: None,
    });
    let buyer_card = UnitCard::new(buyer_id, "Buyer", 1, 1, 0, 1);

    state.card_pool.insert(support_id, support_card);
    state.card_pool.insert(buyer_id, buyer_card);

    state.board[0] = Some(BoardUnit::new(support_id));
    state.hand = vec![buyer_id];

    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 1,
        }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "OnBuy action should succeed: {:?}", result);

    assert_eq!(
        state.board[0].as_ref().unwrap().perm_health,
        2,
        "OnBuy should have granted +2 permanent health"
    );
}

#[test]
fn test_on_sell_trigger_applies_in_shop() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(9);
    state.mana_limit = 10;

    let seller_id = state.generate_card_id();
    let ally_id = state.generate_card_id();

    let seller_card = UnitCard::new(seller_id, "Seller", 1, 2, 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnSell,
        effect: AbilityEffect::ModifyStats {
            health: 3,
            attack: 0,
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: 1,
            },
        },
        name: "Parting Gift".to_string(),
        description: "Give the ally behind +3 health when sold".to_string(),
        conditions: vec![],
        max_triggers: None,
    });
    let ally_card = UnitCard::new(ally_id, "Ally", 2, 4, 1, 1);

    state.card_pool.insert(seller_id, seller_card);
    state.card_pool.insert(ally_id, ally_card);

    state.board[0] = Some(BoardUnit::new(seller_id));
    state.board[1] = Some(BoardUnit::new(ally_id));

    let action = CommitTurnAction {
        actions: vec![TurnAction::PitchFromBoard { board_slot: 0 }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "OnSell action should succeed: {:?}", result);

    assert!(state.board[0].is_none(), "Sold unit should be removed");
    assert_eq!(
        state.board[1].as_ref().unwrap().perm_health,
        3,
        "OnSell should have granted +3 permanent health to ally behind"
    );
}

#[test]
fn test_on_buy_gain_mana_enables_extra_play() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(17);
    state.mana_limit = 5;

    let booster_id = state.generate_card_id();
    let free_buy_id = state.generate_card_id();
    let paid_buy_id = state.generate_card_id();

    let booster_card = UnitCard::new(booster_id, "Booster", 1, 2, 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnBuy,
        effect: AbilityEffect::GainMana { amount: 1 },
        name: "Cashback".to_string(),
        description: "Gain 1 mana when a unit is bought".to_string(),
        conditions: vec![],
        max_triggers: None,
    });
    let free_buy_card = UnitCard::new(free_buy_id, "FreeBuy", 1, 1, 0, 1);
    let paid_buy_card = UnitCard::new(paid_buy_id, "PaidBuy", 2, 2, 1, 1);

    state.card_pool.insert(booster_id, booster_card);
    state.card_pool.insert(free_buy_id, free_buy_card);
    state.card_pool.insert(paid_buy_id, paid_buy_card);

    state.board[0] = Some(BoardUnit::new(booster_id));
    state.hand = vec![free_buy_id, paid_buy_id];

    // Without OnBuy GainMana, the second play (cost 1) would fail because mana starts at 0.
    let action = CommitTurnAction {
        actions: vec![
            TurnAction::PlayFromHand {
                hand_index: 0,
                board_slot: 1,
            },
            TurnAction::PlayFromHand {
                hand_index: 1,
                board_slot: 2,
            },
        ],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(
        result.is_ok(),
        "OnBuy GainMana should allow the second play: {:?}",
        result
    );
    assert!(state.board[1].is_some());
    assert!(state.board[2].is_some());
}

#[test]
fn test_on_sell_gain_mana_enables_extra_play() {
    use crate::commit::verify_and_apply_turn;

    let mut state = GameState::new(19);
    state.mana_limit = 5;

    let seller_id = state.generate_card_id();
    let paid_buy_id = state.generate_card_id();

    let seller_card = UnitCard::new(seller_id, "Seller", 1, 2, 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnSell,
        effect: AbilityEffect::GainMana { amount: 1 },
        name: "Sell Bonus".to_string(),
        description: "Gain 1 mana when sold".to_string(),
        conditions: vec![],
        max_triggers: None,
    });
    let paid_buy_card = UnitCard::new(paid_buy_id, "PaidBuy", 2, 2, 1, 1);

    state.card_pool.insert(seller_id, seller_card);
    state.card_pool.insert(paid_buy_id, paid_buy_card);

    state.board[0] = Some(BoardUnit::new(seller_id));
    state.hand = vec![paid_buy_id];

    // Without OnSell GainMana, this play would fail (no mana after the sell itself).
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
        "OnSell GainMana should allow the follow-up play: {:?}",
        result
    );
    assert!(state.board[0].is_some());
}

#[test]
fn test_on_shop_start_random_is_deterministic_with_seed() {
    use crate::commit::apply_shop_start_triggers;

    fn build_state(seed: u64) -> GameState {
        let mut state = GameState::new(seed);

        let trigger_id = state.generate_card_id();
        let ally_a_id = state.generate_card_id();
        let ally_b_id = state.generate_card_id();

        let trigger_card = UnitCard::new(trigger_id, "Starter", 1, 2, 1, 1).with_ability(Ability {
            trigger: AbilityTrigger::OnShopStart,
            effect: AbilityEffect::ModifyStats {
                health: 1,
                attack: 0,
                target: AbilityTarget::Random {
                    scope: TargetScope::AlliesOther,
                    count: 1,
                },
            },
            name: "Morning Buff".to_string(),
            description: "Buff one random ally at shop start".to_string(),
            conditions: vec![],
            max_triggers: None,
        });

        let ally_a = UnitCard::new(ally_a_id, "AllyA", 2, 3, 1, 1);
        let ally_b = UnitCard::new(ally_b_id, "AllyB", 2, 3, 1, 1);

        state.card_pool.insert(trigger_id, trigger_card);
        state.card_pool.insert(ally_a_id, ally_a);
        state.card_pool.insert(ally_b_id, ally_b);

        state.board[0] = Some(BoardUnit::new(trigger_id));
        state.board[1] = Some(BoardUnit::new(ally_a_id));
        state.board[2] = Some(BoardUnit::new(ally_b_id));

        state
    }

    let mut state_a = build_state(12345);
    let mut state_b = build_state(12345);

    apply_shop_start_triggers(&mut state_a);
    apply_shop_start_triggers(&mut state_b);

    let healths_a = (
        state_a.board[1].as_ref().unwrap().perm_health,
        state_a.board[2].as_ref().unwrap().perm_health,
    );
    let healths_b = (
        state_b.board[1].as_ref().unwrap().perm_health,
        state_b.board[2].as_ref().unwrap().perm_health,
    );

    assert_eq!(
        healths_a, healths_b,
        "Same seed should produce identical random shop trigger results"
    );
    assert_eq!(
        healths_a.0 + healths_a.1,
        1,
        "Exactly one ally should receive +1 permanent health"
    );
}

#[test]
fn test_on_shop_start_gain_mana_sets_turn_starting_mana() {
    use crate::commit::{apply_shop_start_triggers, verify_and_apply_turn};

    let mut state = GameState::new(23);
    state.mana_limit = 3;

    let starter_id = state.generate_card_id();
    let paid_buy_id = state.generate_card_id();

    let starter = UnitCard::new(starter_id, "Starter", 1, 2, 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnShopStart,
        effect: AbilityEffect::GainMana { amount: 1 },
        name: "Opening Coin".to_string(),
        description: "Gain 1 mana at shop start".to_string(),
        conditions: vec![],
        max_triggers: None,
    });
    let paid_buy = UnitCard::new(paid_buy_id, "PaidBuy", 2, 2, 1, 1);

    state.card_pool.insert(starter_id, starter);
    state.card_pool.insert(paid_buy_id, paid_buy);
    state.board[0] = Some(BoardUnit::new(starter_id));
    state.hand = vec![paid_buy_id];

    apply_shop_start_triggers(&mut state);
    assert_eq!(
        state.shop_mana, 1,
        "OnShopStart should set starting shop mana"
    );

    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 1,
        }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(
        result.is_ok(),
        "Shop-start mana should be usable by turn verification: {:?}",
        result
    );
    assert!(state.board[1].is_some());
}

#[test]
fn test_on_shop_start_keeps_carryover_and_clamps_to_limit() {
    use crate::commit::apply_shop_start_triggers;

    let mut state = GameState::new(29);
    state.mana_limit = 4;
    state.shop_mana = 10;

    apply_shop_start_triggers(&mut state);

    assert_eq!(
        state.shop_mana, 4,
        "Shop start should preserve carryover model but clamp to mana limit"
    );
}
