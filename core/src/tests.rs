#[cfg(test)]
mod tests {
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
        let player_board = vec![BoardUnit::from_card(UnitCard::new(1, "p1", "Glass Cannon", 10, 5, 0, 0))];
        let enemy_board = vec![BoardUnit::from_card(UnitCard::new(2, "e1", "Glass Cannon", 10, 5, 0, 0))];

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
}