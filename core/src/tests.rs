#[cfg(test)]
mod tests {
    use crate::battle::CombatEvent;
    use crate::state::*;
    use crate::types::*;

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
}
