//! Equivalence tests: verify that batch (verify_and_apply_turn) and incremental
//! (ShopTurnContext + apply_single_action + finalize_turn) execution produce
//! identical final states for every action type.

use alloc::collections::BTreeMap;
use alloc::vec;
use alloc::vec::Vec;

use crate::commit::{apply_single_action, finalize_turn, verify_and_apply_turn, ShopTurnContext};
use crate::error::GameError;
use crate::state::ShopState;
use crate::types::*;

fn make_card(id: u16, name: &str, atk: i16, hp: i16, cost: u8, burn: u8) -> UnitCard {
    UnitCard::new(CardId(id), name, atk, hp, cost, burn)
}

fn base_state() -> ShopState {
    ShopState {
        card_pool: BTreeMap::new(),
        set_id: 0,
        hand: Vec::new(),
        board: vec![None; 5],
        mana_limit: 10,
        shop_mana: 0,
        round: 1,
        game_seed: 42,
    }
}

/// Run the same actions through both batch and incremental paths and assert
/// final states are equal.
fn assert_equivalence(state: &ShopState, actions: &[TurnAction]) {
    let commit = CommitTurnAction {
        actions: actions.to_vec(),
    };

    // Batch path
    let mut batch_state = state.clone();
    let batch_result = verify_and_apply_turn(&mut batch_state, &commit);

    // Incremental path
    let mut inc_state = state.clone();
    let mut ctx = ShopTurnContext::new(&inc_state);
    let mut inc_result: Result<(), GameError> = Ok(());
    for action in actions {
        if let Err(e) = apply_single_action(&mut inc_state, &mut ctx, action) {
            inc_result = Err(e);
            break;
        }
    }
    if inc_result.is_ok() {
        finalize_turn(&mut inc_state, ctx);
    }

    assert_eq!(
        batch_result, inc_result,
        "Result mismatch for actions: {:?}",
        actions
    );
    if batch_result.is_ok() {
        assert_eq!(
            batch_state.board, inc_state.board,
            "Board mismatch after actions: {:?}",
            actions
        );
        assert_eq!(
            batch_state.hand, inc_state.hand,
            "Hand mismatch after actions: {:?}",
            actions
        );
        assert_eq!(
            batch_state.shop_mana, inc_state.shop_mana,
            "Mana mismatch after actions: {:?}",
            actions
        );
    }
}

// ------------------------------------------------------------------
// Test cases
// ------------------------------------------------------------------

#[test]
fn burn_from_hand() {
    let mut state = base_state();
    let card = make_card(1, "Burn", 1, 1, 1, 2);
    state.card_pool.insert(card.id, card.clone());
    state.hand = vec![CardId(1)];

    assert_equivalence(&state, &[TurnAction::BurnFromHand { hand_index: 0 }]);
}

#[test]
fn play_into_empty_slot() {
    let mut state = base_state();
    state.shop_mana = 5;
    let card = make_card(1, "Unit", 2, 3, 1, 1);
    state.card_pool.insert(card.id, card.clone());
    state.hand = vec![CardId(1)];

    assert_equivalence(
        &state,
        &[TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    );
}

#[test]
fn play_into_occupied_slot_with_insert_shift() {
    let mut state = base_state();
    state.shop_mana = 5;
    let occupant = make_card(1, "Occ", 1, 1, 0, 0);
    let hand_card = make_card(2, "New", 2, 2, 1, 0);
    state.card_pool.insert(occupant.id, occupant.clone());
    state.card_pool.insert(hand_card.id, hand_card.clone());
    state.board[0] = Some(BoardUnit::new(CardId(1)));
    state.hand = vec![CardId(2)];

    assert_equivalence(
        &state,
        &[TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    );
}

#[test]
fn play_into_occupied_slot_on_full_board() {
    let mut state = base_state();
    state.shop_mana = 5;
    for i in 0u16..5 {
        let c = make_card(i + 1, "Occ", 1, 1, 0, 0);
        state.card_pool.insert(c.id, c);
        state.board[i as usize] = Some(BoardUnit::new(CardId(i + 1)));
    }
    let hand = make_card(10, "Hand", 2, 2, 1, 0);
    state.card_pool.insert(hand.id, hand);
    state.hand = vec![CardId(10)];

    assert_equivalence(
        &state,
        &[TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    );
}

#[test]
fn burn_from_board_with_on_sell() {
    let mut state = base_state();
    let ally = make_card(2, "Ally", 2, 4, 0, 0);
    let seller = make_card(1, "Seller", 1, 2, 1, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnSell,
        effect: ShopEffect::ModifyStatsPermanent {
            health: 0,
            attack: 3,
            target: ShopTarget::All {
                scope: ShopScope::AlliesOther,
            },
        },
        conditions: vec![],
        max_triggers: None,
    });
    state.card_pool.insert(seller.id, seller);
    state.card_pool.insert(ally.id, ally);
    state.board[0] = Some(BoardUnit::new(CardId(1)));
    state.board[1] = Some(BoardUnit::new(CardId(2)));

    assert_equivalence(&state, &[TurnAction::BurnFromBoard { board_slot: 0 }]);
}

#[test]
fn play_from_hand_with_on_buy() {
    let mut state = base_state();
    state.shop_mana = 5;
    let support = make_card(1, "Support", 1, 2, 1, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnBuy,
        effect: ShopEffect::ModifyStatsPermanent {
            health: 2,
            attack: 0,
            target: ShopTarget::All {
                scope: ShopScope::SelfUnit,
            },
        },
        conditions: vec![],
        max_triggers: None,
    });
    let buyer = make_card(2, "Buyer", 1, 1, 0, 1);
    state.card_pool.insert(support.id, support);
    state.card_pool.insert(buyer.id, buyer);
    state.board[0] = Some(BoardUnit::new(CardId(1)));
    state.hand = vec![CardId(2)];

    assert_equivalence(
        &state,
        &[TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 1,
        }],
    );
}

#[test]
fn swap_board() {
    let mut state = base_state();
    let a = make_card(1, "A", 1, 1, 0, 0);
    let b = make_card(2, "B", 2, 2, 0, 0);
    state.card_pool.insert(a.id, a);
    state.card_pool.insert(b.id, b);
    state.board[0] = Some(BoardUnit::new(CardId(1)));
    state.board[2] = Some(BoardUnit::new(CardId(2)));

    assert_equivalence(
        &state,
        &[TurnAction::SwapBoard {
            slot_a: 0,
            slot_b: 2,
        }],
    );
}

#[test]
fn move_board() {
    let mut state = base_state();
    let a = make_card(1, "A", 1, 1, 0, 0);
    let b = make_card(2, "B", 2, 2, 0, 0);
    let c = make_card(3, "C", 3, 3, 0, 0);
    state.card_pool.insert(a.id, a);
    state.card_pool.insert(b.id, b);
    state.card_pool.insert(c.id, c);
    state.board[0] = Some(BoardUnit::new(CardId(1)));
    state.board[1] = Some(BoardUnit::new(CardId(2)));
    state.board[2] = Some(BoardUnit::new(CardId(3)));

    assert_equivalence(
        &state,
        &[TurnAction::MoveBoard {
            from_slot: 0,
            to_slot: 2,
        }],
    );
}

#[test]
fn not_enough_mana_failure() {
    let mut state = base_state();
    state.shop_mana = 0;
    let expensive = make_card(1, "Expensive", 2, 2, 5, 0);
    state.card_pool.insert(expensive.id, expensive);
    state.hand = vec![CardId(1)];

    assert_equivalence(
        &state,
        &[TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 0,
        }],
    );
}

#[test]
fn already_used_card_failure() {
    let mut state = base_state();
    state.shop_mana = 5;
    let card = make_card(1, "Card", 1, 1, 1, 2);
    state.card_pool.insert(card.id, card);
    state.hand = vec![CardId(1)];

    assert_equivalence(
        &state,
        &[
            TurnAction::BurnFromHand { hand_index: 0 },
            TurnAction::BurnFromHand { hand_index: 0 },
        ],
    );
}

#[test]
fn multi_action_sequence() {
    let mut state = base_state();
    state.shop_mana = 0;
    let burn_card = make_card(1, "Burn", 1, 1, 1, 3);
    let play_card = make_card(2, "Play", 2, 3, 2, 1);
    state.card_pool.insert(burn_card.id, burn_card);
    state.card_pool.insert(play_card.id, play_card);
    state.hand = vec![CardId(1), CardId(2)];

    assert_equivalence(
        &state,
        &[
            TurnAction::BurnFromHand { hand_index: 0 },
            TurnAction::PlayFromHand {
                hand_index: 1,
                board_slot: 0,
            },
        ],
    );
}

#[test]
fn on_buy_rng_determinism() {
    // Verify that the action_index-based RNG salt produces identical
    // results between batch and incremental execution for random targets.
    let mut state = base_state();
    state.shop_mana = 5;

    let support = make_card(1, "Randomizer", 1, 2, 1, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnBuy,
        effect: ShopEffect::ModifyStatsPermanent {
            health: 1,
            attack: 0,
            target: ShopTarget::Random {
                scope: ShopScope::AlliesOther,
                count: 1,
            },
        },
        conditions: vec![],
        max_triggers: None,
    });
    let ally_a = make_card(2, "AllyA", 2, 3, 0, 0);
    let ally_b = make_card(3, "AllyB", 2, 3, 0, 0);
    let buyer = make_card(4, "Buyer", 1, 1, 0, 0);

    state.card_pool.insert(support.id, support);
    state.card_pool.insert(ally_a.id, ally_a);
    state.card_pool.insert(ally_b.id, ally_b);
    state.card_pool.insert(buyer.id, buyer);

    state.board[0] = Some(BoardUnit::new(CardId(1)));
    state.board[1] = Some(BoardUnit::new(CardId(2)));
    state.board[2] = Some(BoardUnit::new(CardId(3)));
    state.hand = vec![CardId(4)];

    assert_equivalence(
        &state,
        &[TurnAction::PlayFromHand {
            hand_index: 0,
            board_slot: 3,
        }],
    );
}

#[test]
fn on_sell_rng_determinism() {
    let mut state = base_state();

    let seller = make_card(1, "Seller", 1, 2, 1, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnSell,
        effect: ShopEffect::ModifyStatsPermanent {
            health: 1,
            attack: 0,
            target: ShopTarget::Random {
                scope: ShopScope::Allies,
                count: 1,
            },
        },
        conditions: vec![],
        max_triggers: None,
    });
    let ally_a = make_card(2, "AllyA", 2, 3, 0, 0);
    let ally_b = make_card(3, "AllyB", 2, 3, 0, 0);

    state.card_pool.insert(seller.id, seller);
    state.card_pool.insert(ally_a.id, ally_a);
    state.card_pool.insert(ally_b.id, ally_b);

    state.board[0] = Some(BoardUnit::new(CardId(1)));
    state.board[1] = Some(BoardUnit::new(CardId(2)));
    state.board[2] = Some(BoardUnit::new(CardId(3)));

    assert_equivalence(&state, &[TurnAction::BurnFromBoard { board_slot: 0 }]);
}

#[test]
fn complex_mixed_sequence_with_triggers() {
    // Burn a hand card for mana, play to trigger OnBuy, sell from board
    // to trigger OnSell, then swap and move.
    let mut state = base_state();
    state.shop_mana = 0;

    let burn_card = make_card(1, "BurnMe", 1, 1, 1, 3);
    let play_card = make_card(2, "PlayMe", 2, 3, 2, 1);
    let board_sell = make_card(3, "SellMe", 1, 2, 0, 1).with_shop_ability(ShopAbility {
        trigger: ShopTrigger::OnSell,
        effect: ShopEffect::GainMana { amount: 1 },
        conditions: vec![],
        max_triggers: None,
    });
    let board_stay_a = make_card(4, "StayA", 3, 3, 0, 0);
    let board_stay_b = make_card(5, "StayB", 4, 4, 0, 0);

    state.card_pool.insert(burn_card.id, burn_card);
    state.card_pool.insert(play_card.id, play_card);
    state.card_pool.insert(board_sell.id, board_sell);
    state.card_pool.insert(board_stay_a.id, board_stay_a);
    state.card_pool.insert(board_stay_b.id, board_stay_b);

    state.hand = vec![CardId(1), CardId(2)];
    state.board[0] = Some(BoardUnit::new(CardId(3)));
    state.board[1] = Some(BoardUnit::new(CardId(4)));
    state.board[2] = Some(BoardUnit::new(CardId(5)));

    assert_equivalence(
        &state,
        &[
            TurnAction::BurnFromHand { hand_index: 0 },
            TurnAction::PlayFromHand {
                hand_index: 1,
                board_slot: 3,
            },
            TurnAction::BurnFromBoard { board_slot: 0 },
            TurnAction::SwapBoard {
                slot_a: 1,
                slot_b: 3,
            },
            TurnAction::MoveBoard {
                from_slot: 1,
                to_slot: 2,
            },
        ],
    );
}

#[test]
fn incremental_observability_after_each_action() {
    // Verify that after each apply_single_action call, the state reflects
    // the action that was just applied (the whole point of the incremental API).
    let mut state = base_state();
    state.shop_mana = 0;

    let burn_card = make_card(1, "Burn", 1, 1, 1, 3);
    let play_card = make_card(2, "Play", 2, 3, 2, 1);
    state.card_pool.insert(burn_card.id, burn_card);
    state.card_pool.insert(play_card.id, play_card);
    state.hand = vec![CardId(1), CardId(2)];

    let mut ctx = ShopTurnContext::new(&state);

    // After burn: mana should increase
    assert_eq!(ctx.current_mana, 0);
    apply_single_action(
        &mut state,
        &mut ctx,
        &TurnAction::BurnFromHand { hand_index: 0 },
    )
    .unwrap();
    assert_eq!(ctx.current_mana, 3);
    assert!(ctx.hand_used[0]);
    assert!(!ctx.hand_used[1]);
    assert_eq!(state.shop_mana, 3);

    // After play: mana should decrease, board should have unit
    apply_single_action(
        &mut state,
        &mut ctx,
        &TurnAction::PlayFromHand {
            hand_index: 1,
            board_slot: 0,
        },
    )
    .unwrap();
    assert_eq!(ctx.current_mana, 1);
    assert!(ctx.hand_used[1]);
    assert!(state.board[0].is_some());
    assert_eq!(state.board[0].as_ref().unwrap().card_id, CardId(2));
    assert_eq!(state.shop_mana, 1);

    // After finalize: hand should be empty
    assert_eq!(state.hand.len(), 2); // Still 2 until finalize
    finalize_turn(&mut state, ctx);
    assert_eq!(state.hand.len(), 0);
    assert_eq!(state.shop_mana, 1);
}
