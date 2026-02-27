use crate::battle::{player_permanent_status_deltas_from_events, CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_shield_blocks_ability_damage_and_consumes_status() {
    let shielded = create_dummy_card(1, "Shielded", 0, 6)
        .with_base_statuses(StatusMask::from_statuses(&[Status::Shield]));
    let sniper = create_dummy_card(2, "Sniper", 0, 4).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 4,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 0,
            },
        },
        "Opening Shot",
    ));

    let p_board = vec![CombatUnit::from_card(shielded)];
    let e_board = vec![CombatUnit::from_card(sniper)];
    let events = run_battle(&p_board, &e_board, 7);

    let blocked = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDamage {
                target_instance_id,
                damage,
                ..
            } if *target_instance_id == UnitId::player(1) && *damage == 0
        )
    });
    assert!(blocked, "Shield should block ability damage");

    let consumed = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::StatusConsumed {
                target_instance_id,
                status
            } if *target_instance_id == UnitId::player(1) && *status == Status::Shield
        )
    });
    assert!(consumed, "Shield should be consumed after blocking damage");
}

#[test]
fn test_poison_makes_clash_damage_lethal() {
    let poisonous = create_dummy_card(1, "Poison Fang", 1, 5)
        .with_base_statuses(StatusMask::from_statuses(&[Status::Poison]));
    let tank = create_dummy_card(2, "Tank", 6, 50);

    let p_board = vec![CombatUnit::from_card(poisonous)];
    let e_board = vec![CombatUnit::from_card(tank)];
    let events = run_battle(&p_board, &e_board, 11);

    let lethal_damage = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::DamageTaken {
                target_instance_id,
                remaining_hp,
                ..
            } if *target_instance_id == UnitId::enemy(1) && *remaining_hp == 0
        )
    });
    assert!(
        lethal_damage,
        "Poison clash hit should reduce target HP to zero"
    );
}

#[test]
fn test_guard_forces_enemy_random_targeting() {
    let guard = create_dummy_card(1, "Guard", 2, 6)
        .with_base_statuses(StatusMask::from_statuses(&[Status::Guard]));
    let backliner = create_dummy_card(2, "Backliner", 2, 6);
    let mage = create_dummy_card(3, "Mage", 0, 4).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::Random {
                scope: TargetScope::Enemies,
                count: 1,
            },
        },
        "Arc Bolt",
    ));

    let p_board = vec![
        CombatUnit::from_card(guard),
        CombatUnit::from_card(backliner),
    ];
    let e_board = vec![CombatUnit::from_card(mage)];
    let events = run_battle(&p_board, &e_board, 13);

    let targeted_guard = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDamage {
                target_instance_id,
                ..
            } if *target_instance_id == UnitId::player(1)
        )
    });
    assert!(
        targeted_guard,
        "Enemy random targeting should be restricted to Guard units"
    );

    let hit_non_guard = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityDamage {
                target_instance_id,
                ..
            } if *target_instance_id == UnitId::player(2)
        )
    });
    assert!(
        !hit_non_guard,
        "Non-guard ally should not be targetable while Guard exists"
    );
}

#[test]
fn test_permanent_status_deltas_extract_from_events() {
    let aura = create_dummy_card(1, "Aura", 2, 4).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::GrantStatusPermanent {
            status: Status::Shield,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        "Grant Shield",
    ));
    let enemy = create_dummy_card(2, "Enemy", 0, 6);

    let events = run_battle(
        &[CombatUnit::from_card(aura)],
        &[CombatUnit::from_card(enemy)],
        17,
    );
    let deltas = player_permanent_status_deltas_from_events(&events);

    let (grant, remove) = deltas
        .get(&UnitId::player(1))
        .expect("Expected permanent status delta for player unit");
    assert!(grant.contains(Status::Shield));
    assert!(!remove.contains(Status::Shield));
}
