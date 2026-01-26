use crate::battle::{CombatEvent, Team, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_snipe_lowest_health() {
    // P: [Headhunter]. Ability: OnStart -> 5 dmg to LowestHealthEnemy.
    // E: [Tank (10 HP), Glass (2 HP), Utility (5 HP)].
    // Result: Glass should take 5 damage and die.

    let headhunter_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::LowestHealthEnemy,
        },
        "SnipeLowest",
    );

    let hh = create_dummy_card(1, "Headhunter", 4, 2).with_ability(headhunter_ability);

    let tank = create_dummy_card(2, "Tank", 1, 10);
    let glass = create_dummy_card(3, "Glass", 1, 2);
    let utility = create_dummy_card(4, "Utility", 1, 5);

    let p_board = vec![BoardUnit::from_card(hh)];
    let e_board = vec![
        BoardUnit::from_card(tank),
        BoardUnit::from_card(glass),
        BoardUnit::from_card(utility),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify "Glass" (e-3) died
    let glass_death = events.iter().find(|e| {
        if let CombatEvent::UnitDeath {
            team,
            new_board_state,
        } = e
        {
            *team == Team::Enemy && !new_board_state.iter().any(|u| u.name == "Glass")
        } else {
            false
        }
    });

    assert!(
        glass_death.is_some(),
        "Glass cannon should have been sniped and killed"
    );
}

#[test]
fn test_snipe_highest_attack() {
    // P: [GiantSlayer]. Ability: OnStart -> 3 dmg to HighestAttackEnemy.
    // E: [Weak (1 Atk), Strong (10 Atk), Medium (5 Atk)].
    // Result: Strong should take 3 damage.

    let giantslayer_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::HighestAttackEnemy,
        },
        "SnipeStrongest",
    );

    let gs = create_dummy_card(1, "GiantSlayer", 2, 2).with_ability(giantslayer_ability);

    let weak = create_dummy_card(2, "Weak", 1, 10);
    let strong = create_dummy_card(3, "Strong", 10, 10);
    let medium = create_dummy_card(4, "Medium", 5, 10);

    let p_board = vec![BoardUnit::from_card(gs)];
    let e_board = vec![
        BoardUnit::from_card(weak),
        BoardUnit::from_card(strong),
        BoardUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify "Strong" (e-2) took 3 damage
    let strong_hit = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(2) && *damage == 3)
    });

    assert!(
        strong_hit.is_some(),
        "Strong enemy should have been sniped for 3 damage"
    );
}

#[test]
fn test_snipe_highest_health() {
    let snipe_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::HighestHealthEnemy,
        },
        "SnipeHighestHP",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);
    let weak = create_dummy_card(2, "Weak", 1, 5);
    let healthy = create_dummy_card(3, "Healthy", 1, 20);
    let medium = create_dummy_card(4, "Medium", 1, 10);

    let p_board = vec![BoardUnit::from_card(sniper)];
    let e_board = vec![
        BoardUnit::from_card(weak),
        BoardUnit::from_card(healthy),
        BoardUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify "Healthy" (e-2) took damage
    let hit = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(2) && *damage == 5)
    });

    assert!(hit.is_some(), "Highest HP enemy should have been sniped");
}

#[test]
fn test_snipe_lowest_attack() {
    let snipe_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::LowestAttackEnemy,
        },
        "SnipeLowestAtk",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);
    let strong = create_dummy_card(2, "Strong", 10, 10);
    let weak = create_dummy_card(3, "Weak", 1, 10);
    let medium = create_dummy_card(4, "Medium", 5, 10);

    let p_board = vec![BoardUnit::from_card(sniper)];
    let e_board = vec![
        BoardUnit::from_card(strong),
        BoardUnit::from_card(weak),
        BoardUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify "Weak" (e-2) took damage
    let hit = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(2) && *damage == 5)
    });

    assert!(hit.is_some(), "Lowest Atk enemy should have been sniped");
}

#[test]
fn test_snipe_highest_mana() {
    let snipe_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::HighestManaEnemy,
        },
        "SnipeHighestMana",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);

    // Manual units with specific costs
    let cheap = UnitCard::new(2, "Cheap", "Cheap", 1, 10, 1, 0, false);
    let expensive = UnitCard::new(3, "Expensive", "Expensive", 1, 10, 10, 0, false);
    let medium = UnitCard::new(4, "Medium", "Medium", 1, 10, 5, 0, false);

    let p_board = vec![BoardUnit::from_card(sniper)];
    let e_board = vec![
        BoardUnit::from_card(cheap),
        BoardUnit::from_card(expensive),
        BoardUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify "Expensive" (e-2) took damage
    let hit = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(2) && *damage == 5)
    });

    assert!(hit.is_some(), "Highest Mana enemy should have been sniped");
}

#[test]
fn test_snipe_lowest_mana() {
    let snipe_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::LowestManaEnemy,
        },
        "SnipeLowestMana",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);

    // Manual units with specific costs
    let expensive = UnitCard::new(2, "Expensive", "Expensive", 1, 10, 10, 0, false);
    let cheap = UnitCard::new(3, "Cheap", "Cheap", 1, 10, 1, 0, false);
    let medium = UnitCard::new(4, "Medium", "Medium", 1, 10, 5, 0, false);

    let p_board = vec![BoardUnit::from_card(sniper)];
    let e_board = vec![
        BoardUnit::from_card(expensive),
        BoardUnit::from_card(cheap),
        BoardUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify "Cheap" (e-2) took damage
    let hit = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(2) && *damage == 5)
    });

    assert!(hit.is_some(), "Lowest Mana enemy should have been sniped");
}

#[test]
fn test_mana_reaper_dual_kill() {
    // P: [ManaReaper]. Abilities: 1. Destroy HighestMana, 2. Destroy LowestMana
    // E: [Cheap (1 Mana), Medium (5 Mana), Expensive (10 Mana)]
    // Result: Cheap and Expensive should both die.

    let reaper_ability_high = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::HighestManaEnemy,
        },
        "Harvest",
    );
    let reaper_ability_low = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::LowestManaEnemy,
        },
        "Cull",
    );

    let reaper = create_dummy_card(1, "ManaReaper", 2, 2)
        .with_abilities(vec![reaper_ability_high, reaper_ability_low]);

    let cheap = UnitCard::new(2, "Cheap", "Cheap", 1, 10, 1, 0, false);
    let medium = UnitCard::new(3, "Medium", "Medium", 1, 10, 5, 0, false);
    let expensive = UnitCard::new(4, "Expensive", "Expensive", 1, 10, 10, 0, false);

    let p_board = vec![BoardUnit::from_card(reaper)];
    let e_board = vec![
        BoardUnit::from_card(cheap),
        BoardUnit::from_card(medium),
        BoardUnit::from_card(expensive),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    // Analyze deaths
    let dead_units: Vec<_> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityDamage {
                target_instance_id, ..
            } = e
            {
                return Some(target_instance_id.clone());
            }
            None
        })
        .collect();

    // Expensive is e-3, Cheap is e-1.
    assert!(
        dead_units.contains(&UnitId::enemy(1)),
        "Cheap unit should be dead"
    );
    assert!(
        dead_units.contains(&UnitId::enemy(3)),
        "Expensive unit should be dead"
    );
    assert!(
        !dead_units.contains(&UnitId::enemy(2)),
        "Medium unit should be alive"
    );
}
