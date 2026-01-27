use super::*;
use crate::battle::{BattleResult, CombatEvent};

#[test]
fn test_simultaneous_clash_draw() {
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
    let start_nuke = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 10,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 0,
            },
        },
        "Nuke",
    );
    let faint_nuke = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::Damage {
            amount: 10,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 0,
            },
        },
        "Revenge",
    );

    let p1 = create_dummy_card(1, "P1", 1, 5).with_ability(start_nuke);
    let e1 = create_dummy_card(2, "E1", 1, 5).with_ability(faint_nuke);

    let p_board = vec![BoardUnit::from_card(p1)];
    let e_board = vec![BoardUnit::from_card(e1)];

    let events = run_battle(&p_board, &e_board, 42);

    let has_nuke = events.iter().any(
        |e| matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Nuke"),
    );
    let has_revenge = events.iter().any(|e| {
            matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Revenge")
        });

    assert!(has_nuke);
    assert!(has_revenge);

    if let CombatEvent::BattleEnd { result } = events.last().unwrap() {
        assert_eq!(*result, BattleResult::Draw);
    } else {
        panic!("Wrong end state");
    }
}