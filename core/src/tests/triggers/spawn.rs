use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_warder_seal_fate() {
    // SCENARIO: [Warder (2/4)] on Player team.
    // Enemy has [Rat Swarm (1/1)].
    // Rat Swarm dies -> Spawns Rat Token (1/1).
    // Warder should trigger and deal 1 damage to the Rat Token -> Rat Token dies immediately.

    let warder = create_dummy_card(1, "Warder", 2, 4).with_ability(Ability {
        trigger: AbilityTrigger::OnEnemySpawn,
        effect: AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::TriggerTarget,
        },
        name: "Seal Fate".to_string(),
        description: "Damage enemies on spawn".to_string(),
        condition: AbilityCondition::None,
        max_triggers: None,
    });

    let rat_swarm = create_dummy_card(2, "Rat Swarm", 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            template_id: "rat_token".to_string(),
        },
        name: "Infestation".to_string(),
        description: "Spawn token on death".to_string(),
        condition: AbilityCondition::None,
        max_triggers: None,
    });

    let p_board = vec![BoardUnit::from_card(warder)];
    let e_board = vec![BoardUnit::from_card(rat_swarm)];

    let events = run_battle(&p_board, &e_board, 42);

    // Analyze events:
    // 1. Rat Swarm (e-1) dies.
    // 2. UnitSpawn (rat_token, e-3).
    // 3. AbilityTrigger (Warder p-1, Seal Fate).
    // 4. AbilityDamage (target e-3, 1 Dmg).
    // 5. UnitDeath (rat_token).

    let trigger_event = events.iter().find(|e| {
        matches!(e, CombatEvent::AbilityTrigger { source_instance_id, ability_name }
                if *source_instance_id == UnitId::player(1) && ability_name == "Seal Fate")
    });

    assert!(
        trigger_event.is_some(),
        "Warder should have triggered Seal Fate"
    );

    let damage_event = events.iter().find(|e| {
        if let CombatEvent::AbilityDamage {
            source_instance_id,
            damage,
            ..
        } = e
        {
            *source_instance_id == UnitId::player(1) && *damage == 1
        } else {
            false
        }
    });

    assert!(damage_event.is_some(), "Warder should have dealt 1 damage");
}

#[test]
fn test_necromancer_spawn_boost() {
    // SCENARIO: [Rat Swarm (1/1), Necromancer (2/3)].
    // Necromancer has OnAllySpawn -> Give +2 Atk to TriggerTarget.
    // Rat Swarm dies -> Spawns Rat Token (1/1).
    // Necromancer should trigger and give Rat Token +2 Atk -> Rat Token is now 3/1.

    let rat_swarm = create_dummy_card(1, "Rat Swarm", 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            template_id: "rat_token".to_string(),
        },
        name: "Infestation".to_string(),
        description: "Spawn token on death".to_string(),
        condition: AbilityCondition::None,
        max_triggers: None,
    });

    let necromancer = create_dummy_card(2, "Necromancer", 2, 3).with_ability(Ability {
        trigger: AbilityTrigger::OnAllySpawn,
        effect: AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::TriggerTarget,
        },
        name: "Spawn Boost".to_string(),
        description: "Buff spawned units".to_string(),
        condition: AbilityCondition::None,
        max_triggers: None,
    });

    let p_board = vec![
        BoardUnit::from_card(rat_swarm),
        BoardUnit::from_card(necromancer),
    ];

    // Enemy killer
    let killer = create_dummy_card(3, "Killer", 10, 10);
    let e_board = vec![BoardUnit::from_card(killer)];

    let events = run_battle(&p_board, &e_board, 42);

    // Analyze events:
    // 1. Rat Swarm (p-1) dies.
    // 2. UnitSpawn (rat_token, p-4).
    // 3. AbilityTrigger (Necromancer p-2, Spawn Boost).
    // 4. AbilityModifyStats (target p-4, +2 Atk).

    let buff_event = events.iter().find(|e| {
        if let CombatEvent::AbilityModifyStats {
            source_instance_id,
            attack_change,
            ..
        } = e
        {
            // source is Necromancer (p-2), target is new Rat Token (p-4? usually next ID)
            // Actually, let's just check if ANY buff from Necromancer to someone else (+2 atk) exists.
            *source_instance_id == UnitId::player(2) && *attack_change == 2
        } else {
            false
        }
    });

    assert!(
        buff_event.is_some(),
        "Necromancer should have triggered Spawn Boost"
    );

    if let Some(CombatEvent::AbilityModifyStats {
        target_instance_id,
        new_attack,
        ..
    }) = buff_event
    {
        assert_eq!(
            *new_attack, 3,
            "Rat Token should have 3 attack (1 base + 2 buff)"
        );
        // Verify it didn't target itself
        assert_ne!(*target_instance_id, UnitId::player(2));
    }
}

// ==========================================
// 5. INDEX PRESERVATION TEST
// ==========================================
// When a unit in the middle dies and spawns, the token must appear
// at that specific index, not at the front or back.

#[test]
fn test_spawn_index_preservation() {
    let spawn_ability = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            template_id: "zombie_spawn".to_string(),
        },
        "Spawn",
    );

    // FIX: Give units Attack (5) so they kill each other and end the battle loop
    let tank = create_dummy_card(1, "Tank", 5, 10);
    let spawner = create_dummy_card(2, "Spawner", 0, 1).with_ability(spawn_ability);
    let backline = create_dummy_card(3, "Backline", 5, 10);

    let p_board = vec![
        BoardUnit::from_card(tank),
        BoardUnit::from_card(spawner),
        BoardUnit::from_card(backline),
    ];

    // Enemy: AoE Killer
    let aoe_killer = create_dummy_card(4, "AoE", 5, 10).with_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::AllEnemies,
        },
        "Bomb",
    ));
    let e_board = vec![BoardUnit::from_card(aoe_killer)];

    let events = run_battle(&p_board, &e_board, 42);

    // Find the UnitSpawn event
    let spawn_event = events
        .iter()
        .find(|e| matches!(e, CombatEvent::UnitSpawn { .. }))
        .unwrap();

    if let CombatEvent::UnitSpawn {
        new_board_state, ..
    } = spawn_event
    {
        // Check the snapshot in the event.
        // Expected: Tank (Alive), Spawned (Alive), Backline (Alive)
        assert_eq!(new_board_state.len(), 3);
        assert_eq!(new_board_state[0].name, "Tank");
        assert_eq!(new_board_state[1].name, "Zombie Spawn"); // Should be middle
        assert_eq!(new_board_state[2].name, "Backline");
    }
}

#[test]
fn test_sacrifice_combo() {
    // Setup: [Fodder, Lich, Corpse Cart]

    // Fodder: Just a unit.
    let fodder = create_dummy_card(1, "Fodder", 1, 1);

    // Lich: 1. Destroy(AllyAhead), 2. SpawnUnit("golem")
    let lich_destroy = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::AllyAhead,
        },
        "Ritual",
    );
    let lich_spawn = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            template_id: "golem".to_string(),
        },
        "Raise",
    );
    let lich = create_dummy_card(2, "Lich", 3, 3).with_abilities(vec![lich_destroy, lich_spawn]);

    // Corpse Cart: OnAllyFaint -> Buff Self
    let cart_ability = create_ability(
        AbilityTrigger::OnAllyFaint,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::SelfUnit,
        },
        "Scavenge",
    );
    let corpse_cart = create_dummy_card(3, "Cart", 0, 4).with_ability(cart_ability);

    let p_board = vec![
        BoardUnit::from_card(fodder),
        BoardUnit::from_card(lich),
        BoardUnit::from_card(corpse_cart),
    ];
    let e_board = vec![create_dummy_enemy()]; // Sandbag

    let events = run_battle(&p_board, &e_board, 42);

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

    // Checks
    assert!(
        triggers.contains(&&"Ritual".to_string()),
        "Lich should trigger Ritual"
    );
    assert!(
        triggers.contains(&&"Raise".to_string()),
        "Lich should trigger Raise"
    );
    assert!(
        triggers.contains(&&"Scavenge".to_string()),
        "Corpse Cart should trigger Scavenge"
    );

    // Check spawn
    let spawn_event = events
        .iter()
        .find(|e| matches!(e, CombatEvent::UnitSpawn { .. }));
    assert!(spawn_event.is_some(), "Golem should have spawned");
}

#[test]
fn test_damage_taken_no_slide_trigger() {
    // SCENARIO: Unit dies, next unit slides forward. Slid unit should NOT trigger OnDamageTaken.
    // P: [Fodder (1/1), Breeder (2/4)]. Breeder has OnDamageTaken -> Spawn.
    // E: [Killer (0/10)]. (Use 0 attack so Breeder survives if it somehow gets hit)
    // Clash: Fodder dies. Breeder slides to Index 0.
    // BUG: Breeder triggers because it's now at Index 0.
    // FIX: Breeder should NOT trigger.

    let spawn_ability = create_ability(
        AbilityTrigger::OnDamageTaken,
        AbilityEffect::SpawnUnit {
            template_id: "zombie_spawn".to_string(),
        },
        "Breed",
    );

    let fodder = create_dummy_card(1, "Fodder", 1, 1);
    let breeder = create_dummy_card(2, "Breeder", 2, 4).with_ability(spawn_ability);
    let killer = create_dummy_card(3, "Killer", 0, 10);

    let p_board = vec![BoardUnit::from_card(fodder), BoardUnit::from_card(breeder)];
    let e_board = vec![BoardUnit::from_card(killer)];

    let events = run_battle(&p_board, &e_board, 42);

    // Analyze triggers
    let breed_triggers: Vec<_> = events
            .iter()
            .filter(|e| {
                matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Breed")
            })
            .collect();

    if breed_triggers.len() > 0 {
        println!(
            "DEBUG: Found {} unexpected breed triggers",
            breed_triggers.len()
        );

        for event in &events {
            println!("DEBUG EVENT: {:?}", event);
        }
    }

    assert_eq!(
        breed_triggers.len(),
        0,
        "Breeder should NOT trigger because it just slid forward, it wasn't hit."
    );
}

#[test]
fn test_spawn_id_uniqueness_and_buffs() {
    // SCENARIO: Multiple spawns followed by an "All Allies" buff.
    // We must ensure every unit gets a unique ID so the buff is applied exactly once per unit.

    // 1. Spawner: 10 Atk (Goes first). Spawns two units.
    let spawn_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            template_id: "zombie_spawn".to_string(),
        },
        "Spawn",
    );
    let spawner = create_dummy_card(1, "Spawner", 10, 10)
        .with_abilities(vec![spawn_ability.clone(), spawn_ability]);

    // 2. Buffer: 5 Atk (Goes second). Buffs all allies +2 Atk.
    let buff_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::AllAllies,
        },
        "BuffAll",
    );
    let buffer = create_dummy_card(2, "Buffer", 5, 10).with_ability(buff_ability);

    let p_board = vec![BoardUnit::from_card(spawner), BoardUnit::from_card(buffer)];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 42);

    // Verify final attack of one of the spawned units.
    // It starts at 1. Should be 3 after receiving ONE buff.
    // If IDs collided, it might be 5 (double buffed).

    let spawn_final_atk = events.iter().rev().find_map(|e| {
        if let CombatEvent::UnitSpawn { spawned_unit, .. } = e {
            // We want to find the latest state of this unit in the events
            let id = &spawned_unit.instance_id;
            // Search for the last AbilityModifyStats for this ID
            return events.iter().rev().find_map(|e2| {
                if let CombatEvent::AbilityModifyStats {
                    target_instance_id,
                    new_attack,
                    ..
                } = e2
                {
                    if target_instance_id == id {
                        return Some(*new_attack);
                    }
                }
                None
            });
        }
        None
    });

    assert_eq!(spawn_final_atk, Some(3), "Spawned unit should have 3 attack (1 base + 2 buff). If it's 5, it was double buffed due to ID collision.");
}

#[test]
fn test_spawn_limit_logic() {
    // Player has full board. One unit dies.
    // That unit has an ability to spawn *two* tokens.
    // Result should be: Unit dies (opens 1 slot). 1 Token spawns (fills slot). 2nd Token fizzles.

    let multi_spawn = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            template_id: "zombie_spawn".to_string(),
        },
        "MultiSpawn",
    );

    // Unit has the ability twice
    let captain = create_dummy_card(1, "Captain", 1, 1)
        .with_abilities(vec![multi_spawn.clone(), multi_spawn]);

    let filler = create_dummy_card(2, "Filler", 1, 10);

    // Board: [Captain, Filler, Filler, Filler, Filler] (Size 5)
    let p_board = vec![
        BoardUnit::from_card(captain),
        BoardUnit::from_card(filler.clone()),
        BoardUnit::from_card(filler.clone()),
        BoardUnit::from_card(filler.clone()),
        BoardUnit::from_card(filler),
    ];

    // Enemy kills Captain instantly
    let killer = create_dummy_card(10, "Killer", 10, 10);
    let e_board = vec![BoardUnit::from_card(killer)];

    let events = run_battle(&p_board, &e_board, 42);

    // Count spawns
    let spawns = events
        .iter()
        .filter(|e| matches!(e, CombatEvent::UnitSpawn { .. }))
        .count();

    // Count triggers
    let triggers = events
            .iter()
            .filter(|e| {
                matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "MultiSpawn")
            })
            .count();

    assert_eq!(triggers, 2, "Both abilities should trigger");
    assert_eq!(
        spawns, 1,
        "Only 1 unit should spawn because board was full (4 alive + 1 spawn = 5)"
    );
}
