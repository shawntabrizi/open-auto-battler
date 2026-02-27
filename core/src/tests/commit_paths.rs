use crate::commit::{apply_shop_start_triggers, verify_and_apply_turn};
use crate::error::GameError;
use crate::state::GameState;
use crate::types::*;

fn add_card(
    state: &mut GameState,
    name: &str,
    attack: i32,
    health: i32,
    play_cost: i32,
    pitch_value: i32,
) -> CardId {
    let id = state.generate_card_id();
    let card = UnitCard::new(id, name, attack, health, play_cost, pitch_value);
    state.card_pool.insert(id, card);
    id
}

#[test]
fn test_turn_error_invalid_hand_index_pitch_and_play() {
    let mut state = GameState::new(1);

    let pitch = CommitTurnAction {
        actions: vec![TurnAction::PitchFromHand { hand_index: 0 }],
    };
    assert_eq!(
        verify_and_apply_turn(&mut state, &pitch),
        Err(GameError::InvalidHandIndex { index: 0 })
    );

    let play = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    };
    assert_eq!(
        verify_and_apply_turn(&mut state, &play),
        Err(GameError::InvalidHandIndex { index: 0 })
    );
}

#[test]
fn test_turn_error_play_into_occupied_slot() {
    let mut state = GameState::new(2);
    state.mana_limit = 10;
    state.shop_mana = 10;

    let occupied_id = add_card(&mut state, "Occupied", 1, 1, 0, 0);
    let hand_id = add_card(&mut state, "Hand", 1, 1, 1, 0);
    state.board[0] = Some(BoardUnit::new(occupied_id));
    state.hand = vec![hand_id];

    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    };

    assert_eq!(
        verify_and_apply_turn(&mut state, &action),
        Err(GameError::BoardSlotOccupied { index: 0 })
    );
}

#[test]
fn test_turn_error_not_enough_mana() {
    let mut state = GameState::new(3);
    state.mana_limit = 10;
    state.shop_mana = 1;

    let expensive_id = add_card(&mut state, "Expensive", 2, 2, 3, 0);
    state.hand = vec![expensive_id];

    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    };

    assert_eq!(
        verify_and_apply_turn(&mut state, &action),
        Err(GameError::NotEnoughMana { have: 1, need: 3 })
    );
}

#[test]
fn test_turn_error_invalid_board_pitch_paths() {
    let mut state = GameState::new(4);

    let out_of_bounds = CommitTurnAction {
        actions: vec![TurnAction::PitchFromBoard { board_slot: 5 }],
    };
    assert_eq!(
        verify_and_apply_turn(&mut state, &out_of_bounds),
        Err(GameError::InvalidBoardPitch { index: 5 })
    );

    let empty_slot = CommitTurnAction {
        actions: vec![TurnAction::PitchFromBoard { board_slot: 0 }],
    };
    assert_eq!(
        verify_and_apply_turn(&mut state, &empty_slot),
        Err(GameError::InvalidBoardPitch { index: 0 })
    );
}

#[test]
fn test_turn_error_invalid_swap_slot() {
    let mut state = GameState::new(5);
    let action = CommitTurnAction {
        actions: vec![TurnAction::SwapBoard {
            slot_a: 0,
            slot_b: 9,
        }],
    };
    assert_eq!(
        verify_and_apply_turn(&mut state, &action),
        Err(GameError::InvalidBoardSlot { index: 9 })
    );
}

#[test]
fn test_on_buy_damage_trigger_source_removes_bought_unit() {
    let mut state = GameState::new(6);
    state.mana_limit = 10;
    state.shop_mana = 10;

    let support_id = state.generate_card_id();
    let support = UnitCard::new(support_id, "Bomber", 1, 2, 1, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnBuy,
        effect: ShopEffect::ModifyStatsPermanent {
            health: -3,
            attack: 0,
            target: ShopTarget::All {
                scope: ShopScope::TriggerSource,
            },
        },
        name: "Explosive Welcome".to_string(),
        description: "Damage the bought unit".to_string(),
        conditions: vec![],
        max_triggers: None,
    });

    let bought_id = add_card(&mut state, "Fragile", 1, 1, 0, 0);
    state.card_pool.insert(support_id, support);
    state.board[0] = Some(BoardUnit::new(support_id));
    state.hand = vec![bought_id];

    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 1,
        }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "buy action should succeed: {:?}", result);
    assert!(
        state.board[1].is_none(),
        "trigger-source damage should clean up dead bought unit"
    );
}

#[test]
fn test_on_buy_destroy_standard_target_selects_highest_attack() {
    let mut state = GameState::new(7);
    state.mana_limit = 10;
    state.shop_mana = 10;

    let controller_id = state.generate_card_id();
    let controller =
        UnitCard::new(controller_id, "Controller", 1, 2, 1, 1).with_shop_ability(ShopAbility {
            trigger: ShopTrigger::OnBuy,
            effect: ShopEffect::Destroy {
                target: ShopTarget::Standard {
                    scope: ShopScope::Allies,
                    stat: StatType::Attack,
                    order: SortOrder::Descending,
                    count: 1,
                },
            },
            name: "Cull Strongest".to_string(),
            description: "Destroy strongest ally".to_string(),
            conditions: vec![],
            max_triggers: None,
        });

    let high_id = add_card(&mut state, "High", 6, 3, 0, 0);
    let low_id = add_card(&mut state, "Low", 1, 3, 0, 0);
    let bought_id = add_card(&mut state, "Bought", 2, 2, 0, 0);

    state.card_pool.insert(controller_id, controller);
    state.board[0] = Some(BoardUnit::new(controller_id));
    state.board[2] = Some(BoardUnit::new(low_id));
    state.board[3] = Some(BoardUnit::new(high_id));
    state.hand = vec![bought_id];

    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 1,
        }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "buy action should succeed: {:?}", result);
    assert!(
        state.board[3].is_none(),
        "highest-attack ally should be destroyed by Standard target selection"
    );
}

#[test]
fn test_on_sell_self_position_zero_fizzles_when_source_is_removed() {
    let mut state = GameState::new(8);
    state.mana_limit = 10;

    let seller_id = state.generate_card_id();
    let ally_id = add_card(&mut state, "Ally", 2, 4, 0, 0);
    let seller = UnitCard::new(seller_id, "Seller", 1, 2, 1, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnSell,
        effect: ShopEffect::ModifyStatsPermanent {
            health: 10,
            attack: 0,
            target: ShopTarget::Position {
                scope: ShopScope::SelfUnit,
                index: 0,
            },
        },
        name: "Self Buff On Sell".to_string(),
        description: "Should fizzle because seller is gone".to_string(),
        conditions: vec![],
        max_triggers: None,
    });

    state.card_pool.insert(seller_id, seller);
    state.board[0] = Some(BoardUnit::new(seller_id));
    state.board[1] = Some(BoardUnit::new(ally_id));

    let action = CommitTurnAction {
        actions: vec![TurnAction::PitchFromBoard { board_slot: 0 }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "sell action should succeed: {:?}", result);
    assert_eq!(state.board[1].as_ref().unwrap().perm_health, 0);
}

#[test]
fn test_on_sell_allies_other_targets_survivors_when_source_is_removed() {
    let mut state = GameState::new(9);
    state.mana_limit = 10;

    let seller_id = state.generate_card_id();
    let ally_a_id = add_card(&mut state, "AllyA", 2, 4, 0, 0);
    let ally_b_id = add_card(&mut state, "AllyB", 3, 5, 0, 0);
    let seller = UnitCard::new(seller_id, "Seller", 1, 2, 1, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnSell,
        effect: ShopEffect::ModifyStatsPermanent {
            health: 0,
            attack: 2,
            target: ShopTarget::All {
                scope: ShopScope::AlliesOther,
            },
        },
        name: "Farewell Buff".to_string(),
        description: "Buff all surviving allies".to_string(),
        conditions: vec![],
        max_triggers: None,
    });

    state.card_pool.insert(seller_id, seller);
    state.board[0] = Some(BoardUnit::new(seller_id));
    state.board[1] = Some(BoardUnit::new(ally_a_id));
    state.board[2] = Some(BoardUnit::new(ally_b_id));

    let action = CommitTurnAction {
        actions: vec![TurnAction::PitchFromBoard { board_slot: 0 }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "sell action should succeed: {:?}", result);
    assert_eq!(state.board[1].as_ref().unwrap().perm_attack, 2);
    assert_eq!(state.board[2].as_ref().unwrap().perm_attack, 2);
}

#[test]
fn test_shop_condition_gate_can_prevent_effects() {
    let mut state = GameState::new(10);
    state.mana_limit = 10;
    state.shop_mana = 0;

    let gate_id = state.generate_card_id();
    let buy_id = add_card(&mut state, "FreeBuy", 1, 1, 0, 0);

    let gated = UnitCard::new(gate_id, "Gate", 3, 3, 0, 0).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnBuy,
        effect: ShopEffect::GainMana { amount: 2 },
        name: "UnitCount Gate".to_string(),
        description: "Should not pass in this scenario".to_string(),
        conditions: vec![ShopCondition::Is(ShopMatcher::UnitCount {
            scope: ShopScope::Allies,
            op: CompareOp::GreaterThan,
            value: 10,
        })],
        max_triggers: None,
    });

    state.card_pool.insert(gate_id, gated);
    state.board[0] = Some(BoardUnit::new(gate_id));
    state.hand = vec![buy_id];

    let action = CommitTurnAction {
        actions: vec![TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 1,
        }],
    };

    let result = verify_and_apply_turn(&mut state, &action);
    assert!(result.is_ok(), "buy action should succeed: {:?}", result);
    assert_eq!(
        state.shop_mana, 0,
        "condition should prevent mana gain in shop trigger evaluation"
    );
}

#[test]
fn test_shop_condition_anyof_path_applies_with_valid_targets() {
    let mut state = GameState::new(11);
    state.mana_limit = 10;
    state.shop_mana = 0;

    let source_id = state.generate_card_id();
    let ally_id = add_card(&mut state, "Ally", 2, 3, 0, 0);

    let source = UnitCard::new(source_id, "Source", 1, 2, 0, 0).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnShopStart,
        effect: ShopEffect::ModifyStatsPermanent {
            health: 0,
            attack: 5,
            target: ShopTarget::All {
                scope: ShopScope::AlliesOther,
            },
        },
        name: "AnyOf Buff".to_string(),
        description: "Covers AnyOf matcher path in shop effects".to_string(),
        conditions: vec![ShopCondition::AnyOf(vec![
            ShopMatcher::UnitCount {
                scope: ShopScope::Allies,
                op: CompareOp::GreaterThanOrEqual,
                value: 1,
            },
            ShopMatcher::IsPosition {
                scope: ShopScope::SelfUnit,
                index: 99,
            },
        ])],
        max_triggers: None,
    });

    state.card_pool.insert(source_id, source);
    state.board[0] = Some(BoardUnit::new(source_id));
    state.board[1] = Some(BoardUnit::new(ally_id));

    apply_shop_start_triggers(&mut state);
    assert_eq!(
        state.board[1].as_ref().unwrap().perm_attack,
        5,
        "AnyOf should pass and buff allies-other via valid shop target"
    );
}
