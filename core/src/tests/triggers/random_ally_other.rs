use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_random_ally_other_targeting() {
    let commander_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 2,
            attack: 2,
            target: AbilityTarget::Random {
                scope: TargetScope::AlliesOther,
                count: 1,
            },
        },
        "Command",
    );

    let commander = create_dummy_card(1, "Commander", 2, 3).with_battle_ability(commander_ability);
    let soldier = create_dummy_card(2, "Soldier", 1, 1);
    let enemy = create_dummy_card(3, "Enemy", 1, 10);

    let p_board = vec![
        CombatUnit::from_card(commander),
        CombatUnit::from_card(soldier),
    ];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let soldier_buffed = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityModifyStats { target_instance_id, health_change, attack_change, .. }
            if *target_instance_id == UnitId::player(2) && *health_change == 2 && *attack_change == 2)
    });

    let commander_buffed = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityModifyStats { target_instance_id, .. }
            if *target_instance_id == UnitId::player(1))
    });

    assert!(
        soldier_buffed,
        "Soldier should have been buffed by Commander"
    );
    assert!(
        !commander_buffed,
        "Commander should not have buffed themselves"
    );
}

#[test]
fn test_random_ally_other_fizzle() {
    let commander_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 2,
            attack: 2,
            target: AbilityTarget::Random {
                scope: TargetScope::AlliesOther,
                count: 1,
            },
        },
        "Command",
    );

    let commander = create_dummy_card(1, "Commander", 2, 3).with_battle_ability(commander_ability);
    let enemy = create_dummy_card(2, "Enemy", 1, 10);

    let p_board = vec![CombatUnit::from_card(commander)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let buff_occurred = events
        .iter()
        .any(|e| matches!(e, CombatEvent::AbilityModifyStats { .. }));

    assert!(
        !buff_occurred,
        "No buff should occur when there are no other allies"
    );
}
