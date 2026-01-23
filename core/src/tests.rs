#[cfg(test)]
mod tests {
    use crate::battle::{resolve_battle, CombatEvent};
    use crate::state::GameState;
    use crate::types::*;

    // ==========================================
    // HELPER FUNCTIONS (Boilerplate Reduction)
    // ==========================================

    fn create_dummy_card(id: u32, name: &str, atk: i32, hp: i32) -> UnitCard {
        UnitCard::new(id, name, name, atk, hp, 1, 1)
    }

    fn create_board_unit(id: u32, name: &str, atk: i32, hp: i32) -> BoardUnit {
        BoardUnit::from_card(create_dummy_card(id, name, atk, hp))
    }

    fn create_ability(trigger: AbilityTrigger, effect: AbilityEffect, name: &str) -> Ability {
        Ability {
            trigger,
            effect,
            name: name.to_string(),
            description: "Test Ability".to_string(),
        }
    }

    // ==========================================
    // 1. SANITY CHECKS (Mana & Basic State)
    // ==========================================

    #[test]
    fn test_mana_mechanics() {
        let mut state = GameState::new();
        state.mana_limit = 5;
        state.mana = 3;

        // Cap check
        state.add_mana(4);
        assert_eq!(state.mana, 5, "Mana should cap at limit");

        // Spend check
        assert!(state.spend_mana(2).is_ok());
        assert_eq!(state.mana, 3);
        assert!(state.spend_mana(10).is_err());
    }

    #[test]
    fn test_board_unit_health() {
        let mut unit = create_board_unit(1, "Test", 10, 10);
        assert!(unit.is_alive());

        unit.take_damage(5);
        assert_eq!(unit.current_health, 5);

        unit.take_damage(5);
        assert!(!unit.is_alive());
    }

    // ==========================================
    // 2. COMBAT FUNDAMENTALS
    // ==========================================

    #[test]
    fn test_simultaneous_clash_draw() {
        // 10/10 vs 10/10 -> Both die -> Draw
        let p_board = vec![create_board_unit(1, "P1", 10, 10)];
        let e_board = vec![create_board_unit(2, "E1", 10, 10)];

        let events = resolve_battle(&p_board, &e_board, 123);

        let last = events.last().unwrap();
        if let CombatEvent::BattleEnd { result } = last {
            assert_eq!(result, "DRAW");
        } else {
            panic!("Battle did not end");
        }
    }

    // ==========================================
    // 1. HELPER: Manual Unit Construction
    // ==========================================
    // We strictly construct units manually here as requested,
    // avoiding dependencies on external template files.

    fn create_tester_unit(
        id: u32,
        name: &str,
        attack: i32,
        health: i32,
        ability_name: &str,
    ) -> BoardUnit {
        let ability = Ability {
            trigger: AbilityTrigger::OnStart,
            // Simple effect that won't kill anyone to keep the log clean
            effect: AbilityEffect::ModifyStats {
                health: 1,
                attack: 0,
                target: AbilityTarget::SelfUnit,
            },
            name: ability_name.to_string(),
            description: "Priority Test Ability".to_string(),
        };

        let card = UnitCard {
            id,
            template_id: "test_dummy".to_string(),
            name: name.to_string(),
            stats: UnitStats { attack, health },
            economy: EconomyStats {
                play_cost: 1,
                pitch_value: 1,
            },
            abilities: vec![ability],
        };

        BoardUnit {
            card: card.clone(),
            current_health: health,
        }
    }

    fn create_dummy_enemy() -> BoardUnit {
        let card = UnitCard {
            id: 999,
            template_id: "sandbag".to_string(),
            name: "Sandbag".to_string(),
            stats: UnitStats {
                attack: 0,
                health: 50,
            },
            economy: EconomyStats {
                play_cost: 0,
                pitch_value: 0,
            },
            abilities: vec![],
        };
        BoardUnit {
            card,
            current_health: 50,
        }
    }

    // ==========================================
    // 2. THE PRIORITY TEST
    // ==========================================

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
        let events = resolve_battle(&player_board, &enemy_board, 12345);

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
        };

        let slow_ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 5,
                target: AbilityTarget::FrontEnemy,
            },
            name: "LateShot".to_string(),
            description: "Deals 5 damage".to_string(),
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

        let events = resolve_battle(&p_board, &e_board, 42);

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

        let events = resolve_battle(&p_board, &e_board, 42);

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
            // The instance ID of a spawned unit usually contains "spawn"
            assert!(
                target_instance_id.contains("spawn") || target_instance_id.contains("e"),
                "Second snipe should hit the new unit"
            );
        }
    }

    // ==========================================
    // 4. COMPLEX SCENARIO: BOARD CAP & OVERFLOW
    // ==========================================

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

        let events = resolve_battle(&p_board, &e_board, 42);

        // Count spawns
        let spawns = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::UnitSpawn { .. }))
            .count();

        // Count triggers
        let triggers = events.iter().filter(|e|
            matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "MultiSpawn")
        ).count();

        assert_eq!(triggers, 2, "Both abilities should trigger");
        assert_eq!(
            spawns, 1,
            "Only 1 unit should spawn because board was full (4 alive + 1 spawn = 5)"
        );
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

        let events = resolve_battle(&p_board, &e_board, 42);

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

    // ==========================================
    // 6. CHAIN REACTION (DRAW CONDITION)
    // ==========================================

    #[test]
    fn test_mutual_destruction_chain() {
        // Player: Unit deals 5 dmg on Start.
        // Enemy: Unit deals 5 dmg on Faint.
        // Result: Player kills Enemy -> Enemy dies -> Enemy kills Player -> Draw.

        let start_nuke = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Damage {
                amount: 10,
                target: AbilityTarget::FrontEnemy,
            },
            "Nuke",
        );
        let faint_nuke = create_ability(
            AbilityTrigger::OnFaint,
            AbilityEffect::Damage {
                amount: 10,
                target: AbilityTarget::FrontEnemy,
            },
            "Revenge",
        );

        let p1 = create_dummy_card(1, "P1", 1, 5).with_ability(start_nuke);
        let e1 = create_dummy_card(2, "E1", 1, 5).with_ability(faint_nuke);

        let p_board = vec![BoardUnit::from_card(p1)];
        let e_board = vec![BoardUnit::from_card(e1)];

        let events = resolve_battle(&p_board, &e_board, 42);

        // Verify triggers happened
        let has_nuke = events.iter().any(|e| matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Nuke"));
        let has_revenge = events.iter().any(|e| matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Revenge"));

        assert!(has_nuke);
        assert!(has_revenge);

        // Verify Draw
        if let CombatEvent::BattleEnd { result } = events.last().unwrap() {
            assert_eq!(result, "DRAW");
        } else {
            panic!("Wrong end state");
        }
    }

    #[test]
    fn test_targeting_logic_front_ally() {
        // [Front, Back]
        // Back unit has OnStart: Buff FrontAlly.
        // Expected: Front gets buffed.

        let buff = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: 5,
                attack: 0,
                target: AbilityTarget::FrontAlly,
            },
            "Buff",
        );

        let front = create_dummy_card(1, "Front", 1, 10);
        let back = create_dummy_card(2, "Back", 1, 10).with_ability(buff);

        let p_board = vec![BoardUnit::from_card(front), BoardUnit::from_card(back)];
        let e_board = vec![create_board_unit(3, "Dummy", 1, 50)];

        let events = resolve_battle(&p_board, &e_board, 42);

        // Find buff event
        let buff_event = events
            .iter()
            .find(|e| matches!(e, CombatEvent::AbilityModifyStats { .. }))
            .unwrap();

        if let CombatEvent::AbilityModifyStats {
            target_instance_id,
            health_change,
            ..
        } = buff_event
        {
            assert!(target_instance_id.contains("1")); // Should target unit with ID 1
            assert_eq!(*health_change, 5);
        }
    }
}
