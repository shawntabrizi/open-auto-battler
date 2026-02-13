use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_warder_seal_fate() {
    let warder = create_dummy_card(1, "Warder", 2, 4).with_ability(Ability {
        trigger: AbilityTrigger::OnEnemySpawn,
        effect: AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
        name: "Seal Fate".to_string(),
        description: "Damage enemies on spawn".to_string(),
        conditions: vec![],
        max_triggers: None,
    });

    let rat_swarm = create_dummy_card(2, "Rat Swarm", 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            card_id: CardId(40), // rat_token
        },
        name: "Infestation".to_string(),
        description: "Spawn token on death".to_string(),
        conditions: vec![],
        max_triggers: None,
    });

    let p_board = vec![CombatUnit::from_card(warder)];
    let e_board = vec![CombatUnit::from_card(rat_swarm)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

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
    let rat_swarm = create_dummy_card(1, "Rat Swarm", 1, 1).with_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            card_id: CardId(40), // rat_token
        },
        name: "Infestation".to_string(),
        description: "Spawn token on death".to_string(),
        conditions: vec![],
        max_triggers: None,
    });

    let necromancer = create_dummy_card(2, "Necromancer", 2, 3).with_ability(Ability {
        trigger: AbilityTrigger::OnAllySpawn,
        effect: AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
        name: "Spawn Boost".to_string(),
        description: "Buff spawned units".to_string(),
        conditions: vec![],
        max_triggers: None,
    });

    let p_board = vec![
        CombatUnit::from_card(rat_swarm),
        CombatUnit::from_card(necromancer),
    ];

    let killer = create_dummy_card(3, "Killer", 10, 10);
    let e_board = vec![CombatUnit::from_card(killer)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let buff_event = events.iter().find(|e| {
        if let CombatEvent::AbilityModifyStats {
            source_instance_id,
            attack_change,
            ..
        } = e
        {
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
        assert_ne!(*target_instance_id, UnitId::player(2));
    }
}

#[test]
fn test_spawn_index_preservation() {
    let spawn_ability = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42), // zombie_spawn
        },
        "Spawn",
    );

    let tank = create_dummy_card(1, "Tank", 5, 10);
    let spawner = create_dummy_card(2, "Spawner", 0, 1).with_ability(spawn_ability);
    let backline = create_dummy_card(3, "Backline", 5, 10);

    let p_board = vec![
        CombatUnit::from_card(tank),
        CombatUnit::from_card(spawner),
        CombatUnit::from_card(backline),
    ];

    let aoe_killer = create_dummy_card(4, "AoE", 5, 10).with_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::All {
                scope: TargetScope::Enemies,
            },
        },
        "Bomb",
    ));
    let e_board = vec![CombatUnit::from_card(aoe_killer)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let spawn_event = events
        .iter()
        .find(|e| matches!(e, CombatEvent::UnitSpawn { .. }))
        .unwrap();

    if let CombatEvent::UnitSpawn {
        new_board_state, ..
    } = spawn_event
    {
        assert_eq!(new_board_state.len(), 3);
        assert_eq!(new_board_state[0].name, "Tank");
        assert_eq!(new_board_state[1].name, "Zombie Spawn");
        assert_eq!(new_board_state[2].name, "Backline");
    }
}

#[test]
fn test_sacrifice_combo() {
    let fodder = create_dummy_card(1, "Fodder", 1, 1);

    let lich_destroy = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: -1,
            },
        },
        "Ritual",
    );
    let lich_spawn = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(43), // golem
        },
        "Raise",
    );
    let lich = create_dummy_card(2, "Lich", 3, 3).with_abilities(vec![lich_destroy, lich_spawn]);

    let cart_ability = create_ability(
        AbilityTrigger::OnAllyFaint,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        "Scavenge",
    );
    let corpse_cart = create_dummy_card(3, "Cart", 0, 4).with_ability(cart_ability);

    let p_board = vec![
        CombatUnit::from_card(fodder),
        CombatUnit::from_card(lich),
        CombatUnit::from_card(corpse_cart),
    ];
    let e_board = vec![create_dummy_enemy()];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

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

    let spawn_event = events
        .iter()
        .find(|e| matches!(e, CombatEvent::UnitSpawn { .. }));
    assert!(spawn_event.is_some(), "Golem should have spawned");
}

#[test]
fn test_damage_taken_no_slide_trigger() {
    let spawn_ability = create_ability(
        AbilityTrigger::OnHurt,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42), // zombie_spawn
        },
        "Breed",
    );

    let fodder = create_dummy_card(1, "Fodder", 1, 1);
    let breeder = create_dummy_card(2, "Breeder", 2, 4).with_ability(spawn_ability);
    let killer = create_dummy_card(3, "Killer", 0, 10);

    let p_board = vec![
        CombatUnit::from_card(fodder),
        CombatUnit::from_card(breeder),
    ];
    let e_board = vec![CombatUnit::from_card(killer)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let breed_triggers: Vec<_> = events
            .iter()
            .filter(|e| {
                matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Breed")
            })
            .collect();

    assert_eq!(
        breed_triggers.len(),
        0,
        "Breeder should NOT trigger because it just slid forward, it wasn't hit."
    );
}

#[test]
fn test_spawn_id_uniqueness_and_buffs() {
    let spawn_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42), // zombie_spawn
        },
        "Spawn",
    );
    let spawner = create_dummy_card(1, "Spawner", 10, 10)
        .with_abilities(vec![spawn_ability.clone(), spawn_ability]);

    let buff_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::Allies,
            },
        },
        "BuffAll",
    );
    let buffer = create_dummy_card(2, "Buffer", 5, 10).with_ability(buff_ability);

    let p_board = vec![
        CombatUnit::from_card(spawner),
        CombatUnit::from_card(buffer),
    ];
    let e_board = vec![create_dummy_enemy()];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let spawn_final_atk = events.iter().rev().find_map(|e| {
        if let CombatEvent::UnitSpawn { spawned_unit, .. } = e {
            let id = &spawned_unit.instance_id;
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

    assert_eq!(
        spawn_final_atk,
        Some(3),
        "Spawned unit should have 3 attack (1 base + 2 buff)."
    );
}

#[test]
fn test_spawn_limit_logic() {
    let multi_spawn = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42), // zombie_spawn
        },
        "MultiSpawn",
    );

    let captain = create_dummy_card(1, "Captain", 1, 1)
        .with_abilities(vec![multi_spawn.clone(), multi_spawn]);

    let filler = create_dummy_card(2, "Filler", 1, 10);

    let p_board = vec![
        CombatUnit::from_card(captain),
        CombatUnit::from_card(filler.clone()),
        CombatUnit::from_card(filler.clone()),
        CombatUnit::from_card(filler.clone()),
        CombatUnit::from_card(filler),
    ];

    let killer = create_dummy_card(10, "Killer", 10, 10);
    let e_board = vec![CombatUnit::from_card(killer)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let spawns = events
        .iter()
        .filter(|e| matches!(e, CombatEvent::UnitSpawn { .. }))
        .count();

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
