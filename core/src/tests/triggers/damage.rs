use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_fatal_damage_trigger() {
    let revenge_shot = create_ability(
        AbilityTrigger::OnHurt,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 0,
            },
        },
        "Revenge",
    );

    let martyr = create_dummy_card(1, "Martyr", 1, 1).with_battle_ability(revenge_shot);
    let killer = create_dummy_card(2, "Killer", 10, 10);

    let p_board = vec![CombatUnit::from_card(martyr)];
    let e_board = vec![CombatUnit::from_card(killer)];

    let events = run_battle(&p_board, &e_board, 42);

    let deaths = events
        .iter()
        .filter(|e| matches!(e, CombatEvent::UnitDeath { .. }))
        .count();
    assert!(deaths >= 1, "Martyr should have died");

    let triggers: Vec<&String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name)
            } else {
                None
            }
        })
        .collect();
    assert!(
        triggers.contains(&&"Revenge".to_string()),
        "Revenge ability should trigger on fatal damage"
    );

    let ability_dmg = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(1) && *damage == 5)
    });

    assert!(
        ability_dmg.is_some(),
        "Killer (e-1) should take 5 ability damage"
    );
}

#[test]
fn test_destroy_exact_health() {
    let reaper_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 0,
            },
        },
        "GrimReaper",
    );

    let reaper = create_dummy_card(1, "Reaper", 1, 1).with_battle_ability(reaper_ability);
    let victim = create_dummy_card(2, "Victim", 1, 42);

    let p_board = vec![CombatUnit::from_card(reaper)];
    let e_board = vec![CombatUnit::from_card(victim)];

    let events = run_battle(&p_board, &e_board, 42);

    let damage = events
        .iter()
        .find_map(|e| {
            if let CombatEvent::AbilityDamage {
                target_instance_id,
                damage,
                ..
            } = e
            {
                if *target_instance_id == UnitId::enemy(1) {
                    return Some(*damage);
                }
            }
            None
        })
        .expect("AbilityDamage event missing");

    assert_eq!(
        damage, 42,
        "Destroy should deal exactly the current health of the target"
    );
}
