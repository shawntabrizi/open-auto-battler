use super::*;
use crate::battle::{CombatEvent, UnitId};
use crate::types::*;

#[test]
fn test_saturating_health_underflow() {
    // SCENARIO: Unit takes more damage than it has health.
    // Health should saturate at 0, never becoming a large positive number due to wrap-around.

    let mut unit = create_board_unit(1, "Test", 5, 10);
    unit.take_damage(999); // Massive overkill
    assert_eq!(unit.effective_health(), 0, "Health should saturate at 0");
    assert!(!unit.is_alive());
}

#[test]
fn test_unit_initialization_math_safety() {
    // SCENARIO: A unit is initialized with negative health (e.g. from an effect or corrupt data).
    // It should be treated as 0 HP (dead).

    let card = create_dummy_card(1, "Zombie", 1, -10);
    let unit = BoardUnit::from_card(card);

    assert_eq!(unit.effective_health(), 0);
    assert!(!unit.is_alive());
}

#[test]
fn test_saturating_stat_buffs() {
    // SCENARIO: Massive buffs that would overflow i32.

    let buff_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: i32::MAX,
            attack: i32::MAX,
            target: AbilityTarget::SelfUnit,
        },
        "SuperBuff",
    );

    let unit_card = create_dummy_card(1, "Hero", 10, 10).with_ability(buff_ability);
    let p_board = vec![BoardUnit::from_card(unit_card)];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 42);

    // Find the stat update event
    let update = events
        .iter()
        .find_map(|e| {
            if let CombatEvent::AbilityModifyStats {
                target_instance_id,
                new_attack,
                new_health,
                ..
            } = e
            {
                if *target_instance_id == UnitId::player(1) {
                    return Some((*new_attack, *new_health));
                }
            }
            None
        })
        .expect("ModifyStats event missing");

    assert!(
        update.0 > 0,
        "Attack should be a large positive number, not wrapped around"
    );
    assert!(
        update.1 > 0,
        "Health should be a large positive number, not wrapped around"
    );
    assert_eq!(update.0, i32::MAX, "Saturating add should cap at i32::MAX");
}

#[test]
fn test_negative_attack_prevention() {
    // SCENARIO: A unit receives a massive attack debuff.
    // It should NOT heal the enemy when clashing.

    let debuff_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: -50, // Massive debuff
            target: AbilityTarget::SelfUnit,
        },
        "Weakness",
    );

    let weak_unit = create_dummy_card(1, "Weakling", 5, 10).with_ability(debuff_ability);
    let enemy = create_dummy_card(2, "Enemy", 0, 10); // 0 Atk so it doesn't kill weakling

    let p_board = vec![BoardUnit::from_card(weak_unit)];
    let e_board = vec![BoardUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify enemy health did NOT increase
    let enemy_health_updates: Vec<i32> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::DamageTaken {
                target_instance_id,
                remaining_hp,
                ..
            } = e
            {
                if *target_instance_id == UnitId::enemy(1) {
                    return Some(*remaining_hp);
                }
            }
            None
        })
        .collect();

    for hp in enemy_health_updates {
        assert!(
            hp <= 10,
            "Enemy health should never increase from a clash (got {})",
            hp
        );
    }
}
