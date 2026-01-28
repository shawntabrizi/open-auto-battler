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

    let p_board = vec![CombatUnit::from_card(p1)];
    let e_board = vec![CombatUnit::from_card(e1)];

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

#[test]
fn test_infinite_battle_draw() {
    let grunt = create_dummy_card(1, "Grunt", 2, 2);
    let squire = create_dummy_card(2, "Squire", 2, 3).with_ability(create_ability(
        AbilityTrigger::BeforeAnyAttack,
        AbilityEffect::ModifyStats {
            health: 2,
            attack: 0,
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: -1,
            },
        },
        "SquireShield",
    ));

    let p_board = vec![
        CombatUnit::from_card(grunt.clone()),
        CombatUnit::from_card(squire.clone()),
    ];
    let e_board = vec![CombatUnit::from_card(grunt), CombatUnit::from_card(squire)];

    let events = run_battle(&p_board, &e_board, 42);

    let last_event = events.last().unwrap();
    if let CombatEvent::BattleEnd { result } = last_event {
        assert_eq!(
            *result,
            BattleResult::Draw,
            "Stalemate should result in a DRAW"
        );
    } else {
        panic!("Battle did not end correctly: {:?}", last_event);
    }

    let has_limit_exceeded = events
        .iter()
        .any(|e| matches!(e, CombatEvent::LimitExceeded { .. }));
    assert!(
        has_limit_exceeded,
        "Stalemate should trigger a LimitExceeded event"
    );
}
