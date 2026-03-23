use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

/// Middle unit buffs adjacent allies. Front and back get buffed, not self.
#[test]
fn test_adjacent_allies_middle_unit() {
    let buff_adjacent = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 5,
            target: AbilityTarget::Adjacent {
                scope: TargetScope::Allies,
            },
        },
    );

    let front = create_dummy_card(1, "Front", 1, 50);
    let middle = create_dummy_card(2, "Middle", 1, 50).with_battle_ability(buff_adjacent);
    let back = create_dummy_card(3, "Back", 1, 50);
    let enemy = create_dummy_card(4, "Enemy", 0, 50);

    let p_board = vec![
        CombatUnit::from_card(front),
        CombatUnit::from_card(middle),
        CombatUnit::from_card(back),
    ];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Front (position 0) should be buffed
    let front_buffed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityModifyStats {
                target_instance_id,
                attack_change,
                ..
            } if *target_instance_id == UnitId::player(1) && *attack_change == 5
        )
    });
    assert!(front_buffed, "Front unit should be buffed by adjacent");

    // Back (position 2) should be buffed
    let back_buffed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityModifyStats {
                target_instance_id,
                attack_change,
                ..
            } if *target_instance_id == UnitId::player(3) && *attack_change == 5
        )
    });
    assert!(back_buffed, "Back unit should be buffed by adjacent");

    // Middle (self) should NOT be buffed
    let middle_buffed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityModifyStats {
                target_instance_id,
                ..
            } if *target_instance_id == UnitId::player(2)
        )
    });
    assert!(!middle_buffed, "Middle unit should not buff itself");
}

/// Front unit with Adjacent { scope: Allies } only gets the unit behind, no enemy.
#[test]
fn test_adjacent_allies_front_unit_no_enemy() {
    let buff_adjacent = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 5,
            target: AbilityTarget::Adjacent {
                scope: TargetScope::Allies,
            },
        },
    );

    let front = create_dummy_card(1, "Front", 1, 50).with_battle_ability(buff_adjacent);
    let behind = create_dummy_card(2, "Behind", 1, 50);
    let enemy = create_dummy_card(3, "Enemy", 0, 50);

    let p_board = vec![CombatUnit::from_card(front), CombatUnit::from_card(behind)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Behind should be buffed
    let behind_buffed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityModifyStats {
                target_instance_id,
                attack_change,
                ..
            } if *target_instance_id == UnitId::player(2) && *attack_change == 5
        )
    });
    assert!(behind_buffed, "Unit behind should be buffed");

    // Enemy should NOT be buffed (scope is Allies)
    let enemy_buffed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityModifyStats {
                target_instance_id,
                ..
            } if *target_instance_id == UnitId::enemy(1)
        )
    });
    assert!(
        !enemy_buffed,
        "Enemy should not be buffed with Allies scope"
    );
}

/// Front unit with Adjacent { scope: All } gets unit behind AND enemy front.
#[test]
fn test_adjacent_all_front_unit_includes_enemy() {
    let damage_adjacent = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::Adjacent {
                scope: TargetScope::All,
            },
        },
    );

    let front = create_dummy_card(1, "Front", 1, 50).with_battle_ability(damage_adjacent);
    let behind = create_dummy_card(2, "Behind", 1, 50);
    let enemy = create_dummy_card(3, "Enemy", 0, 50);

    let p_board = vec![CombatUnit::from_card(front), CombatUnit::from_card(behind)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Behind (ally) should take damage
    let behind_hit = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDamage {
                source_instance_id,
                target_instance_id,
                damage,
                ..
            } if *source_instance_id == UnitId::player(1)
                && *target_instance_id == UnitId::player(2)
                && *damage == 3
        )
    });
    assert!(behind_hit, "Unit behind should take adjacent damage");

    // Enemy front should take damage (scope All, source is front)
    let enemy_hit = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDamage {
                source_instance_id,
                target_instance_id,
                damage,
                ..
            } if *source_instance_id == UnitId::player(1)
                && *target_instance_id == UnitId::enemy(1)
                && *damage == 3
        )
    });
    assert!(
        enemy_hit,
        "Enemy front should take adjacent damage with All scope"
    );
}

/// Back unit with Adjacent { scope: All } only gets ally neighbor, no enemy.
#[test]
fn test_adjacent_all_back_unit_no_enemy() {
    let buff_adjacent = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 5,
            target: AbilityTarget::Adjacent {
                scope: TargetScope::All,
            },
        },
    );

    let front = create_dummy_card(1, "Front", 1, 50);
    let back = create_dummy_card(2, "Back", 1, 50).with_battle_ability(buff_adjacent);
    let enemy = create_dummy_card(3, "Enemy", 0, 50);

    let p_board = vec![CombatUnit::from_card(front), CombatUnit::from_card(back)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Front should be buffed (adjacent ally)
    let front_buffed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityModifyStats {
                target_instance_id,
                attack_change,
                ..
            } if *target_instance_id == UnitId::player(1) && *attack_change == 5
        )
    });
    assert!(front_buffed, "Front should be buffed by back's adjacent");

    // Enemy should NOT be buffed (back unit is not at position 0)
    let enemy_buffed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityModifyStats {
                target_instance_id,
                ..
            } if *target_instance_id == UnitId::enemy(1)
        )
    });
    assert!(!enemy_buffed, "Enemy should not be adjacent to back unit");
}

/// Solo unit with Adjacent { scope: Allies } has no neighbors — fizzles.
#[test]
fn test_adjacent_solo_unit_fizzles() {
    let buff_adjacent = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 5,
            target: AbilityTarget::Adjacent {
                scope: TargetScope::Allies,
            },
        },
    );

    let solo = create_dummy_card(1, "Solo", 1, 50).with_battle_ability(buff_adjacent);
    let enemy = create_dummy_card(2, "Enemy", 0, 50);

    let p_board = vec![CombatUnit::from_card(solo)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let any_buff = events
        .iter()
        .any(|e| matches!(e, CombatEvent::AbilityModifyStats { .. }));
    assert!(
        !any_buff,
        "Solo unit adjacent should fizzle with no neighbors"
    );
}
