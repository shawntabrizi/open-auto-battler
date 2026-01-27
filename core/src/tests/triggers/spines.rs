use crate::battle::{CombatEvent, Team, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_spined_urchin_retribution() {
    let spines_ability = create_ability(
        AbilityTrigger::OnHurt,
        AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
        "Spines",
    );

    let urchin = create_dummy_card(1, "Spined Urchin", 1, 4).with_ability(spines_ability);
    let wolf = create_dummy_card(2, "Wolf Rider", 3, 2);

    let p_board = vec![BoardUnit::from_card(urchin)];
    let e_board = vec![BoardUnit::from_card(wolf)];

    let events = run_battle(&p_board, &e_board, 42);

    let urchin_clash_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::DamageTaken { target_instance_id, team, remaining_hp, .. }
            if *target_instance_id == UnitId::player(1) && *team == Team::Player && *remaining_hp == 1)
    });
    assert!(
        urchin_clash_hit,
        "Urchin should have taken 3 damage from clash"
    );

    let spines_trigger = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityTrigger { source_instance_id, ability_name, .. }
            if *source_instance_id == UnitId::player(1) && ability_name == "Spines")
    });
    assert!(spines_trigger, "Spines should have triggered");

    let wolf_spines_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { source_instance_id, target_instance_id, damage, .. }
            if *source_instance_id == UnitId::player(1) && *target_instance_id == UnitId::enemy(1) && *damage == 1)
    });
    assert!(
        wolf_spines_hit,
        "Wolf should have taken 1 damage from Spines"
    );

    let wolf_death = events
        .iter()
        .any(|e| matches!(e, CombatEvent::UnitDeath { team, .. } if *team == Team::Enemy));
    assert!(wolf_death, "Wolf Rider should have died");
}

#[test]
fn test_spined_urchin_self_harm_retribution() {
    let bomber_ability = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::All {
                scope: TargetScope::All,
            },
        },
        "Blast",
    );
    let spines_ability = create_ability(
        AbilityTrigger::OnHurt,
        AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
        "Spines",
    );

    let bomber = create_dummy_card(1, "Bomber", 10, 1).with_ability(bomber_ability);
    let urchin = create_dummy_card(2, "Urchin", 1, 4).with_ability(spines_ability);
    let enemy = create_dummy_card(3, "Enemy", 1, 10);

    let p_board = vec![BoardUnit::from_card(bomber), BoardUnit::from_card(urchin)];
    let e_board = vec![BoardUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let urchin_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { source_instance_id, target_instance_id, damage, .. }
            if *source_instance_id == UnitId::player(1) && *target_instance_id == UnitId::player(2) && *damage == 3)
    });
    assert!(urchin_hit, "Urchin should have taken damage from Bomber");

    let spines_trigger = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityTrigger { source_instance_id, ability_name, .. }
            if *source_instance_id == UnitId::player(2) && ability_name == "Spines")
    });
    assert!(spines_trigger, "Spines should have triggered");
}