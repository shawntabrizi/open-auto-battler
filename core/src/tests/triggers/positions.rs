use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_enemy_position_targeting() {
    let mage_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 2,
            },
        },
        "ArtilleryStrike",
    );

    let mage = create_dummy_card(1, "Artillery Mage", 3, 3).with_battle_ability(mage_ability);

    let t0 = create_dummy_card(2, "T0", 1, 10);
    let t1 = create_dummy_card(3, "T1", 1, 10);
    let t2 = create_dummy_card(4, "T2", 1, 5);

    let p_board = vec![CombatUnit::from_card(mage)];
    let e_board = vec![
        CombatUnit::from_card(t0),
        CombatUnit::from_card(t1),
        CombatUnit::from_card(t2),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    let hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
            if *target_instance_id == UnitId::enemy(3) && *damage == 5)
    });

    assert!(hit, "Enemy at position 2 should have been hit for 5 damage");
}

#[test]
fn test_enemy_position_fizzle() {
    let mage_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 2,
            },
        },
        "ArtilleryStrike",
    );

    let mage = create_dummy_card(1, "Artillery Mage", 3, 3).with_battle_ability(mage_ability);

    let t0 = create_dummy_card(2, "T0", 1, 10);
    let t1 = create_dummy_card(3, "T1", 1, 10);

    let p_board = vec![CombatUnit::from_card(mage)];
    let e_board = vec![CombatUnit::from_card(t0), CombatUnit::from_card(t1)];

    let events = run_battle(&p_board, &e_board, 42);

    let hit = events
        .iter()
        .any(|e| matches!(e, CombatEvent::AbilityDamage { .. }));

    assert!(
        !hit,
        "Ability should have fizzled as there is no unit at position 2"
    );
}

#[test]
fn test_ally_position_targeting() {
    let guard_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 3,
            attack: 3,
            target: AbilityTarget::Position {
                scope: TargetScope::Allies,
                index: 4,
            },
        },
        "SupplyLine",
    );

    let guard = create_dummy_card(1, "Rear Guard", 2, 5).with_battle_ability(guard_ability);
    let a1 = create_dummy_card(2, "A1", 1, 1);
    let a2 = create_dummy_card(3, "A2", 1, 1);
    let a3 = create_dummy_card(4, "A3", 1, 1);
    let a4 = create_dummy_card(5, "A4", 5, 5);

    let enemy = create_dummy_card(6, "Enemy", 1, 10);

    let p_board = vec![
        CombatUnit::from_card(guard),
        CombatUnit::from_card(a1),
        CombatUnit::from_card(a2),
        CombatUnit::from_card(a3),
        CombatUnit::from_card(a4),
    ];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let buff = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityModifyStats { target_instance_id, health_change, attack_change, .. }
            if *target_instance_id == UnitId::player(5) && *health_change == 3 && *attack_change == 3)
    });

    assert!(buff, "Ally at position 4 should have been buffed +3/+3");
}

#[test]
fn test_ally_position_fizzle() {
    let guard_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 3,
            attack: 3,
            target: AbilityTarget::Position {
                scope: TargetScope::Allies,
                index: 4,
            },
        },
        "SupplyLine",
    );

    let guard = create_dummy_card(1, "Rear Guard", 2, 5).with_battle_ability(guard_ability);
    let enemy = create_dummy_card(6, "Enemy", 1, 10);

    let p_board = vec![CombatUnit::from_card(guard)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let buff = events
        .iter()
        .any(|e| matches!(e, CombatEvent::AbilityModifyStats { .. }));

    assert!(
        !buff,
        "Ability should have fizzled as there is no unit at position 4"
    );
}
