#[cfg(test)]
mod tests {
    use crate::battle::{BattleResult, BattleSimulator, CombatUnit};
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
        // Run the same battle twice and verify results match
        let player_units = vec![
            CombatUnit {
                name: "Warrior".to_string(),
                attack: 3,
                health: 5,
                max_health: 5,
            },
            CombatUnit {
                name: "Archer".to_string(),
                attack: 2,
                health: 3,
                max_health: 3,
            },
        ];

        let enemy_units = vec![
            CombatUnit {
                name: "Goblin".to_string(),
                attack: 2,
                health: 4,
                max_health: 4,
            },
            CombatUnit {
                name: "Orc".to_string(),
                attack: 3,
                health: 3,
                max_health: 3,
            },
        ];

        let sim1 = BattleSimulator::new(player_units.clone(), enemy_units.clone());
        let (result1, events1) = sim1.simulate();

        let sim2 = BattleSimulator::new(player_units, enemy_units);
        let (result2, events2) = sim2.simulate();

        // Results should be identical
        assert_eq!(events1.len(), events2.len(), "Event counts should match");

        match (&result1, &result2) {
            (BattleResult::Victory { remaining: r1 }, BattleResult::Victory { remaining: r2 }) => {
                assert_eq!(r1, r2, "Victory remaining counts should match");
            }
            (BattleResult::Defeat { remaining: r1 }, BattleResult::Defeat { remaining: r2 }) => {
                assert_eq!(r1, r2, "Defeat remaining counts should match");
            }
            (BattleResult::Draw, BattleResult::Draw) => {}
            _ => panic!("Results don't match"),
        }
    }

    #[test]
    fn test_combat_simultaneous_damage() {
        // Both units should damage each other simultaneously
        let player_units = vec![CombatUnit {
            name: "Player".to_string(),
            attack: 10,
            health: 5,
            max_health: 5,
        }];

        let enemy_units = vec![CombatUnit {
            name: "Enemy".to_string(),
            attack: 10,
            health: 5,
            max_health: 5,
        }];

        let sim = BattleSimulator::new(player_units, enemy_units);
        let (result, _events) = sim.simulate();

        // Both should die simultaneously = draw
        match result {
            BattleResult::Draw => {}
            _ => panic!("Expected draw when both units kill each other simultaneously"),
        }
    }

    #[test]
    fn test_find_empty_slots() {
        let mut state = GameState::new();

        // Initially all bench and board slots should be empty
        assert_eq!(state.find_empty_bench_slot(), Some(0));
        assert_eq!(state.find_empty_board_slot(), Some(0));

        // Fill first bench slot
        let card = UnitCard::new(1, "test", "Test", 1, 1, 1, 1);
        state.bench[0] = Some(card.clone());

        assert_eq!(state.find_empty_bench_slot(), Some(1));

        // Fill all bench slots
        for i in 0..BENCH_SIZE {
            state.bench[i] = Some(card.clone());
        }

        assert_eq!(state.find_empty_bench_slot(), None);
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
}
