use crate::battle::{CombatEvent, Team, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_snipe_lowest_health() {
    let headhunter_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Health,
                order: SortOrder::Ascending,
                count: 1,
            },
        },
        "SnipeLowest",
    );

    let hh = create_dummy_card(1, "Headhunter", 4, 2).with_battle_ability(headhunter_ability);

    let tank = create_dummy_card(2, "Tank", 1, 10);
    let glass = create_dummy_card(3, "Glass", 1, 2);
    let utility = create_dummy_card(4, "Utility", 1, 5);

    let p_board = vec![CombatUnit::from_card(hh)];
    let e_board = vec![
        CombatUnit::from_card(tank),
        CombatUnit::from_card(glass),
        CombatUnit::from_card(utility),
    ];

    let events = run_battle(&p_board, &e_board, 42);

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
    let giantslayer_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Attack,
                order: SortOrder::Descending,
                count: 1,
            },
        },
        "SnipeStrongest",
    );

    let gs = create_dummy_card(1, "GiantSlayer", 2, 2).with_battle_ability(giantslayer_ability);

    let weak = create_dummy_card(2, "Weak", 1, 10);
    let strong = create_dummy_card(3, "Strong", 10, 10);
    let medium = create_dummy_card(4, "Medium", 5, 10);

    let p_board = vec![CombatUnit::from_card(gs)];
    let e_board = vec![
        CombatUnit::from_card(weak),
        CombatUnit::from_card(strong),
        CombatUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

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
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Health,
                order: SortOrder::Descending,
                count: 1,
            },
        },
        "SnipeHighestHP",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_battle_ability(snipe_ability);
    let weak = create_dummy_card(2, "Weak", 1, 5);
    let healthy = create_dummy_card(3, "Healthy", 1, 20);
    let medium = create_dummy_card(4, "Medium", 1, 10);

    let p_board = vec![CombatUnit::from_card(sniper)];
    let e_board = vec![
        CombatUnit::from_card(weak),
        CombatUnit::from_card(healthy),
        CombatUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

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
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Attack,
                order: SortOrder::Ascending,
                count: 1,
            },
        },
        "SnipeLowestAtk",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_battle_ability(snipe_ability);
    let strong = create_dummy_card(2, "Strong", 10, 10);
    let weak = create_dummy_card(3, "Weak", 1, 10);
    let medium = create_dummy_card(4, "Medium", 5, 10);

    let p_board = vec![CombatUnit::from_card(sniper)];
    let e_board = vec![
        CombatUnit::from_card(strong),
        CombatUnit::from_card(weak),
        CombatUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

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
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Mana,
                order: SortOrder::Descending,
                count: 1,
            },
        },
        "SnipeHighestMana",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_battle_ability(snipe_ability);

    let cheap = UnitCard::new(CardId(2), "Cheap", 1, 10, 1, 0);
    let expensive = UnitCard::new(CardId(3), "Expensive", 1, 10, 10, 0);
    let medium = UnitCard::new(CardId(4), "Medium", 1, 10, 5, 0);

    let p_board = vec![CombatUnit::from_card(sniper)];
    let e_board = vec![
        CombatUnit::from_card(cheap),
        CombatUnit::from_card(expensive),
        CombatUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

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
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Mana,
                order: SortOrder::Ascending,
                count: 1,
            },
        },
        "SnipeLowestMana",
    );

    let sniper = create_dummy_card(1, "Sniper", 1, 1).with_battle_ability(snipe_ability);

    let expensive = UnitCard::new(CardId(2), "Expensive", 1, 10, 10, 0);
    let cheap = UnitCard::new(CardId(3), "Cheap", 1, 10, 1, 0);
    let medium = UnitCard::new(CardId(4), "Medium", 1, 10, 5, 0);

    let p_board = vec![CombatUnit::from_card(sniper)];
    let e_board = vec![
        CombatUnit::from_card(expensive),
        CombatUnit::from_card(cheap),
        CombatUnit::from_card(medium),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    let hit = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(2) && *damage == 5)
    });

    assert!(hit.is_some(), "Lowest Mana enemy should have been sniped");
}

#[test]
fn test_mana_reaper_dual_kill() {
    let reaper_ability_high = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Mana,
                order: SortOrder::Descending,
                count: 1,
            },
        },
        "Harvest",
    );
    let reaper_ability_low = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::Standard {
                scope: TargetScope::Enemies,
                stat: StatType::Mana,
                order: SortOrder::Ascending,
                count: 1,
            },
        },
        "Cull",
    );

    let reaper = create_dummy_card(1, "ManaReaper", 2, 2)
        .with_battle_abilities(vec![reaper_ability_high, reaper_ability_low]);

    let cheap = UnitCard::new(CardId(2), "Cheap", 1, 10, 1, 0);
    let medium = UnitCard::new(CardId(3), "Medium", 1, 10, 5, 0);
    let expensive = UnitCard::new(CardId(4), "Expensive", 1, 10, 10, 0);

    let p_board = vec![CombatUnit::from_card(reaper)];
    let e_board = vec![
        CombatUnit::from_card(cheap),
        CombatUnit::from_card(medium),
        CombatUnit::from_card(expensive),
    ];

    let events = run_battle(&p_board, &e_board, 42);

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
