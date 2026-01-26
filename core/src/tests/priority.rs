use super::*;
use crate::battle::{CombatEvent, UnitId};
use crate::types::*;

#[test]
fn test_ability_priority_by_attack() {
    // SCENARIO:
    // We have two units on the Player's team.
    // 1. "Slow Unit": 1 Attack. Placed at Index 0 (Front).
    // 2. "Fast Unit": 10 Attack. Placed at Index 1 (Back).
    //
    // EXPECTATION:
    // Even though "Slow Unit" is at the front of the array, "Fast Unit" has higher attack.
    // Therefore, "Fast Unit" must trigger its ability FIRST.

    let slow_unit = create_tester_unit(1, "SlowPoke", 1, 10, "SlowTrigger");
    let fast_unit = create_tester_unit(2, "Speedster", 10, 10, "FastTrigger");

    // Put Slow Unit first in the vector to prove array order doesn't dictate execution order
    let player_board = vec![slow_unit, fast_unit];
    let enemy_board = vec![create_dummy_enemy()];

    // Run the engine
    let events = run_battle(&player_board, &enemy_board, 12345);

    // Filter the log to find our specific triggers
    let triggers: Vec<String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name.clone())
            } else {
                None
            }
        })
        .collect();

    // Debug output to see what happened if test fails
    println!("Trigger Order: {:?}", triggers);

    // ASSERTIONS
    assert!(triggers.len() >= 2, "Both abilities should have triggered");

    let fast_index = triggers
        .iter()
        .position(|n| n == "FastTrigger")
        .expect("FastTrigger missing");
    let slow_index = triggers
        .iter()
        .position(|n| n == "SlowTrigger")
        .expect("SlowTrigger missing");

    // The Core Check: Fast must appear in the list before Slow
    assert!(
        fast_index < slow_index,
        "Priority Failure: High Attack unit (10) triggered after Low Attack unit (1).\nLog: {:?}",
        triggers
    );
}

#[test]
fn test_priority_tiebreaker_health() {
    // SCENARIO: Same Attack (5), different Health.
    // Unit A: 10 HP (Healthy)
    // Unit B: 1 HP (Fragile)
    // Expectation: High HP triggers first.

    let healthy_unit = create_tester_unit(1, "Healthy", 5, 10, "HighHP");
    let fragile_unit = create_tester_unit(2, "Fragile", 5, 1, "LowHP");

    // Put fragile first in the array to ensure sorting reorders them
    let player_board = vec![fragile_unit, healthy_unit];
    let enemy_board = vec![create_dummy_enemy()];

    let events = run_battle(&player_board, &enemy_board, 42);

    let triggers: Vec<String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name.clone())
            } else {
                None
            }
        })
        .collect();

    let high_idx = triggers
        .iter()
        .position(|n| n == "HighHP")
        .expect("HighHP missing");
    let low_idx = triggers
        .iter()
        .position(|n| n == "LowHP")
        .expect("LowHP missing");

    assert!(
        high_idx < low_idx,
        "High HP (10) should trigger before Low HP (1) when Attack is tied"
    );
}

#[test]
fn test_priority_tiebreaker_team() {
    // SCENARIO: Mirror Match.
    // Player Unit: 5 Atk, 5 HP
    // Enemy Unit:  5 Atk, 5 HP
    // Expectation: Player triggers first.

    let p_unit = create_tester_unit(1, "Player", 5, 5, "PlayerTrigger");

    // Manually create enemy with ability (since create_tester_unit defaults to Player team)
    let ability = Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::ModifyStats {
            health: 1,
            attack: 0,
            target: AbilityTarget::SelfUnit,
        },
        name: "EnemyTrigger".to_string(),
        description: "Test".to_string(),
        condition: crate::types::AbilityCondition::default(),
        max_triggers: None,
    };
    let e_card = UnitCard::new(2, "Enemy", "Enemy", 5, 5, 0, 0, false).with_ability(ability);
    let e_unit = BoardUnit::from_card(e_card);

    let p_board = vec![p_unit];
    let e_board = vec![e_unit];

    let events = run_battle(&p_board, &e_board, 42);

    let triggers: Vec<String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name.clone())
            } else {
                None
            }
        })
        .collect();

    let p_idx = triggers
        .iter()
        .position(|n| n == "PlayerTrigger")
        .expect("Player missing");
    let e_idx = triggers
        .iter()
        .position(|n| n == "EnemyTrigger")
        .expect("Enemy missing");

    assert!(
        p_idx < e_idx,
        "Player should trigger before Enemy on full stat tie"
    );
}

#[test]
fn test_priority_tiebreaker_index() {
    // SCENARIO: Absolute Tie (Stats & Team).
    // Player Unit A: 5/5, Index 0 (Front)
    // Player Unit B: 5/5, Index 1 (Back)
    // Expectation: Front Unit triggers before Back Unit.

    let front_unit = create_tester_unit(1, "Front", 5, 5, "FrontTrigger");
    let back_unit = create_tester_unit(2, "Back", 5, 5, "BackTrigger");

    // Setup board order explicitly: [Front, Back]
    let player_board = vec![front_unit, back_unit];
    let enemy_board = vec![create_dummy_enemy()];

    let events = run_battle(&player_board, &enemy_board, 42);

    let triggers: Vec<String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name.clone())
            } else {
                None
            }
        })
        .collect();

    let front_idx = triggers
        .iter()
        .position(|n| n == "FrontTrigger")
        .expect("Front missing");
    let back_idx = triggers
        .iter()
        .position(|n| n == "BackTrigger")
        .expect("Back missing");

    assert!(
        front_idx < back_idx,
        "Front unit (Index 0) should trigger before Back unit (Index 1)"
    );
}

#[test]
fn test_priority_tiebreaker_ability_order() {
    // SCENARIO: Single unit with multiple abilities.
    // Ability A: Defined first.
    // Ability B: Defined second.
    // Expectation: Ability A triggers before Ability B.

    let ability_a = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::SelfUnit,
        },
        "AbilityA",
    );

    let ability_b = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::SelfUnit,
        },
        "AbilityB",
    );

    let unit = BoardUnit::from_card(
        UnitCard::new(1, "Unit", "Unit", 5, 5, 0, 0, false)
            .with_abilities(vec![ability_a, ability_b]),
    );

    let p_board = vec![unit];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 42);

    let triggers: Vec<String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name.clone())
            } else {
                None
            }
        })
        .collect();

    let a_idx = triggers
        .iter()
        .position(|n| n == "AbilityA")
        .expect("AbilityA missing");

    let b_idx = triggers
        .iter()
        .position(|n| n == "AbilityB")
        .expect("AbilityB missing");

    assert!(
        a_idx < b_idx,
        "Ability A (defined first) should trigger before Ability B (defined second)"
    );
}

#[test]
fn test_priority_full_hierarchy_with_ability_order() {
    // HIERARCHY CHECK:
    // 1. Attack (Highest First)
    // 2. Health (Highest First)
    // 3. Team (Player First)
    // 4. Position (Front First)
    // 5. Ability Order (Defined First)

    // U1: 10 Atk (Priority 1)
    let u1 = BoardUnit::from_card(
        UnitCard::new(1, "U1", "U1", 10, 1, 0, 0, false).with_ability(create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 0,
                target: AbilityTarget::SelfUnit,
            },
            "U1",
        )),
    );

    // U2: 5 Atk, 10 HP (Priority 2)
    let u2 = create_tester_unit(2, "U2", 5, 10, "U2");

    // U3: 5 Atk, 5 HP, Player Team (Priority 3)
    let u3 = create_tester_unit(3, "U3", 5, 5, "U3");

    // U4: 5 Atk, 5 HP, Enemy Team (Priority 4)
    let u4 = BoardUnit::from_card(
        UnitCard::new(4, "U4", "U4", 5, 5, 0, 0, false).with_ability(create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 0,
                target: AbilityTarget::SelfUnit,
            },
            "U4",
        )),
    );

    // U5: 1 Atk, 1 HP, Index 0 (Priority 5 & 6)
    let ability_u5_a = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::SelfUnit,
        },
        "U5-A",
    );

    let ability_u5_b = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::SelfUnit,
        },
        "U5-B",
    );

    let u5 = BoardUnit::from_card(
        UnitCard::new(5, "U5", "U5", 1, 1, 0, 0, false)
            .with_abilities(vec![ability_u5_a, ability_u5_b]),
    );

    // U6: 1 Atk, 1 HP, Index 1 (Priority 7)
    let u6 = create_tester_unit(6, "U6", 1, 1, "U6");

    // Board Construction
    // Player: [U5, U2, U3, U6] (Positions 0, 1, 2, 3)
    // Enemy:  [U1, U4]
    let p_board = vec![u5, u2, u3, u6];
    let e_board = vec![u1, u4];

    let events = run_battle(&p_board, &e_board, 42);

    let triggers: Vec<String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name.clone())
            } else {
                None
            }
        })
        .collect();

    // EXPECTED ORDER:
    // 1. U1 (10 Atk)
    // 2. U2 (5 Atk, 10 HP)
    // 3. U3 (5 Atk, 5 HP, Player)
    // 4. U4 (5 Atk, 5 HP, Enemy)
    // 5. U5-A (1 Atk, 1 HP, Pos 0, Ability 0)
    // 6. U5-B (1 Atk, 1 HP, Pos 0, Ability 1)
    // 7. U6 (1 Atk, 1 HP, Pos 3)
    assert_eq!(triggers, vec!["U1", "U2", "U3", "U4", "U5-A", "U5-B", "U6"]);
}

#[test]
fn test_priority_full_hierarchy() {
    // HIERARCHY CHECK:
    // 1. Attack (Highest)
    // 2. Health (Highest)
    // 3. Team (Player > Enemy)
    // 4. Index (Front > Back)

    // --- 1. Attack Winner (Enemy) ---
    // U1: 10 Atk.
    let ability_u1 = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::SelfUnit,
        },
        "U1",
    );
    let u1 = BoardUnit::from_card(
        UnitCard::new(1, "U1", "U1", 10, 1, 0, 0, false).with_ability(ability_u1),
    );

    // --- 2. Health Winner (Player) ---
    // U2: 5 Atk, 10 HP.
    let u2 = create_tester_unit(2, "U2", 5, 10, "U2");

    // --- 3. Team Winner (Player) ---
    // U3: 5 Atk, 5 HP. (Beat Enemy U4 by Team)
    let u3 = create_tester_unit(3, "U3", 5, 5, "U3");

    // --- 4. Team Loser (Enemy) ---
    // U4: 5 Atk, 5 HP. (Lost to Player U3)
    let ability_u4 = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::SelfUnit,
        },
        "U4",
    );
    let u4 = BoardUnit::from_card(
        UnitCard::new(4, "U4", "U4", 5, 5, 0, 0, false).with_ability(ability_u4),
    );

    // --- 5 & 6. Index Tiebreaker (Player) ---
    // U5: 1 Atk, 1 HP. Index 2 (Front relative to U6).
    // U6: 1 Atk, 1 HP. Index 3 (Back).
    let u5 = create_tester_unit(5, "U5", 1, 1, "U5");
    let u6 = create_tester_unit(6, "U6", 1, 1, "U6");

    // Board Construction
    // Player: [U2, U3, U5, U6] -> Indices 0, 1, 2, 3
    // Enemy:  [U1, U4]
    let p_board = vec![u2, u3, u5, u6];
    let e_board = vec![u1, u4];

    let events = run_battle(&p_board, &e_board, 42);

    let triggers: Vec<String> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                Some(ability_name.clone())
            } else {
                None
            }
        })
        .collect();

    // ASSERTION:
    // U1 (10 atk)
    // U2 (5 atk, 10 hp)
    // U3 (5 atk, 5 hp, Player)
    // U4 (5 atk, 5 hp, Enemy)
    // U5 (1 atk, 1 hp, Index 2)
    // U6 (1 atk, 1 hp, Index 3)
    assert_eq!(triggers, vec!["U1", "U2", "U3", "U4", "U5", "U6"]);
}

#[test]
fn test_priority_interruption_kill() {
    // SCENARIO: "The Kill Steal"
    // Unit A (10 Atk) and Unit B (1 Atk) both try to hit the Front Enemy.
    // Front Enemy has 1 HP.
    // Unit A should go first, Kill the enemy.
    // Unit B should trigger, but fail to find a target (or hit nothing), resulting in NO Damage Event.

    let killer_ability = Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::FrontEnemy,
        },
        name: "KillShot".to_string(),
        description: "Deals 5 damage".to_string(),
        condition: crate::types::AbilityCondition::default(),
        max_triggers: None,
    };

    let slow_ability = Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::FrontEnemy,
        },
        name: "LateShot".to_string(),
        description: "Deals 5 damage".to_string(),
        condition: crate::types::AbilityCondition::default(),
        max_triggers: None,
    };

    // Construct Card A (Fast)
    let card_a = UnitCard {
        id: 1,
        template_id: "a".to_string(),
        name: "Killer".to_string(),
        stats: UnitStats {
            attack: 10,
            health: 10,
        },
        economy: EconomyStats {
            play_cost: 0,
            pitch_value: 0,
        },
        abilities: vec![killer_ability],
        is_token: false,
    };
    // Construct Card B (Slow)
    let card_b = UnitCard {
        id: 2,
        template_id: "b".to_string(),
        name: "Looter".to_string(),
        stats: UnitStats {
            attack: 1,
            health: 10,
        },
        economy: EconomyStats {
            play_cost: 0,
            pitch_value: 0,
        },
        abilities: vec![slow_ability],
        is_token: false,
    };

    // Enemy (Weak)
    let card_e = UnitCard {
        id: 3,
        template_id: "e".to_string(),
        name: "Victim".to_string(),
        stats: UnitStats {
            attack: 0,
            health: 1,
        },
        economy: EconomyStats {
            play_cost: 0,
            pitch_value: 0,
        },
        abilities: vec![],
        is_token: false,
    };

    let p_board = vec![
        BoardUnit {
            card: card_a,
            current_health: 10,
        },
        BoardUnit {
            card: card_b,
            current_health: 10,
        },
    ];
    let e_board = vec![BoardUnit {
        card: card_e,
        current_health: 1,
    }];

    let events = run_battle(&p_board, &e_board, 42);

    // 1. Verify Trigger Order
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

    assert_eq!(triggers[0], "KillShot");
    assert_eq!(triggers[1], "LateShot");

    // 2. Verify Damage Events
    // We expect exactly 1 damage event (from KillShot). LateShot should misfire because target is dead.
    let damage_events: Vec<&CombatEvent> = events
        .iter()
        .filter(|e| matches!(e, CombatEvent::AbilityDamage { .. }))
        .collect();

    assert_eq!(
        damage_events.len(),
        1,
        "There should be only 1 damage event because the victim died"
    );

    if let CombatEvent::AbilityDamage { damage, .. } = damage_events[0] {
        assert_eq!(*damage, 5); // From KillShot
    }

    // 3. Verify Death
    let deaths = events
        .iter()
        .filter(|e| matches!(e, CombatEvent::UnitDeath { .. }))
        .count();
    assert!(deaths >= 1, "Victim should have died");
}

// ==========================================
// 3. COMPLEX SCENARIO: "THE DOLPHIN & CRICKET"
// ==========================================
// This tests the Recursive Interrupt Logic.
// P: [Sniper1, Sniper2]. E: [Spawner].
// 1. Sniper1 shoots Spawner.
// 2. Spawner dies.
// 3. Spawner spawns Token. (MUST HAPPEN BEFORE SNIPER 2)
// 4. Sniper2 shoots. Must hit Token, not whiff or hit behind.

#[test]
fn test_recursive_interrupt_timing() {
    let snipe_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::FrontEnemy,
        },
        "Snipe",
    );

    let spawn_ability = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            template_id: "zombie_spawn".to_string(),
        },
        "Spawn",
    );

    let sniper1 = create_dummy_card(1, "Sniper1", 1, 2).with_ability(snipe_ability.clone());
    let sniper2 = create_dummy_card(2, "Sniper2", 1, 2).with_ability(snipe_ability);
    let spawner = create_dummy_card(3, "Spawner", 1, 1).with_ability(spawn_ability); // 1 HP, dies to snipe

    let p_board = vec![BoardUnit::from_card(sniper1), BoardUnit::from_card(sniper2)];
    let e_board = vec![BoardUnit::from_card(spawner)];

    let events = run_battle(&p_board, &e_board, 42);

    // Analyze Event Stream
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

    // Sequence must be: Snipe -> Spawn -> Snipe
    // If it is Snipe -> Snipe -> Spawn, the engine failed to interrupt.
    let first_snipe = triggers.iter().position(|&n| n == "Snipe").unwrap();
    let spawn = triggers.iter().position(|&n| n == "Spawn").unwrap();
    let last_snipe = triggers.iter().rposition(|&n| n == "Snipe").unwrap();

    assert!(first_snipe < spawn, "First snipe must occur before spawn");
    assert!(spawn < last_snipe, "Spawn must resolve before second snipe");

    // Verify the target of the second snipe
    let damage_events: Vec<&CombatEvent> = events
        .iter()
        .filter(|e| matches!(e, CombatEvent::AbilityDamage { .. }))
        .collect();

    let second_dmg_event = damage_events.last().unwrap();
    if let CombatEvent::AbilityDamage {
        target_instance_id, ..
    } = second_dmg_event
    {
        // The instance ID of a spawned unit should be the next enemy ID (e-2)
        assert!(
            *target_instance_id == UnitId::enemy(2),
            "Second snipe should hit the new unit"
        );
    }
}
