use super::*;
use crate::battle::{BattleResult, CombatEvent};

#[test]
fn test_simultaneous_clash_draw() {
    // 10/10 vs 10/10 -> Both die -> Draw
    let p_board = vec![create_board_unit(1, "P1", 10, 10)];
    let e_board = vec![create_board_unit(2, "E1", 10, 10)];

    let events = run_battle(&p_board, &e_board, 123);

    let last = events.last().unwrap();
    if let CombatEvent::BattleEnd { result } = last {
        assert_eq!(*result, BattleResult::Draw);
    } else {
        panic!("Battle did not end");
    }
}

#[test]
fn test_mutual_destruction_chain() {
    // Player: Unit deals 5 dmg on Start.
    // Enemy: Unit deals 5 dmg on Faint.
    // Result: Player kills Enemy -> Enemy dies -> Enemy kills Player -> Draw.

    let start_nuke = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 10,
            target: AbilityTarget::FrontEnemy,
        },
        "Nuke",
    );
    let faint_nuke = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::Damage {
            amount: 10,
            target: AbilityTarget::FrontEnemy,
        },
        "Revenge",
    );

    let p1 = create_dummy_card(1, "P1", 1, 5).with_ability(start_nuke);
    let e1 = create_dummy_card(2, "E1", 1, 5).with_ability(faint_nuke);

    let p_board = vec![BoardUnit::from_card(p1)];
    let e_board = vec![BoardUnit::from_card(e1)];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify triggers happened
    let has_nuke = events.iter().any(
        |e| matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Nuke"),
    );
    let has_revenge = events.iter().any(|e| {
            matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Revenge")
        });

    assert!(has_nuke);
    assert!(has_revenge);

    // Verify Draw
    if let CombatEvent::BattleEnd { result } = events.last().unwrap() {
        assert_eq!(*result, BattleResult::Draw);
    } else {
        panic!("Wrong end state");
    }
}
