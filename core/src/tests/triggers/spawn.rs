use crate::battle::{CombatEvent, UnitId};
use crate::limits::LimitReason;
use crate::tests::*;
use crate::types::*;

#[test]
fn test_warder_seal_fate() {
    let warder = create_dummy_card(1, "Warder", 2, 4).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnEnemySpawn,
        effect: AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
        conditions: vec![],
        max_triggers: None,
    });

    let rat_swarm = create_dummy_card(2, "Rat Swarm", 1, 1).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            card_id: CardId(40), // rat_token
            spawn_location: SpawnLocation::DeathPosition,
        },
        conditions: vec![],
        max_triggers: None,
    });

    let p_board = vec![CombatUnit::from_card(warder)];
    let e_board = vec![CombatUnit::from_card(rat_swarm)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let trigger_event = events.iter().find(|e| {
        matches!(
            e,
            CombatEvent::AbilityTrigger {
                source_instance_id,
                ability_index,
            } if *source_instance_id == UnitId::player(1) && *ability_index == 0
        )
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
    let rat_swarm = create_dummy_card(1, "Rat Swarm", 1, 1).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            card_id: CardId(40), // rat_token
            spawn_location: SpawnLocation::DeathPosition,
        },
        conditions: vec![],
        max_triggers: None,
    });

    let necromancer = create_dummy_card(2, "Necromancer", 2, 3).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnAllySpawn,
        effect: AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::TriggerSource,
            },
        },
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
            spawn_location: SpawnLocation::DeathPosition,
        },
    );

    let tank = create_dummy_card(1, "Tank", 5, 10);
    let spawner = create_dummy_card(2, "Spawner", 0, 1).with_battle_ability(spawn_ability);
    let backline = create_dummy_card(3, "Backline", 5, 10);

    let p_board = vec![
        CombatUnit::from_card(tank),
        CombatUnit::from_card(spawner),
        CombatUnit::from_card(backline),
    ];

    let aoe_killer = create_dummy_card(4, "AoE", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::All {
                scope: TargetScope::Enemies,
            },
        },
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
        assert_eq!(new_board_state[0].card_id, CardId(1)); // Tank
        assert_eq!(new_board_state[1].card_id, CardId(42)); // Zombie Spawn
        assert_eq!(new_board_state[2].card_id, CardId(3)); // Backline
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
    );
    let lich_spawn = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(43), // golem
            spawn_location: SpawnLocation::Front,
        },
    );
    let lich =
        create_dummy_card(2, "Lich", 3, 3).with_battle_abilities(vec![lich_destroy, lich_spawn]);

    let cart_ability = create_ability(
        AbilityTrigger::OnAllyFaint,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );
    let corpse_cart = create_dummy_card(3, "Cart", 0, 4).with_battle_ability(cart_ability);

    let p_board = vec![
        CombatUnit::from_card(fodder),
        CombatUnit::from_card(lich),
        CombatUnit::from_card(corpse_cart),
    ];
    let e_board = vec![create_dummy_enemy()];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    assert!(
        has_ability_trigger(&events, UnitId::player(2), 0),
        "Lich should trigger Ritual"
    );
    assert!(
        has_ability_trigger(&events, UnitId::player(2), 1),
        "Lich should trigger Raise"
    );
    assert!(
        has_ability_trigger(&events, UnitId::player(3), 0),
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
            spawn_location: SpawnLocation::Front,
        },
    );

    let fodder = create_dummy_card(1, "Fodder", 1, 1);
    let breeder = create_dummy_card(2, "Breeder", 2, 4).with_battle_ability(spawn_ability);
    let killer = create_dummy_card(3, "Killer", 0, 10);

    let p_board = vec![
        CombatUnit::from_card(fodder),
        CombatUnit::from_card(breeder),
    ];
    let e_board = vec![CombatUnit::from_card(killer)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    assert_eq!(
        count_ability_triggers(&events, UnitId::player(2), 0),
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
            spawn_location: SpawnLocation::Front,
        },
    );
    let spawner = create_dummy_card(1, "Spawner", 10, 10)
        .with_battle_abilities(vec![spawn_ability.clone(), spawn_ability]);

    let buff_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::Allies,
            },
        },
    );
    let buffer = create_dummy_card(2, "Buffer", 5, 10).with_battle_ability(buff_ability);

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
            spawn_location: SpawnLocation::DeathPosition,
        },
    );

    let captain = create_dummy_card(1, "Captain", 1, 1)
        .with_battle_abilities(vec![multi_spawn.clone(), multi_spawn]);

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

    let triggers = count_ability_triggers(&events, UnitId::player(1), 0)
        + count_ability_triggers(&events, UnitId::player(1), 1);

    assert_eq!(triggers, 2, "Both abilities should trigger");
    assert_eq!(
        spawns, 1,
        "Only 1 unit should spawn because board was full (4 alive + 1 spawn = 5)"
    );
}

#[test]
fn test_missing_spawn_card_fizzles_without_panic() {
    let spawner = create_dummy_card(1, "BrokenSpawner", 2, 5).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(999_999),
            spawn_location: SpawnLocation::Front,
        },
    ));

    let p_board = vec![CombatUnit::from_card(spawner)];
    let e_board = vec![create_dummy_enemy()];

    // Empty pool on purpose: missing spawn refs must not panic runtime execution.
    let events = run_battle(&p_board, &e_board, 777);

    let spawn_count = events
        .iter()
        .filter(|e| matches!(e, CombatEvent::UnitSpawn { .. }))
        .count();
    assert_eq!(spawn_count, 0, "Missing spawn card should safely fizzle");
    assert!(
        matches!(events.last(), Some(CombatEvent::BattleEnd { .. })),
        "Battle should still complete when spawn card is missing"
    );
}

#[test]
fn test_necromancer_rebirth_chain_spawns_once_without_looping() {
    let tank = create_dummy_card(1, "Tank", 5, 10);
    let necromancer =
        create_dummy_card(2, "Necromancer", 3, 4).with_battle_ability(create_ability(
            AbilityTrigger::OnFaint,
            AbilityEffect::SpawnUnit {
                card_id: CardId(108),
                spawn_location: SpawnLocation::DeathPosition,
            },
        ));

    let p_board = vec![
        CombatUnit::from_card(tank),
        CombatUnit::from_card(necromancer),
    ];

    let bomber = create_dummy_card(3, "Bomber", 0, 50).with_battle_abilities(vec![
        create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Damage {
                amount: 4,
                target: AbilityTarget::All {
                    scope: TargetScope::Enemies,
                },
            },
        ),
        create_ability(
            AbilityTrigger::OnEnemySpawn,
            AbilityEffect::Destroy {
                target: AbilityTarget::All {
                    scope: TargetScope::TriggerSource,
                },
            },
        ),
    ]);
    let e_board = vec![CombatUnit::from_card(bomber)];

    let mut card_pool = spawn_test_card_pool();
    card_pool.insert(
        CardId(108),
        UnitCard {
            id: CardId(108),
            name: "Phylactery".to_string(),
            stats: UnitStats {
                attack: 0,
                health: 5,
            },
            economy: EconomyStats {
                play_cost: 0,
                burn_value: 0,
            },
            shop_abilities: vec![],
            battle_abilities: vec![create_ability(
                AbilityTrigger::OnFaint,
                AbilityEffect::SpawnUnit {
                    card_id: CardId(110),
                    spawn_location: SpawnLocation::DeathPosition,
                },
            )],
        },
    );
    card_pool.insert(
        CardId(110),
        UnitCard::new(CardId(110), "Reborn Necromancer", 3, 4, 0, 0),
    );

    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let spawned_cards: Vec<CardId> = events
        .iter()
        .filter_map(|event| {
            if let CombatEvent::UnitSpawn { spawned_unit, .. } = event {
                Some(spawned_unit.card_id)
            } else {
                None
            }
        })
        .collect();

    assert_eq!(
        spawned_cards,
        vec![CardId(108), CardId(110)],
        "Necromancer should spawn Phylactery first, then a one-time Reborn Necromancer"
    );

    let reborn_spawn = events
        .iter()
        .find_map(|event| {
            if let CombatEvent::UnitSpawn {
                spawned_unit,
                new_board_state,
                ..
            } = event
            {
                if spawned_unit.card_id == CardId(110) {
                    return Some(
                        new_board_state
                            .iter()
                            .map(|unit| unit.card_id)
                            .collect::<Vec<_>>(),
                    );
                }
            }
            None
        })
        .expect("Reborn Necromancer should spawn");

    assert_eq!(
        reborn_spawn,
        vec![CardId(1), CardId(110)],
        "Reborn Necromancer should appear at the Phylactery's death position behind the surviving tank"
    );
}

#[test]
fn test_full_board_spawn_spam_does_not_leak_recursion_depth() {
    let spawn_spam = create_ability(
        AbilityTrigger::BeforeAnyAttack,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::Front,
        },
    );

    let spammer = create_dummy_card(1, "Spawner", 0, 500).with_battle_ability(spawn_spam);
    let p_board = vec![
        CombatUnit::from_card(spammer.clone()),
        CombatUnit::from_card(spammer.clone()),
        CombatUnit::from_card(spammer.clone()),
        CombatUnit::from_card(spammer.clone()),
        CombatUnit::from_card(spammer),
    ];

    let wall = create_dummy_card(2, "Wall", 0, 500);
    let e_board = vec![CombatUnit::from_card(wall)];

    let events = run_battle(&p_board, &e_board, 42);

    let has_recursion_limit = events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::LimitExceeded {
                reason: LimitReason::RecursionLimit { .. },
                ..
            }
        )
    });
    assert!(
        !has_recursion_limit,
        "Spawn fizzles on a full board must not leak recursion depth"
    );

    assert!(
        matches!(events.last(), Some(CombatEvent::BattleEnd { .. })),
        "Battle should still complete with repeated full-board spawn attempts"
    );
}

// ── SpawnLocation tests ─────────────────────────────────────────────────────

/// Helper: extract the new_board_state from the first UnitSpawn event.
fn get_spawn_board_state(events: &[CombatEvent]) -> Vec<CardId> {
    events
        .iter()
        .find_map(|e| {
            if let CombatEvent::UnitSpawn {
                new_board_state, ..
            } = e
            {
                Some(new_board_state.iter().map(|u| u.card_id).collect())
            } else {
                None
            }
        })
        .expect("Expected a UnitSpawn event")
}

/// Board: [Tank(1), Spawner(2), Backline(3)]. Spawner dies from AoE (1 HP).
/// SpawnLocation::Front → spawned unit at position 0.
/// Board after: [Zombie(42), Tank(1), Backline(3)]
#[test]
fn test_spawn_location_front_on_faint() {
    let spawner = create_dummy_card(2, "Spawner", 0, 1).with_battle_ability(create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::Front,
        },
    ));

    let tank = create_dummy_card(1, "Tank", 5, 10);
    let backline = create_dummy_card(3, "Backline", 5, 10);

    let p_board = vec![
        CombatUnit::from_card(tank),
        CombatUnit::from_card(spawner),
        CombatUnit::from_card(backline),
    ];

    let aoe = create_dummy_card(4, "AoE", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::All {
                scope: TargetScope::Enemies,
            },
        },
    ));
    let e_board = vec![CombatUnit::from_card(aoe)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    assert_eq!(board[0], CardId(42), "Spawned unit should be at the front");
    assert_eq!(board[1], CardId(1), "Tank should shift to position 1");
    assert_eq!(board[2], CardId(3), "Backline should shift to position 2");
}

/// Board: [Tank(1), Spawner(2), Backline(3)]. Spawner dies from AoE.
/// SpawnLocation::Back → spawned unit at the end.
/// Board after: [Tank(1), Backline(3), Zombie(42)]
#[test]
fn test_spawn_location_back_on_faint() {
    let spawner = create_dummy_card(2, "Spawner", 0, 1).with_battle_ability(create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::Back,
        },
    ));

    let tank = create_dummy_card(1, "Tank", 5, 10);
    let backline = create_dummy_card(3, "Backline", 5, 10);

    let p_board = vec![
        CombatUnit::from_card(tank),
        CombatUnit::from_card(spawner),
        CombatUnit::from_card(backline),
    ];

    let aoe = create_dummy_card(4, "AoE", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::All {
                scope: TargetScope::Enemies,
            },
        },
    ));
    let e_board = vec![CombatUnit::from_card(aoe)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    assert_eq!(board[0], CardId(1), "Tank should stay at position 0");
    assert_eq!(board[1], CardId(3), "Backline should stay at position 1");
    assert_eq!(board[2], CardId(42), "Spawned unit should be at the back");
}

/// Board: [Tank(1), Spawner(2), Backline(3)]. Spawner dies from AoE.
/// SpawnLocation::DeathPosition → spawned unit at Spawner's former position (1).
/// Board after: [Tank(1), Zombie(42), Backline(3)]
#[test]
fn test_spawn_location_death_position_on_faint() {
    let spawner = create_dummy_card(2, "Spawner", 0, 1).with_battle_ability(create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::DeathPosition,
        },
    ));

    let tank = create_dummy_card(1, "Tank", 5, 10);
    let backline = create_dummy_card(3, "Backline", 5, 10);

    let p_board = vec![
        CombatUnit::from_card(tank),
        CombatUnit::from_card(spawner),
        CombatUnit::from_card(backline),
    ];

    let aoe = create_dummy_card(4, "AoE", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::All {
                scope: TargetScope::Enemies,
            },
        },
    ));
    let e_board = vec![CombatUnit::from_card(aoe)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    assert_eq!(board[0], CardId(1), "Tank should stay at position 0");
    assert_eq!(
        board[1],
        CardId(42),
        "Spawned unit should be at death position (1)"
    );
    assert_eq!(board[2], CardId(3), "Backline should stay at position 2");
}

/// OnStart spawn with SpawnLocation::Front → spawns at front.
/// Board: [Spawner(1)]. After OnStart: [Zombie(42), Spawner(1)]
#[test]
fn test_spawn_location_front_on_start() {
    let spawner = create_dummy_card(1, "Spawner", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::Front,
        },
    ));

    let p_board = vec![CombatUnit::from_card(spawner)];
    let e_board = vec![create_dummy_enemy()];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    assert_eq!(board[0], CardId(42), "Spawned unit should be at the front");
    assert_eq!(board[1], CardId(1), "Spawner should shift to position 1");
}

/// OnStart spawn with SpawnLocation::Back → spawns at back.
/// Board: [Spawner(1)]. After OnStart: [Spawner(1), Zombie(42)]
#[test]
fn test_spawn_location_back_on_start() {
    let spawner = create_dummy_card(1, "Spawner", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::Back,
        },
    ));

    let p_board = vec![CombatUnit::from_card(spawner)];
    let e_board = vec![create_dummy_enemy()];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    assert_eq!(board[0], CardId(1), "Spawner should stay at position 0");
    assert_eq!(board[1], CardId(42), "Spawned unit should be at the back");
}

/// OnStart spawn with DeathPosition (no death context) falls back to Front.
/// Board: [Spawner(1)]. After OnStart: [Zombie(42), Spawner(1)]
#[test]
fn test_spawn_location_death_position_falls_back_to_front_on_start() {
    let spawner = create_dummy_card(1, "Spawner", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::DeathPosition,
        },
    ));

    let p_board = vec![CombatUnit::from_card(spawner)];
    let e_board = vec![create_dummy_enemy()];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    assert_eq!(
        board[0],
        CardId(42),
        "DeathPosition with no death context should fall back to front"
    );
    assert_eq!(board[1], CardId(1), "Spawner should shift to position 1");
}

/// OnAllyFaint with DeathPosition: ally C spawns a unit where D died.
/// Board: [A(1), B(2), C(3), D(4)]. D (1 HP) dies from AoE. C has OnAllyFaint spawn.
/// Spawned unit should appear where D was (position 3 before removal, now position 2 after D removed).
#[test]
fn test_spawn_location_death_position_on_ally_faint() {
    let unit_a = create_dummy_card(1, "A", 5, 10);
    let unit_b = create_dummy_card(2, "B", 5, 10);
    let unit_c = create_dummy_card(3, "C", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnAllyFaint,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::DeathPosition,
        },
    ));
    let unit_d = create_dummy_card(4, "D", 0, 1); // will die from AoE

    let p_board = vec![
        CombatUnit::from_card(unit_a),
        CombatUnit::from_card(unit_b),
        CombatUnit::from_card(unit_c),
        CombatUnit::from_card(unit_d),
    ];

    let aoe = create_dummy_card(5, "AoE", 5, 10).with_battle_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::All {
                scope: TargetScope::Enemies,
            },
        },
    ));
    let e_board = vec![CombatUnit::from_card(aoe)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    // After D dies, board is [A, B, C]. Spawn at D's death position (index 3, clamped to 3 = end).
    assert_eq!(board.len(), 4);
    assert_eq!(board[0], CardId(1), "A should stay at position 0");
    assert_eq!(board[1], CardId(2), "B should stay at position 1");
    assert_eq!(board[2], CardId(3), "C should stay at position 2");
    assert_eq!(
        board[3],
        CardId(42),
        "Spawned unit should appear at D's death position"
    );
}

/// Front-of-board unit dies with SpawnLocation::DeathPosition.
/// Board: [Spawner(1), Back(2)]. Spawner (position 0) dies.
/// Spawned unit should appear at position 0.
/// Board after: [Zombie(42), Back(2)]
#[test]
fn test_spawn_location_death_position_front_unit_dies() {
    let spawner = create_dummy_card(1, "Spawner", 0, 1).with_battle_ability(create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::SpawnUnit {
            card_id: CardId(42),
            spawn_location: SpawnLocation::DeathPosition,
        },
    ));
    let backline = create_dummy_card(2, "Back", 5, 10);

    let p_board = vec![
        CombatUnit::from_card(spawner),
        CombatUnit::from_card(backline),
    ];

    let killer = create_dummy_card(3, "Killer", 10, 10);
    let e_board = vec![CombatUnit::from_card(killer)];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);
    let board = get_spawn_board_state(&events);

    assert_eq!(
        board[0],
        CardId(42),
        "Spawned unit should be at position 0 (death position)"
    );
    assert_eq!(board[1], CardId(2), "Back should stay at position 1");
}
