#[cfg(test)]
mod tests {
    use crate::battle::{calculate_priority_order, CombatEvent, CombatUnit, Team};
    use crate::state::*;
    use crate::types::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    #[test]
    fn test_mana_respects_limit() {
        let mut state = GameState::new();
        state.mana_limit = 5;
        state.mana = 3;

        // Adding 4 mana should cap at limit (5), not go to 7
        state.add_mana(4);
        assert_eq!(state.mana, 5, "Mana should be capped at limit");
    }

    #[test]
    fn test_mana_limit_progression() {
        let state = GameState::new();

        // Round 1: limit = 3
        assert_eq!(state.calculate_mana_limit(), 3);

        let mut state2 = GameState::new();
        state2.round = 5;
        // Round 5: limit = 3 + 4 = 7
        assert_eq!(state2.calculate_mana_limit(), 7);

        let mut state3 = GameState::new();
        state3.round = 10;
        // Round 10: should cap at 10
        assert_eq!(state3.calculate_mana_limit(), 10);

        let mut state4 = GameState::new();
        state4.round = 15;
        // Round 15: should still be capped at 10
        assert_eq!(state4.calculate_mana_limit(), 10);
    }

    #[test]
    fn test_spend_mana() {
        let mut state = GameState::new();
        state.mana = 5;

        // Spending 3 should work
        assert!(state.spend_mana(3).is_ok());
        assert_eq!(state.mana, 2);

        // Spending 5 should fail (only have 2)
        assert!(state.spend_mana(5).is_err());
        assert_eq!(state.mana, 2, "Mana should not change on failed spend");
    }

    #[test]
    fn test_combat_deterministic() {
        let player_board = vec![
            BoardUnit::from_card(UnitCard::new(1, "p1", "Warrior", 3, 5, 0, 0)),
            BoardUnit::from_card(UnitCard::new(2, "p2", "Archer", 2, 3, 0, 0)),
        ];

        let enemy_board = vec![
            BoardUnit::from_card(UnitCard::new(3, "e1", "Goblin", 2, 4, 0, 0)),
            BoardUnit::from_card(UnitCard::new(4, "e2", "Orc", 3, 3, 0, 0)),
        ];

        let events1 = crate::battle::resolve_battle(&player_board, &enemy_board, 42);
        let events2 = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        assert_eq!(events1.len(), events2.len());

        for (i, event1) in events1.iter().enumerate() {
            let event2 = &events2[i];
            // Using a debug print comparison because of complex enums
            assert_eq!(format!("{:?}", event1), format!("{:?}", event2));
        }
    }

    #[test]
    fn test_combat_simultaneous_damage() {
        let player_board = vec![BoardUnit::from_card(UnitCard::new(
            1,
            "p1",
            "Glass Cannon",
            10,
            5,
            0,
            0,
        ))];
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            2,
            "e1",
            "Glass Cannon",
            10,
            5,
            0,
            0,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 123);

        let last_event = events.last().unwrap();
        match last_event {
            crate::battle::CombatEvent::BattleEnd { result } => {
                assert_eq!(result, "DRAW");
            }
            _ => panic!("Last event was not BattleEnd"),
        }
    }

    #[test]
    fn test_find_empty_board_slots() {
        let mut state = GameState::new();

        // Initially all board slots should be empty
        assert_eq!(state.find_empty_board_slot(), Some(0));

        // Fill first board slot
        let card = UnitCard::new(1, "test", "Test", 1, 1, 1, 1);
        state.board[0] = Some(BoardUnit::from_card(card.clone()));

        assert_eq!(state.find_empty_board_slot(), Some(1));

        // Fill all board slots
        for i in 0..BOARD_SIZE {
            if state.board[i].is_none() {
                state.board[i] = Some(BoardUnit::from_card(card.clone()));
            }
        }

        assert_eq!(state.find_empty_board_slot(), None);
    }

    #[test]
    fn test_board_unit_health_tracking() {
        let card = UnitCard::new(1, "warrior", "Warrior", 3, 10, 5, 2);
        let mut unit = BoardUnit::from_card(card);

        assert_eq!(unit.current_health, 10);
        assert!(unit.is_alive());

        unit.take_damage(3);
        assert_eq!(unit.current_health, 7);
        assert!(unit.is_alive());

        unit.take_damage(10);
        assert_eq!(unit.current_health, -3);
        assert!(!unit.is_alive());
    }

    #[test]
    fn test_unit_card_creation() {
        let card = UnitCard::new(42, "goblin_scout", "Goblin Scout", 1, 2, 1, 3);

        assert_eq!(card.id, 42);
        assert_eq!(card.template_id, "goblin_scout");
        assert_eq!(card.name, "Goblin Scout");
        assert_eq!(card.stats.attack, 1);
        assert_eq!(card.stats.health, 2);
        assert_eq!(card.economy.play_cost, 1);
        assert_eq!(card.economy.pitch_value, 3);
    }

    #[test]
    fn test_ability_on_spawn_buff() {
        // Create a unit with OnSpawn ability that gives +2 attack to spawned units
        let spawn_buff_ability = Ability {
            trigger: AbilityTrigger::OnSpawn,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 2,
                target: AbilityTarget::SelfUnit, // SelfUnit means the spawned unit
            },
            name: "Spawn Boost".to_string(),
            description: "Give +2 attack to any spawned unit".to_string(),
        };
        let necromancer = UnitCard::new(1, "necromancer", "Necromancer", 2, 3, 0, 0)
            .with_ability(spawn_buff_ability);

        // Create a unit that will spawn something
        let spawn_ability = Ability {
            trigger: AbilityTrigger::OnFaint,
            effect: AbilityEffect::SpawnUnit {
                template_id: "zombie_spawn".to_string(),
            },
            name: "Test Spawn".to_string(),
            description: "Spawn a test unit".to_string(),
        };
        let spawner =
            UnitCard::new(2, "test_unit", "Test Unit", 1, 1, 0, 0).with_ability(spawn_ability);

        let player_board = vec![
            BoardUnit::from_card(spawner),
            BoardUnit::from_card(necromancer),
        ];
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            3, "wolf", "Wolf", 3, 2, 0, 0,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 789);

        // Find the UnitSpawn event
        let spawn_event = events
            .iter()
            .find(|e| matches!(e, CombatEvent::UnitSpawn { .. }));
        assert!(spawn_event.is_some(), "Should have UnitSpawn event");

        // Find the AbilityModifyStats event with new_attack = 3
        let buff_event = events.iter().find(
            |e| matches!(e, CombatEvent::AbilityModifyStats { new_attack, .. } if *new_attack == 3),
        );
        assert!(
            buff_event.is_some(),
            "Should have AbilityModifyStats event showing attack buff to 3"
        );
    }

    #[test]
    fn test_ability_damage_on_start() {
        // Create a unit with OnStart damage to front enemy
        let ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 4,
                target: AbilityTarget::FrontEnemy,
            },
            name: "Strike".to_string(),
            description: "Deal 4 damage".to_string(),
        };
        let card = UnitCard::new(1, "mage", "Mage", 1, 5, 0, 0).with_ability(ability);
        let player_board = vec![BoardUnit::from_card(card)];

        // Enemy with 5 health
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            2, "orc", "Orc", 2, 5, 0, 0,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // Find the AbilityDamage event
        let damage_event = events
            .iter()
            .find(|e| matches!(e, CombatEvent::AbilityDamage { .. }));
        assert!(damage_event.is_some(), "Should have an AbilityDamage event");

        if let Some(CombatEvent::AbilityDamage {
            damage,
            remaining_hp,
            ..
        }) = damage_event
        {
            assert_eq!(*damage, 4, "Ability damage should be 4");
            assert_eq!(
                *remaining_hp, 1,
                "Enemy should have 1 HP after ability damage (5-4=1)"
            );
        }
    }

    #[test]
    fn test_ability_heal_on_start() {
        // Create a damaged unit and a healer
        let healer_ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::ModifyStats {
                health: 3,
                attack: 0,
                target: AbilityTarget::FrontAlly,
            },
            name: "Heal".to_string(),
            description: "Heal front ally".to_string(),
        };
        let healer = UnitCard::new(1, "healer", "Healer", 1, 5, 0, 0).with_ability(healer_ability);
        let mut tank = BoardUnit::from_card(UnitCard::new(2, "tank", "Tank", 2, 10, 0, 0));
        tank.current_health = 5; // Damaged

        let player_board = vec![tank, BoardUnit::from_card(healer)];
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            3, "orc", "Orc", 1, 20, 0, 0,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // Find the AbilityModifyStats event
        let heal_event = events
            .iter()
            .find(|e| matches!(e, CombatEvent::AbilityModifyStats { .. }));
        assert!(
            heal_event.is_some(),
            "Should have an AbilityModifyStats event"
        );

        if let Some(CombatEvent::AbilityModifyStats {
            health_change,
            new_health,
            ..
        }) = heal_event
        {
            assert_eq!(*health_change, 3, "Health change should be 3");
            assert_eq!(
                *new_health, 8,
                "Tank should have 8 effective HP after buff (5 + 3 buff)"
            );
        }
    }

    #[test]
    fn test_ability_damage_on_faint() {
        // Create a unit with OnFaint damage ability
        let ability = Ability {
            trigger: AbilityTrigger::OnFaint,
            effect: AbilityEffect::Damage {
                amount: 5,
                target: AbilityTarget::FrontEnemy,
            },
            name: "Death Spite".to_string(),
            description: "Deal 5 damage on death".to_string(),
        };
        let card = UnitCard::new(1, "bomber", "Bomber", 1, 1, 0, 0).with_ability(ability);
        let player_board = vec![BoardUnit::from_card(card)];

        // Enemy with 10 health
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            2, "orc", "Orc", 10, 10, 0, 0,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // The bomber should die (1 HP vs 10 attack) and trigger OnFaint
        let trigger_event = events.iter().find(|e| {
            matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Death Spite")
        });
        assert!(
            trigger_event.is_some(),
            "Should have an AbilityTrigger event for Death Spite"
        );

        // Find the AbilityDamage from the faint trigger
        let damage_events: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::AbilityDamage { .. }))
            .collect();
        assert!(
            !damage_events.is_empty(),
            "Should have AbilityDamage event from OnFaint"
        );
    }

    #[test]
    fn test_ability_spawn_basic() {
        let spawn_ability = Ability {
            trigger: AbilityTrigger::OnFaint,
            effect: AbilityEffect::SpawnUnit {
                template_id: "zombie_spawn".to_string(),
            },
            name: "Spawn Zombie".to_string(),
            description: "Spawn a Zombie Spawn when killed".to_string(),
        };
        let spawner = UnitCard::new(1, "zombie_soldier", "Zombie Soldier", 1, 1, 0, 0)
            .with_ability(spawn_ability);

        let player_board = vec![BoardUnit::from_card(spawner)];
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            2, "wolf", "Wolf", 3, 2, 0, 0,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 456);

        // Find the UnitSpawn event
        let spawn_event = events
            .iter()
            .find(|e| matches!(e, CombatEvent::UnitSpawn { .. }));
        assert!(spawn_event.is_some(), "Should have UnitSpawn event");

        if let Some(CombatEvent::UnitSpawn {
            team, spawned_unit, ..
        }) = spawn_event
        {
            assert_eq!(team, "PLAYER", "Spawned unit should be on player team");
            assert_eq!(
                spawned_unit.name, "Zombie Spawn",
                "Spawned unit should have correct name"
            );
            assert_eq!(spawned_unit.attack, 1, "Spawned unit should have 1 attack");
            assert_eq!(spawned_unit.health, 1, "Spawned unit should have 1 health");
        }
    }

    #[test]
    fn test_ability_multiple_triggers() {
        // Create a unit with both BeforeAttack (+2 health) and AfterAttack (+2 attack) abilities
        let before_attack_ability = Ability {
            trigger: AbilityTrigger::BeforeAttack,
            effect: AbilityEffect::ModifyStats {
                health: 2,
                attack: 0,
                target: AbilityTarget::SelfUnit,
            },
            name: "Pre-Battle Prep".to_string(),
            description: "Gain +2 health before each clash".to_string(),
        };
        let after_attack_ability = Ability {
            trigger: AbilityTrigger::AfterAttack,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 2,
                target: AbilityTarget::SelfUnit,
            },
            name: "Adrenaline Rush".to_string(),
            description: "Gain +2 attack after each clash if still alive".to_string(),
        };
        let battle_hardened = UnitCard::new(1, "battle_hardened", "Battle Hardened", 2, 3, 0, 0)
            .with_abilities(vec![before_attack_ability, after_attack_ability]);

        let player_board = vec![BoardUnit::from_card(battle_hardened)];
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            2, "goblin", "Goblin", 1, 2, 0, 0,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 123);

        // Find the BeforeAttack ability trigger
        let before_attack_trigger = events
            .iter()
            .find(|e| matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Pre-Battle Prep"));
        assert!(
            before_attack_trigger.is_some(),
            "Should trigger BeforeAttack ability"
        );

        // Find the AfterAttack ability trigger
        let after_attack_trigger = events
            .iter()
            .find(|e| matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Adrenaline Rush"));
        assert!(
            after_attack_trigger.is_some(),
            "Should trigger AfterAttack ability"
        );

        // Find the stat modification events
        let buff_events: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::AbilityModifyStats { .. }))
            .collect();
        assert_eq!(
            buff_events.len(),
            2,
            "Should have 2 AbilityModifyStats events"
        );

        // Check that the unit gets +2 health before attack (3 → 5)
        let before_buff = buff_events.iter().find(
            |e| matches!(e, CombatEvent::AbilityModifyStats { new_health, .. } if *new_health == 5),
        );
        assert!(before_buff.is_some(), "Should have +2 health buff");

        // Check that the unit gets +2 attack after attack (2 → 4)
        let after_buff = buff_events.iter().find(
            |e| matches!(e, CombatEvent::AbilityModifyStats { new_attack, .. } if *new_attack == 4),
        );
        assert!(after_buff.is_some(), "Should have +2 attack buff");
    }

    #[test]
    fn test_ability_damage_all_enemies() {
        // Create a unit with OnStart damage to all enemies
        let ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 2,
                target: AbilityTarget::AllEnemies,
            },
            name: "Fire Storm".to_string(),
            description: "Deal 2 damage to all enemies".to_string(),
        };
        let card = UnitCard::new(1, "mage", "Mage", 1, 10, 0, 0).with_ability(ability);
        let player_board = vec![BoardUnit::from_card(card)];

        // Three enemies
        let enemy_board = vec![
            BoardUnit::from_card(UnitCard::new(2, "orc1", "Orc 1", 1, 5, 0, 0)),
            BoardUnit::from_card(UnitCard::new(3, "orc2", "Orc 2", 1, 5, 0, 0)),
            BoardUnit::from_card(UnitCard::new(4, "orc3", "Orc 3", 1, 5, 0, 0)),
        ];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // Should have 3 AbilityDamage events (one for each enemy)
        let damage_events: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::AbilityDamage { .. }))
            .collect();
        assert_eq!(
            damage_events.len(),
            3,
            "Should have 3 AbilityDamage events for AllEnemies"
        );

        // Each should deal 2 damage
        for event in damage_events {
            if let CombatEvent::AbilityDamage {
                damage,
                remaining_hp,
                ..
            } = event
            {
                assert_eq!(*damage, 2, "Each target should take 2 damage");
                assert_eq!(*remaining_hp, 3, "Each enemy should have 3 HP (5-2=3)");
            }
        }
    }

    #[test]
    fn test_onstart_ability_kills_enemy() {
        // Test that OnStart damage can kill enemies before combat starts
        let ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 5,
                target: AbilityTarget::FrontEnemy,
            },
            name: "Opening Strike".to_string(),
            description: "Deal 5 damage at start".to_string(),
        };
        let card = UnitCard::new(1, "assassin", "Assassin", 1, 5, 0, 0).with_ability(ability);
        let player_board = vec![BoardUnit::from_card(card)];

        // Enemy with only 3 health - should die from ability
        let enemy_board = vec![
            BoardUnit::from_card(UnitCard::new(2, "weak", "Weak Orc", 2, 3, 0, 0)),
            BoardUnit::from_card(UnitCard::new(3, "strong", "Strong Orc", 3, 10, 0, 0)),
        ];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // Find the AbilityDamage event - should show -2 remaining HP
        let damage_event = events
            .iter()
            .find(|e| matches!(e, CombatEvent::AbilityDamage { .. }));
        if let Some(CombatEvent::AbilityDamage { remaining_hp, .. }) = damage_event {
            assert_eq!(*remaining_hp, -2, "Weak Orc should have -2 HP (3-5=-2)");
        }

        // There should be a death event from the ability damage
        let death_events: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::UnitDeath { .. }))
            .collect();
        assert!(!death_events.is_empty(), "Should have death events");
    }

    #[test]
    fn test_unit_card_with_ability() {
        let ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 1,
                target: AbilityTarget::FrontEnemy,
            },
            name: "Test".to_string(),
            description: "Test ability".to_string(),
        };

        let card = UnitCard::new(1, "test", "Test", 1, 1, 1, 1).with_ability(ability.clone());

        assert!(!card.abilities.is_empty());
        assert_eq!(card.abilities[0].name, "Test");
    }

    #[test]
    fn test_priority_ordering_basic() {
        // Test basic priority ordering: higher attack goes first
        let player_units = vec![
            CombatUnit {
                instance_id: "p1".to_string(),
                team: Team::Player,
                attack: 2,
                health: 3,
                abilities: vec![],
                template_id: "unit1".to_string(),
                name: "Unit1".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
            CombatUnit {
                instance_id: "p2".to_string(),
                team: Team::Player,
                attack: 4,
                health: 2,
                abilities: vec![],
                template_id: "unit2".to_string(),
                name: "Unit2".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
        ];

        let enemy_units = vec![];

        let mut rng = StdRng::seed_from_u64(12345);
        let priority_order = calculate_priority_order(&player_units, &enemy_units, &mut rng);

        // Should be ordered by attack descending: p2 (attack 4) before p1 (attack 2)
        assert_eq!(priority_order, vec![(Team::Player, 1), (Team::Player, 0)]);
    }

    #[test]
    fn test_priority_ordering_tie_break_by_health() {
        // Test tie-breaking by health when attacks are equal
        let player_units = vec![
            CombatUnit {
                instance_id: "p1".to_string(),
                team: Team::Player,
                attack: 3,
                health: 2,
                abilities: vec![],
                template_id: "unit1".to_string(),
                name: "Unit1".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
            CombatUnit {
                instance_id: "p2".to_string(),
                team: Team::Player,
                attack: 3,
                health: 4,
                abilities: vec![],
                template_id: "unit2".to_string(),
                name: "Unit2".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
        ];

        let enemy_units = vec![];

        let mut rng = StdRng::seed_from_u64(12345);
        let priority_order = calculate_priority_order(&player_units, &enemy_units, &mut rng);

        // Both have attack 3, so higher health (p2) should come first
        assert_eq!(priority_order, vec![(Team::Player, 1), (Team::Player, 0)]);
    }

    #[test]
    fn test_priority_ordering_full_tie_random() {
        // Test tie-breaking by random when both attack and health are equal
        let player_units = vec![
            CombatUnit {
                instance_id: "p1".to_string(),
                team: Team::Player,
                attack: 3,
                health: 3,
                abilities: vec![],
                template_id: "unit1".to_string(),
                name: "Unit1".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
            CombatUnit {
                instance_id: "p2".to_string(),
                team: Team::Player,
                attack: 3,
                health: 3,
                abilities: vec![],
                template_id: "unit2".to_string(),
                name: "Unit2".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
        ];

        let enemy_units = vec![];

        // Test deterministic behavior with same seed
        let mut rng1 = StdRng::seed_from_u64(42);
        let priority_order1 = calculate_priority_order(&player_units, &enemy_units, &mut rng1);

        let mut rng2 = StdRng::seed_from_u64(42);
        let priority_order2 = calculate_priority_order(&player_units, &enemy_units, &mut rng2);

        // Should be identical with same seed
        assert_eq!(priority_order1, priority_order2);

        // Should contain both units in some order
        assert!(priority_order1.len() == 2);
        assert!(priority_order1.contains(&(Team::Player, 0)));
        assert!(priority_order1.contains(&(Team::Player, 1)));
    }

    #[test]
    fn test_priority_ordering_mixed_teams() {
        // Test priority ordering across both teams
        let player_units = vec![CombatUnit {
            instance_id: "p1".to_string(),
            team: Team::Player,
            attack: 2,
            health: 3,
            abilities: vec![],
            template_id: "unit1".to_string(),
            name: "Unit1".to_string(),
            attack_buff: 0,
            health_buff: 0,
        }];

        let enemy_units = vec![CombatUnit {
            instance_id: "e1".to_string(),
            team: Team::Enemy,
            attack: 4,
            health: 2,
            abilities: vec![],
            template_id: "unit2".to_string(),
            name: "Unit2".to_string(),
            attack_buff: 0,
            health_buff: 0,
        }];

        let mut rng = StdRng::seed_from_u64(12345);
        let priority_order = calculate_priority_order(&player_units, &enemy_units, &mut rng);

        // Enemy unit has higher attack (4) than player unit (2), so should come first
        assert_eq!(priority_order, vec![(Team::Enemy, 0), (Team::Player, 0)]);
    }

    #[test]
    fn test_priority_ordering_complex_scenario() {
        // Test a complex scenario with multiple tie-breaking cases
        let player_units = vec![
            CombatUnit {
                // Index 0: attack 5, health 1
                instance_id: "p1".to_string(),
                team: Team::Player,
                attack: 5,
                health: 1,
                abilities: vec![],
                template_id: "unit1".to_string(),
                name: "Unit1".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
            CombatUnit {
                // Index 1: attack 3, health 3
                instance_id: "p2".to_string(),
                team: Team::Player,
                attack: 3,
                health: 3,
                abilities: vec![],
                template_id: "unit2".to_string(),
                name: "Unit2".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
            CombatUnit {
                // Index 2: attack 3, health 2
                instance_id: "p3".to_string(),
                team: Team::Player,
                attack: 3,
                health: 2,
                abilities: vec![],
                template_id: "unit3".to_string(),
                name: "Unit3".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
        ];

        let enemy_units = vec![
            CombatUnit {
                // Index 0: attack 4, health 4
                instance_id: "e1".to_string(),
                team: Team::Enemy,
                attack: 4,
                health: 4,
                abilities: vec![],
                template_id: "unit4".to_string(),
                name: "Unit4".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
            CombatUnit {
                // Index 1: attack 3, health 3 (same as p2)
                instance_id: "e2".to_string(),
                team: Team::Enemy,
                attack: 3,
                health: 3,
                abilities: vec![],
                template_id: "unit5".to_string(),
                name: "Unit5".to_string(),
                attack_buff: 0,
                health_buff: 0,
            },
        ];

        let mut rng = StdRng::seed_from_u64(999); // Use a specific seed for deterministic results
        let priority_order = calculate_priority_order(&player_units, &enemy_units, &mut rng);

        // Expected order:
        // 1. p1 (attack 5) - highest attack
        // 2. e1 (attack 4) - next highest attack
        // 3. p2 (attack 3, health 3) - higher health than p3 and e2
        // 4. e2 (attack 3, health 3) - same as p2, but p2 comes first (player priority? wait, actually it's random)
        // 5. p3 (attack 3, health 2) - lowest health among attack 3 units

        // The exact order between p2 and e2 depends on the random shuffle, but we can verify the basic structure
        assert_eq!(priority_order.len(), 5);

        // p1 should be first (highest attack)
        assert_eq!(priority_order[0], (Team::Player, 0));

        // e1 should be second (next highest attack)
        assert_eq!(priority_order[1], (Team::Enemy, 0));

        // p3 should be last (lowest health among attack 3 units)
        assert_eq!(priority_order[4], (Team::Player, 2));

        // Verify all units are included (order may vary due to random tie-breaking)
        assert_eq!(priority_order.len(), 5);
        assert!(priority_order.contains(&(Team::Player, 0))); // p1
        assert!(priority_order.contains(&(Team::Player, 1))); // p2
        assert!(priority_order.contains(&(Team::Player, 2))); // p3
        assert!(priority_order.contains(&(Team::Enemy, 0))); // e1
        assert!(priority_order.contains(&(Team::Enemy, 1))); // e2
    }

    #[test]
    fn test_multiple_onfaint_triggers_cause_draw() {
        // Test case: 2 dragons vs 5 troll brutes should result in a DRAW
        // Dragons have OnStart ability dealing 3 damage to all enemies
        // Troll brutes have OnFaint ability dealing 3 damage to all enemies
        // 2 dragons × 3 damage = 6 damage kills all 5 troll brutes (5 HP each)
        // 5 troll brutes × 3 damage = 15 damage kills both dragons (12 HP each)

        let dragon_ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 3,
                target: AbilityTarget::AllEnemies,
            },
            name: "Dragon Breath".to_string(),
            description: "Deal 3 damage to all enemies at battle start".to_string(),
        };

        let troll_ability = Ability {
            trigger: AbilityTrigger::OnFaint,
            effect: AbilityEffect::Damage {
                amount: 3,
                target: AbilityTarget::AllEnemies,
            },
            name: "Death Throes".to_string(),
            description: "Deal 3 damage to all enemies on death".to_string(),
        };

        let dragon1 = UnitCard::new(1, "dragon_tyrant", "Dragon Tyrant", 8, 12, 10, 3)
            .with_ability(dragon_ability.clone());
        let dragon2 = UnitCard::new(2, "dragon_tyrant", "Dragon Tyrant", 8, 12, 10, 3)
            .with_ability(dragon_ability);

        let troll1 = UnitCard::new(3, "troll_brute", "Troll Brute", 4, 5, 5, 2)
            .with_ability(troll_ability.clone());
        let troll2 = UnitCard::new(4, "troll_brute", "Troll Brute", 4, 5, 5, 2)
            .with_ability(troll_ability.clone());
        let troll3 = UnitCard::new(5, "troll_brute", "Troll Brute", 4, 5, 5, 2)
            .with_ability(troll_ability.clone());
        let troll4 = UnitCard::new(6, "troll_brute", "Troll Brute", 4, 5, 5, 2)
            .with_ability(troll_ability.clone());
        let troll5 =
            UnitCard::new(7, "troll_brute", "Troll Brute", 4, 5, 5, 2).with_ability(troll_ability);

        let player_board = vec![BoardUnit::from_card(dragon1), BoardUnit::from_card(dragon2)];

        let enemy_board = vec![
            BoardUnit::from_card(troll1),
            BoardUnit::from_card(troll2),
            BoardUnit::from_card(troll3),
            BoardUnit::from_card(troll4),
            BoardUnit::from_card(troll5),
        ];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // Count the Death Throes triggers - should be 5 (one for each troll)
        let death_throes_count = events
            .iter()
            .filter(|e| {
                matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Death Throes")
            })
            .count();
        assert_eq!(
            death_throes_count, 5,
            "All 5 troll brutes should trigger Death Throes on death"
        );

        // The battle should end in a DRAW
        let last_event = events.last().unwrap();
        match last_event {
            CombatEvent::BattleEnd { result } => {
                assert_eq!(
                    result, "DRAW",
                    "Battle should be a DRAW: dragons killed by 5 Death Throes (15 damage > 12 HP)"
                );
            }
            _ => panic!("Last event was not BattleEnd"),
        }
    }

    #[test]
    fn test_2_dragon_tyrants_vs_4_troll_brutes_draw() {
        // Test case: 2 Dragon Tyrants vs 4 Troll Brutes should result in a DRAW
        // Dragons have OnStart ability dealing 3 damage to all enemies
        // Troll brutes have OnFaint ability dealing 3 damage to all enemies
        // 2 dragons × 3 damage = 6 damage kills all 4 troll brutes (5 HP each)
        // 4 troll brutes × 3 damage = 12 damage kills both dragons (12 HP each)

        let dragon_ability = Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 3,
                target: AbilityTarget::AllEnemies,
            },
            name: "Dragon Breath".to_string(),
            description: "Deal 3 damage to all enemies at battle start".to_string(),
        };

        let troll_ability = Ability {
            trigger: AbilityTrigger::OnFaint,
            effect: AbilityEffect::Damage {
                amount: 3,
                target: AbilityTarget::AllEnemies,
            },
            name: "Death Throes".to_string(),
            description: "Deal 3 damage to all enemies on death".to_string(),
        };

        let dragon1 = UnitCard::new(1, "dragon_tyrant", "Dragon Tyrant", 8, 12, 10, 3)
            .with_ability(dragon_ability.clone());
        let dragon2 = UnitCard::new(2, "dragon_tyrant", "Dragon Tyrant", 8, 12, 10, 3)
            .with_ability(dragon_ability);

        let troll1 = UnitCard::new(3, "troll_brute", "Troll Brute", 4, 5, 5, 2)
            .with_ability(troll_ability.clone());
        let troll2 = UnitCard::new(4, "troll_brute", "Troll Brute", 4, 5, 5, 2)
            .with_ability(troll_ability.clone());
        let troll3 = UnitCard::new(5, "troll_brute", "Troll Brute", 4, 5, 5, 2)
            .with_ability(troll_ability.clone());
        let troll4 =
            UnitCard::new(6, "troll_brute", "Troll Brute", 4, 5, 5, 2).with_ability(troll_ability);

        let player_board = vec![BoardUnit::from_card(dragon1), BoardUnit::from_card(dragon2)];

        let enemy_board = vec![
            BoardUnit::from_card(troll1),
            BoardUnit::from_card(troll2),
            BoardUnit::from_card(troll3),
            BoardUnit::from_card(troll4),
        ];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // Count the Death Throes triggers - should be 4 (one for each troll)
        let death_throes_count = events
            .iter()
            .filter(|e| {
                matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Death Throes")
            })
            .count();
        assert_eq!(
            death_throes_count, 4,
            "All 4 troll brutes should trigger Death Throes on death"
        );

        // The battle should end in a DRAW
        let last_event = events.last().unwrap();
        match last_event {
            CombatEvent::BattleEnd { result } => {
                assert_eq!(
                    result, "DRAW",
                    "Battle should be a DRAW: dragons killed by 4 Death Throes (12 damage = 12 HP)"
                );
            }
            _ => panic!("Last event was not BattleEnd"),
        }
    }

    #[test]
    fn test_zombie_captain_spawns_blocked_by_full_board() {
        // Test scenario: 5 Zombie Captains on board, enemy kills one
        // Zombie Captain has 2 OnFaint abilities that spawn Zombie Soldiers
        // Board starts full (5 units), after one dies (4 units), first spawn succeeds (5 units), second is blocked

        let rally_ability = Ability {
            trigger: AbilityTrigger::OnFaint,
            effect: AbilityEffect::SpawnUnit {
                template_id: "zombie_soldier".to_string(),
            },
            name: "Rally the Dead".to_string(),
            description: "Spawn a Zombie Soldier on death".to_string(),
        };

        // Create Zombie Captain with 2 OnFaint abilities
        let zombie_captain = UnitCard::new(1, "zombie_captain", "Zombie Captain", 3, 4, 4, 2)
            .with_ability(rally_ability.clone())
            .with_ability(rally_ability);

        let player_board = vec![
            BoardUnit::from_card(zombie_captain.clone()),
            BoardUnit::from_card(zombie_captain.clone()),
            BoardUnit::from_card(zombie_captain.clone()),
            BoardUnit::from_card(zombie_captain.clone()),
            BoardUnit::from_card(zombie_captain),
        ];

        // Enemy with high attack and low health to kill one Zombie Captain and die itself
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(
            6, "killer", "Killer", 10, 1, 1, 1,
        ))];

        let events = crate::battle::resolve_battle(&player_board, &enemy_board, 42);

        // Should have 2 "Rally the Dead" ability triggers (both OnFaint abilities fire)
        let rally_triggers = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Rally the Dead"))
            .count();
        assert_eq!(
            rally_triggers, 1,
            "The first Rally the Dead ability triggers, the second is blocked by full board"
        );

        // But only 1 UnitSpawn event (second spawn blocked by full board)
        let spawn_events = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::UnitSpawn { .. }))
            .count();
        assert_eq!(
            spawn_events, 1,
            "Only 1 Zombie Soldier should spawn due to board being full"
        );
    }
}
