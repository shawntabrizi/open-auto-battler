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
    // via TriggerSource (the clash opponent). Destroy sets HP to 0.
    let tank_destroyed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDestroy {
                source_instance_id,
                target_instance_id,
            } if *source_instance_id == UnitId::player(1)
                && *target_instance_id == UnitId::enemy(1)
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
            CombatEvent::AbilityDestroy {
                source_instance_id,
                target_instance_id,
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

/// A 1/1 scorpion dies from the clash but its AfterUnitAttack still fires
/// (from the dead list), destroying the high-HP tank. Both die → draw.
#[test]
fn test_deathtouch_fires_even_when_scorpion_dies() {
    let deathtouch = create_ability(
        AbilityTrigger::AfterUnitAttack,
        AbilityEffect::Destroy {
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
    );

    let scorpion = create_dummy_card(1, "Scorpion", 1, 1).with_battle_ability(deathtouch);
    let tank = create_dummy_card(2, "Tank", 1, 50);

    let p_board = vec![CombatUnit::from_card(scorpion)];
    let e_board = vec![CombatUnit::from_card(tank)];

    let events = run_battle(&p_board, &e_board, 42);

    // The tank should be destroyed by deathtouch even though scorpion died
    let tank_destroyed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDestroy {
                source_instance_id,
                target_instance_id,
            } if *source_instance_id == UnitId::player(1)
                && *target_instance_id == UnitId::enemy(1)
        )
    });
    assert!(
        tank_destroyed,
        "Deathtouch should destroy the tank even when scorpion dies in the clash"
    );

    // Both die → draw
    let draw = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::BattleEnd {
                result: crate::battle::BattleResult::Draw,
            }
        )
    });
    assert!(draw, "Battle should be a draw since both units die");
}

/// Dead scorpion with both AfterUnitAttack and OnFaint — both fire from dead state.
#[test]
fn test_dead_unit_after_unit_attack_and_on_faint_both_fire() {
    let deathtouch = create_ability(
        AbilityTrigger::AfterUnitAttack,
        AbilityEffect::Destroy {
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
    );
    let on_faint_buff = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 5,
            target: AbilityTarget::All {
                scope: TargetScope::Allies,
            },
        },
    );

    let scorpion = create_dummy_card(1, "Scorpion", 1, 1)
        .with_battle_abilities(vec![deathtouch, on_faint_buff]);
    let ally = create_dummy_card(2, "Ally", 1, 50);
    let tank = create_dummy_card(3, "Tank", 1, 50);

    let p_board = vec![CombatUnit::from_card(scorpion), CombatUnit::from_card(ally)];
    let e_board = vec![CombatUnit::from_card(tank)];

    let events = run_battle(&p_board, &e_board, 42);

    // AfterUnitAttack should fire (ability 0)
    let deathtouch_fired = has_ability_trigger(&events, UnitId::player(1), 0);
    assert!(
        deathtouch_fired,
        "AfterUnitAttack should fire from dead scorpion"
    );

    // OnFaint should fire (ability 1)
    let faint_fired = has_ability_trigger(&events, UnitId::player(1), 1);
    assert!(faint_fired, "OnFaint should fire from dead scorpion");
}

/// Both front units have deathtouch. Both die from clash. Both fire. Draw.
#[test]
fn test_both_sides_deathtouch_mutual_kill() {
    let deathtouch = create_ability(
        AbilityTrigger::AfterUnitAttack,
        AbilityEffect::Destroy {
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
    );

    let p_scorpion =
        create_dummy_card(1, "P-Scorpion", 1, 5).with_battle_ability(deathtouch.clone());
    let e_scorpion = create_dummy_card(2, "E-Scorpion", 1, 5).with_battle_ability(deathtouch);

    let p_board = vec![CombatUnit::from_card(p_scorpion)];
    let e_board = vec![CombatUnit::from_card(e_scorpion)];

    let events = run_battle(&p_board, &e_board, 42);

    // Both deathtouch abilities should fire
    let p_fired = has_ability_trigger(&events, UnitId::player(1), 0);
    let e_fired = has_ability_trigger(&events, UnitId::enemy(1), 0);
    assert!(p_fired, "Player scorpion deathtouch should fire");
    assert!(e_fired, "Enemy scorpion deathtouch should fire");

    let draw = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::BattleEnd {
                result: crate::battle::BattleResult::Draw,
            }
        )
    });
    assert!(draw, "Mutual deathtouch should result in draw");
}

/// Front unit dies in clash, support unit has AfterAnyAttack — it still fires.
#[test]
fn test_after_any_attack_fires_for_support_with_dead_front() {
    let after_any = create_ability(
        AbilityTrigger::AfterAnyAttack,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 3,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );

    let front = create_dummy_card(1, "Front", 1, 1); // dies from clash
    let support = create_dummy_card(2, "Support", 1, 50).with_battle_ability(after_any);
    let enemy = create_dummy_card(3, "Enemy", 1, 50);

    let p_board = vec![CombatUnit::from_card(front), CombatUnit::from_card(support)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Support's AfterAnyAttack should fire even though front died
    let support_fired = has_ability_trigger(&events, UnitId::player(2), 0);
    assert!(
        support_fired,
        "Support AfterAnyAttack should fire even when front unit dies"
    );
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
