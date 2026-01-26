use crate::battle::{CombatEvent, Team, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_spined_urchin_retribution() {
    // P: [Spined Urchin (4 HP, 1 Atk)]
    // E: [Wolf Rider (2 HP, 3 Atk)]
    // Clash:
    // Urchin takes 3 damage.
    // Urchin's Spines triggers, deals 1 damage to Wolf Rider.
    // Result:
    // Urchin: 4 - 3 = 1 HP
    // Wolf Rider: 2 - 1 (clash) - 1 (spines) = 0 HP (Dead)

    let spines_ability = create_ability(
        AbilityTrigger::OnDamageTaken,
        AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::TriggerTarget,
        },
        "Spines",
    );

    let urchin = create_dummy_card(1, "Spined Urchin", 1, 4).with_ability(spines_ability);
    let wolf = create_dummy_card(2, "Wolf Rider", 3, 2);

    let p_board = vec![BoardUnit::from_card(urchin)];
    let e_board = vec![BoardUnit::from_card(wolf)];

    let events = run_battle(&p_board, &e_board, 42);

    // 1. Verify Urchin took 3 damage from clash
    let urchin_clash_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::DamageTaken { target_instance_id, team, remaining_hp, .. }
            if *target_instance_id == UnitId::player(1) && *team == Team::Player && *remaining_hp == 1)
    });
    assert!(
        urchin_clash_hit,
        "Urchin should have taken 3 damage from clash"
    );

    // 2. Verify Spines triggered
    let spines_trigger = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityTrigger { source_instance_id, ability_name, .. }
            if *source_instance_id == UnitId::player(1) && ability_name == "Spines")
    });
    assert!(spines_trigger, "Spines should have triggered");

    // 3. Verify Wolf took 1 damage from Spines
    let wolf_spines_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { source_instance_id, target_instance_id, damage, .. }
            if *source_instance_id == UnitId::player(1) && *target_instance_id == UnitId::enemy(1) && *damage == 1)
    });
    assert!(
        wolf_spines_hit,
        "Wolf should have taken 1 damage from Spines"
    );

    // 4. Verify Wolf died
    let wolf_death = events
        .iter()
        .any(|e| matches!(e, CombatEvent::UnitDeath { team, .. } if *team == Team::Enemy));
    assert!(wolf_death, "Wolf Rider should have died");
}

#[test]
fn test_spined_urchin_self_harm_retribution() {
    // P: [Abyssal Bomber (Dying), Spined Urchin (4 HP)]
    // Bomber dies, deals 3 damage to Urchin.
    // Urchin's Spines triggers, deals 1 damage back to Bomber (who is dead).
    // Result:
    // Urchin: 4 - 3 = 1 HP.
    // Bomber: Already dead, nothing happens.

    let bomber_ability = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::AllUnits,
        },
        "Blast",
    );
    let spines_ability = create_ability(
        AbilityTrigger::OnDamageTaken,
        AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::TriggerTarget,
        },
        "Spines",
    );

    let bomber = create_dummy_card(1, "Bomber", 10, 1).with_ability(bomber_ability);
    let urchin = create_dummy_card(2, "Urchin", 1, 4).with_ability(spines_ability);
    let enemy = create_dummy_card(3, "Enemy", 1, 10);

    let p_board = vec![BoardUnit::from_card(bomber), BoardUnit::from_card(urchin)];
    let e_board = vec![BoardUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify Urchin took damage from Bomber
    let urchin_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { source_instance_id, target_instance_id, damage, .. }
            if *source_instance_id == UnitId::player(1) && *target_instance_id == UnitId::player(2) && *damage == 3)
    });
    assert!(urchin_hit, "Urchin should have taken damage from Bomber");

    // Verify Spines triggered targeting Bomber
    let spines_trigger = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityTrigger { source_instance_id, ability_name, .. }
            if *source_instance_id == UnitId::player(2) && ability_name == "Spines")
    });
    assert!(spines_trigger, "Spines should have triggered");

    // Damage to dead bomber won't emit an AbilityDamage event because the unit is gone from the board.
    // But we can verify it didn't crash and the trigger happened.
}
