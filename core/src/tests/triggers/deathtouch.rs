use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

/// Deathtouch: AfterUnitAttack → Destroy the clash target via TriggerSource.
/// A low-attack scorpion with deathtouch should kill a high-HP tank.
#[test]
fn test_deathtouch_after_unit_attack_destroys_clash_target() {
    let deathtouch = create_ability(
        AbilityTrigger::AfterUnitAttack,
        AbilityEffect::Destroy {
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
    );

    // Scorpion: 1 ATK, 5 HP — survives the tank's 1-damage clash hit.
    let scorpion = create_dummy_card(1, "Scorpion", 1, 5).with_battle_ability(deathtouch);
    // Tank: 1 ATK, 50 HP — would take many rounds to kill normally.
    let tank = create_dummy_card(2, "Tank", 1, 50);

    let p_board = vec![CombatUnit::from_card(scorpion)];
    let e_board = vec![CombatUnit::from_card(tank)];

    let events = run_battle(&p_board, &e_board, 42);

    // AfterUnitAttack fires for the surviving scorpion, targeting the tank
    // via TriggerSource (the clash opponent). Destroy deals fatal damage.
    let tank_destroyed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDamage {
                source_instance_id,
                target_instance_id,
                remaining_hp,
                ..
            } if *source_instance_id == UnitId::player(1)
                && *target_instance_id == UnitId::enemy(1)
                && *remaining_hp == 0
        )
    });
    assert!(
        tank_destroyed,
        "Deathtouch should destroy the tank via AfterUnitAttack"
    );

    // Scorpion should win
    let victory = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::BattleEnd {
                result: crate::battle::BattleResult::Victory,
            }
        )
    });
    assert!(victory, "Scorpion should win via deathtouch");
}

/// Deathtouch should fizzle if the clash target already died from clash damage.
#[test]
fn test_deathtouch_fizzles_if_target_already_dead() {
    let deathtouch = create_ability(
        AbilityTrigger::AfterUnitAttack,
        AbilityEffect::Destroy {
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
    );

    // Scorpion has 10 attack — enough to kill the enemy from clash damage alone.
    let scorpion = create_dummy_card(1, "Scorpion", 10, 10).with_battle_ability(deathtouch.clone());
    let weak = create_dummy_card(2, "Weakling", 1, 5);

    let p_board = vec![CombatUnit::from_card(scorpion)];
    let e_board = vec![CombatUnit::from_card(weak)];

    let events = run_battle(&p_board, &e_board, 42);

    // Enemy dies from clash damage (5 HP - 10 ATK = dead). Destroy fizzles (unit gone).
    // No AbilityDamage from scorpion's ability should target the dead enemy.
    let ability_hit_dead = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDamage {
                source_instance_id,
                target_instance_id,
                ..
            } if *source_instance_id == UnitId::player(1)
                && *target_instance_id == UnitId::enemy(1)
        )
    });
    assert!(
        !ability_hit_dead,
        "Destroy should fizzle if enemy already died from clash damage"
    );

    // Scorpion should win
    let victory = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::BattleEnd {
                result: crate::battle::BattleResult::Victory,
            }
        )
    });
    assert!(victory, "Scorpion should win since enemy is dead");
}

/// BeforeUnitAttack should also receive the clash target.
#[test]
fn test_before_unit_attack_has_clash_target() {
    let pre_strike = create_ability(
        AbilityTrigger::BeforeUnitAttack,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
    );

    let striker = create_dummy_card(1, "Striker", 1, 5).with_battle_ability(pre_strike);
    let target = create_dummy_card(2, "Target", 1, 10);

    let p_board = vec![CombatUnit::from_card(striker)];
    let e_board = vec![CombatUnit::from_card(target)];

    let events = run_battle(&p_board, &e_board, 42);

    // BeforeUnitAttack should deal 3 damage to the enemy front (clash target)
    let pre_hit = events.iter().any(|e| {
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
        pre_hit,
        "BeforeUnitAttack should damage the clash target via TriggerSource"
    );
}
