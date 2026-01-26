#[cfg(test)]
mod tests {
    use crate::battle::{resolve_battle, BattleResult, CombatEvent, Team, UnitId};
    use crate::rng::XorShiftRng;
    use crate::state::GameState;
    use crate::types::*;

    /// Helper to run a battle with a seed (creates XorShiftRng internally)
    fn run_battle(
        player_board: &[BoardUnit],
        enemy_board: &[BoardUnit],
        seed: u64,
    ) -> Vec<CombatEvent> {
        let mut rng = XorShiftRng::seed_from_u64(seed);
        resolve_battle(player_board, enemy_board, &mut rng)
    }

    // ==========================================
    // HELPER FUNCTIONS (Boilerplate Reduction)
    // ==========================================

    fn create_dummy_card(id: u32, name: &str, atk: i32, hp: i32) -> UnitCard {
        UnitCard::new(id, name, name, atk, hp, 1, 1, false)
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
            condition: crate::types::AbilityCondition::default(),
            max_triggers: None,
        }
    }

    // ==========================================
    // 1. SANITY CHECKS (Mana & Basic State)
    // ==========================================

    #[test]
    fn test_mana_limit_calculation() {
        let state = GameState::new(42);
        assert_eq!(state.calculate_mana_limit(), 3, "Round 1 mana limit should be 3");

        let mut state2 = GameState::new(42);
        state2.round = 5;
        assert_eq!(state2.calculate_mana_limit(), 7, "Round 5 mana limit should be 7");

        let mut state3 = GameState::new(42);
        state3.round = 20;
        assert_eq!(state3.calculate_mana_limit(), 10, "Mana limit caps at 10");
    }

    #[test]
    fn test_hand_derivation_deterministic() {
        use crate::units::get_starter_templates;

        // Create a state with a known bag
        let mut state = GameState::new(12345);
        let templates = get_starter_templates();
        for template in &templates {
            if template.is_token {
                continue;
            }
            for _ in 0..3 {
                let id = state.generate_card_id();
                let card = UnitCard::new(
                    id, template.template_id, template.name,
                    template.attack, template.health,
                    template.play_cost, template.pitch_value,
                    template.is_token,
                );
                state.bag.push(card);
            }
        }

        // Same seed + round should always produce same hand
        let hand1 = state.derive_hand_indices();
        let hand2 = state.derive_hand_indices();
        assert_eq!(hand1, hand2, "Same state should produce same hand");

        // Different round should produce different hand
        let mut state2 = state.clone();
        state2.round = 2;
        let hand3 = state2.derive_hand_indices();
        assert_ne!(hand1, hand3, "Different round should produce different hand");

        // Different seed should produce different hand
        let mut state3 = state.clone();
        state3.game_seed = 99999;
        let hand4 = state3.derive_hand_indices();
        assert_ne!(hand1, hand4, "Different seed should produce different hand");
    }

    #[test]
    fn test_hand_derivation_unique_indices() {
        let mut state = GameState::new(42);
        // Add enough cards
        for i in 0..20 {
            let card = UnitCard::new(i + 1, "test", "Test", 1, 1, 1, 1, false);
            state.bag.push(card);
        }

        let hand = state.derive_hand_indices();
        assert_eq!(hand.len(), 7, "Hand should have HAND_SIZE cards");

        // All indices should be unique
        let mut sorted = hand.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), hand.len(), "Hand indices must be unique");

        // All indices should be valid
        for &idx in &hand {
            assert!(idx < state.bag.len(), "Hand index should be within bag bounds");
        }
    }

    #[test]
    fn test_verify_and_apply_turn() {
        use crate::commit::verify_and_apply_turn;
        use crate::state::BOARD_SIZE;

        let mut state = GameState::new(42);
        state.mana_limit = 5;
        // Add cards with known costs
        for i in 0..10 {
            let card = UnitCard::new(i + 1, "test", "Test", 2, 2, 1, 2, false);
            state.bag.push(card);
        }

        let hand_indices = state.derive_hand_indices();
        let bag_len_before = state.bag.len();

        // Pitch hand card 0 for mana, play hand card 1 to board slot 0
        let card_to_play = state.bag[hand_indices[1]].clone();
        let mut new_board: Vec<Option<BoardUnit>> = vec![None; BOARD_SIZE];
        new_board[0] = Some(BoardUnit::from_card(card_to_play));

        let action = CommitTurnAction {
            new_board,
            pitched_from_hand: vec![0],
            played_from_hand: vec![1],
            pitched_from_board: vec![],
        };

        let result = verify_and_apply_turn(&mut state, &action);
        assert!(result.is_ok(), "Valid turn should succeed: {:?}", result);

        // 2 cards removed from bag (1 pitched + 1 played)
        assert_eq!(state.bag.len(), bag_len_before - 2);

        // Board should have the played card
        assert!(state.board[0].is_some());
    }

    #[test]
    fn test_verify_and_apply_turn_with_refill() {
        use crate::commit::verify_and_apply_turn;
        use crate::state::BOARD_SIZE;

        let mut state = GameState::new(42);
        state.mana_limit = 4; // Capacity is 4

        // Add cards with cost 4 and pitch 4
        for i in 0..10 {
            let card = UnitCard::new(i + 1, "test", "Test", 2, 2, 4, 4, false);
            state.bag.push(card);
        }

        let hand_indices = state.derive_hand_indices();
        
        // Scenario: 
        // 1. Pitch hand[0] (value 4). Current mana = 4.
        // 2. Play hand[1] (cost 4). Current mana = 0.
        // 3. Pitch hand[2] (value 4). Current mana = 4.
        // 4. Play hand[3] (cost 4). Current mana = 0.
        // Total spent = 8. Total earned = 8. Limit = 4.
        // This should be LEGAL because each card is <= limit and total spend <= total earned.

        let card_1 = state.bag[hand_indices[1]].clone();
        let card_3 = state.bag[hand_indices[3]].clone();
        
        let mut new_board: Vec<Option<BoardUnit>> = vec![None; BOARD_SIZE];
        new_board[0] = Some(BoardUnit::from_card(card_1));
        new_board[1] = Some(BoardUnit::from_card(card_3));

        let action = CommitTurnAction {
            new_board,
            pitched_from_hand: vec![0, 2],
            played_from_hand: vec![1, 3],
            pitched_from_board: vec![],
        };

        let result = verify_and_apply_turn(&mut state, &action);
        assert!(result.is_ok(), "Turn with refill should succeed: {:?}", result);
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

        let events = run_battle(&p_board, &e_board, 123);

        let last = events.last().unwrap();
        if let CombatEvent::BattleEnd { result } = last {
            assert_eq!(*result, BattleResult::Draw);
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
            condition: crate::types::AbilityCondition::default(),
            max_triggers: None,
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
            is_token: false,
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
            is_token: false,
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
            UnitCard::new(1, "Unit", "Unit", 5, 5, 0, 0, false).with_abilities(vec![ability_a, ability_b]),
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
        let u1 = BoardUnit::from_card(UnitCard::new(1, "U1", "U1", 10, 1, 0, 0, false).with_ability(
            create_ability(
                AbilityTrigger::OnStart,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 0,
                    target: AbilityTarget::SelfUnit,
                },
                "U1",
            ),
        ));

        // U2: 5 Atk, 10 HP (Priority 2)
        let u2 = create_tester_unit(2, "U2", 5, 10, "U2");

        // U3: 5 Atk, 5 HP, Player Team (Priority 3)
        let u3 = create_tester_unit(3, "U3", 5, 5, "U3");

        // U4: 5 Atk, 5 HP, Enemy Team (Priority 4)
        let u4 = BoardUnit::from_card(UnitCard::new(4, "U4", "U4", 5, 5, 0, 0, false).with_ability(
            create_ability(
                AbilityTrigger::OnStart,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 0,
                    target: AbilityTarget::SelfUnit,
                },
                "U4",
            ),
        ));

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
        let u4 =
            BoardUnit::from_card(UnitCard::new(4, "U4", "U4", 5, 5, 0, 0, false).with_ability(ability_u4));

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

        let events = run_battle(&p_board, &e_board, 42);

        // Verify triggers happened
        let has_nuke = events.iter().any(|e| {
            matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Nuke")
        });
        let has_revenge = events.iter().any(|e| {
            matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Revenge")
        });

        assert!(has_nuke);
        assert!(has_revenge);

        // Verify Draw
        if let CombatEvent::BattleEnd { result } = events.last().unwrap() {
            assert_eq!(*result, BattleResult::Draw);
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

        let events = run_battle(&p_board, &e_board, 42);

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
            assert_eq!(*target_instance_id, UnitId::player(1)); // Should target unit with ID 1
            assert_eq!(*health_change, 5);
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
        let lich =
            create_dummy_card(2, "Lich", 3, 3).with_abilities(vec![lich_destroy, lich_spawn]);

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
    fn test_berserker_combo() {
        // Setup: [Pain Smith, Raging Orc]
        // Pain Smith: OnStart -> 1. Damage(1, AllAllies), 2. Buff(+2, AllAllies)
        // Raging Orc: 2/8. OnDamageTaken -> Buff(+2, Self).

        // Construct Pain Smith (Manual)
        let smith_buff = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 2,
                target: AbilityTarget::AllAllies,
            },
            "Sharpen",
        );
        let smith_dmg = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Damage {
                amount: 1,
                target: AbilityTarget::AllAllies,
            },
            "Fire",
        );
        // Push in reverse order of execution (Pop LIFO)
        // We want Damage (Fire) first, then Buff (Sharpen).
        // So Vec = [Sharpen, Fire]. Pop -> Fire. Pop -> Sharpen.
        let pain_smith =
            create_dummy_card(1, "Smith", 3, 3).with_abilities(vec![smith_buff, smith_dmg]);

        // Construct Raging Orc
        let orc_rage = create_ability(
            AbilityTrigger::OnDamageTaken,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 2,
                target: AbilityTarget::SelfUnit,
            },
            "Berserk",
        );
        let raging_orc = create_dummy_card(2, "Orc", 2, 8).with_ability(orc_rage);

        let p_board = vec![
            BoardUnit::from_card(pain_smith),
            BoardUnit::from_card(raging_orc),
        ];
        let e_board = vec![create_dummy_enemy()];

        let events = run_battle(&p_board, &e_board, 42);

        // Analyze final stats via events or just trust logic?
        // Let's trace events for "AbilityModifyStats" on the Orc (ID 2).
        // Expected events:
        // 1. AbilityDamage (Smith -> Orc, 1 dmg). Orc HP 8->7.
        // 2. AbilityTrigger (Orc, Berserk).
        // 3. AbilityModifyStats (Orc -> Orc, +2 atk). Orc Atk 2->4.
        // 4. AbilityModifyStats (Smith -> Orc, +2 atk). Orc Atk 4->6.
        // Final Orc: 6/7.

        // Filter modify stats on target "p-2" (Unit 2)
        // Actually IDs are "p-1", "p-2". Orc is p-2.
        let orc_buffs: Vec<i32> = events
            .iter()
            .filter_map(|e| {
                if let CombatEvent::AbilityModifyStats {
                    target_instance_id,
                    attack_change,
                    ..
                } = e
                {
                    if *target_instance_id == UnitId::player(2) {
                        return Some(*attack_change);
                    }
                }
                None
            })
            .collect();

        assert_eq!(
            orc_buffs.iter().sum::<i32>(),
            4,
            "Orc should gain +4 Attack total (+2 Self, +2 Smith)"
        );
        assert_eq!(orc_buffs.len(), 2, "Orc should receive 2 distinct buffs");

        // Verify Damage
        let orc_dmg = events.iter().find(|e| {
             matches!(e, CombatEvent::AbilityDamage { target_instance_id, .. } if *target_instance_id == UnitId::player(2))
        });
        assert!(orc_dmg.is_some(), "Orc should take damage");
    }

    #[test]
    fn test_fatal_damage_trigger() {
        // SCENARIO: Unit takes fatal damage but should still trigger its "OnHurt" ability.
        // Player: "Martyr" (1/1). Ability: OnDamageTaken -> Deal 5 damage to FrontEnemy.
        // Enemy: "Killer" (10/10).
        // Result: Killer hits Martyr (10 dmg). Martyr dies (-9 HP). Martyr trigger fires (5 dmg to Killer).
        // Final Killer HP: 5.

        let revenge_shot = create_ability(
            AbilityTrigger::OnDamageTaken,
            AbilityEffect::Damage {
                amount: 5,
                target: AbilityTarget::FrontEnemy,
            },
            "Revenge",
        );

        let martyr = create_dummy_card(1, "Martyr", 1, 1).with_ability(revenge_shot);
        let killer = create_dummy_card(2, "Killer", 10, 10);

        let p_board = vec![BoardUnit::from_card(martyr)];
        let e_board = vec![BoardUnit::from_card(killer)];

        let events = run_battle(&p_board, &e_board, 42);

        // 1. Verify Martyr died
        let deaths = events
            .iter()
            .filter(|e| matches!(e, CombatEvent::UnitDeath { .. }))
            .count();
        assert!(deaths >= 1, "Martyr should have died");

        // 2. Verify Revenge Triggered
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
            triggers.contains(&&"Revenge".to_string()),
            "Revenge ability should trigger on fatal damage"
        );

        // 3. Verify Damage to Killer
        // Killer started with 10 HP. Took 1 damage from Martyr attack (clash) + 5 damage from Ability.
        // Total damage: 6. Remaining HP: 4.
        // Wait, did I set Martyr attack to 1? Yes.
        // Clash: Martyr deals 1 to Killer. Killer deals 10 to Martyr.
        // Martyr Trigger: Deals 5 to Killer.
        // Total Killer Damage: 1 + 5 = 6.

        // Find final HP update for Killer (e-1)
        let _final_hp_event = events.iter().rev().find_map(|e| {
            if let CombatEvent::DamageTaken {
                target_instance_id,
                remaining_hp,
                ..
            } = e
            {
                if *target_instance_id == UnitId::enemy(1) {
                    return Some(*remaining_hp);
                }
            }

            // Also check AbilityDamage

            if let CombatEvent::AbilityDamage {
                target_instance_id,
                remaining_hp,
                ..
            } = e
            {
                if *target_instance_id == UnitId::enemy(1) {
                    return Some(*remaining_hp);
                }
            }

            None
        });

        // Let's just look for the specific AbilityDamage event

        let ability_dmg = events.iter().find(|e| {
            matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(1) && *damage == 5)
        });

        assert!(
            ability_dmg.is_some(),
            "Killer (e-1) should take 5 ability damage"
        );
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
    fn test_snipe_lowest_health() {
        // P: [Headhunter]. Ability: OnStart -> 5 dmg to LowestHealthEnemy.
        // E: [Tank (10 HP), Glass (2 HP), Utility (5 HP)].
        // Result: Glass should take 5 damage and die.

        let headhunter_ability = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Damage {
                amount: 5,
                target: AbilityTarget::LowestHealthEnemy,
            },
            "SnipeLowest",
        );

        let hh = create_dummy_card(1, "Headhunter", 4, 2).with_ability(headhunter_ability);

        let tank = create_dummy_card(2, "Tank", 1, 10);
        let glass = create_dummy_card(3, "Glass", 1, 2);
        let utility = create_dummy_card(4, "Utility", 1, 5);

        let p_board = vec![BoardUnit::from_card(hh)];
        let e_board = vec![
            BoardUnit::from_card(tank),
            BoardUnit::from_card(glass),
            BoardUnit::from_card(utility),
        ];

        let events = run_battle(&p_board, &e_board, 42);

        // Verify "Glass" (e-3) died
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
        // P: [GiantSlayer]. Ability: OnStart -> 3 dmg to HighestAttackEnemy.
        // E: [Weak (1 Atk), Strong (10 Atk), Medium (5 Atk)].
        // Result: Strong should take 3 damage.

        let giantslayer_ability = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Damage {
                amount: 3,
                target: AbilityTarget::HighestAttackEnemy,
            },
            "SnipeStrongest",
        );

        let gs = create_dummy_card(1, "GiantSlayer", 2, 2).with_ability(giantslayer_ability);

        let weak = create_dummy_card(2, "Weak", 1, 10);
        let strong = create_dummy_card(3, "Strong", 10, 10);
        let medium = create_dummy_card(4, "Medium", 5, 10);

        let p_board = vec![BoardUnit::from_card(gs)];
        let e_board = vec![
            BoardUnit::from_card(weak),
            BoardUnit::from_card(strong),
            BoardUnit::from_card(medium),
        ];

        let events = run_battle(&p_board, &e_board, 42);

        // Verify "Strong" (e-2) took 3 damage
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
                target: AbilityTarget::HighestHealthEnemy,
            },
            "SnipeHighestHP",
        );

        let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);
        let weak = create_dummy_card(2, "Weak", 1, 5);
        let healthy = create_dummy_card(3, "Healthy", 1, 20);
        let medium = create_dummy_card(4, "Medium", 1, 10);

        let p_board = vec![BoardUnit::from_card(sniper)];
        let e_board = vec![
            BoardUnit::from_card(weak),
            BoardUnit::from_card(healthy),
            BoardUnit::from_card(medium),
        ];

        let events = run_battle(&p_board, &e_board, 42);

        // Verify "Healthy" (e-2) took damage
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
                target: AbilityTarget::LowestAttackEnemy,
            },
            "SnipeLowestAtk",
        );

        let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);
        let strong = create_dummy_card(2, "Strong", 10, 10);
        let weak = create_dummy_card(3, "Weak", 1, 10);
        let medium = create_dummy_card(4, "Medium", 5, 10);

        let p_board = vec![BoardUnit::from_card(sniper)];
        let e_board = vec![
            BoardUnit::from_card(strong),
            BoardUnit::from_card(weak),
            BoardUnit::from_card(medium),
        ];

        let events = run_battle(&p_board, &e_board, 42);

        // Verify "Weak" (e-2) took damage
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
                target: AbilityTarget::HighestManaEnemy,
            },
            "SnipeHighestMana",
        );

        let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);

        // Manual units with specific costs
        let cheap = UnitCard::new(2, "Cheap", "Cheap", 1, 10, 1, 0, false);
        let expensive = UnitCard::new(3, "Expensive", "Expensive", 1, 10, 10, 0, false);
        let medium = UnitCard::new(4, "Medium", "Medium", 1, 10, 5, 0, false);

        let p_board = vec![BoardUnit::from_card(sniper)];
        let e_board = vec![
            BoardUnit::from_card(cheap),
            BoardUnit::from_card(expensive),
            BoardUnit::from_card(medium),
        ];

        let events = run_battle(&p_board, &e_board, 42);

        // Verify "Expensive" (e-2) took damage
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
                target: AbilityTarget::LowestManaEnemy,
            },
            "SnipeLowestMana",
        );

        let sniper = create_dummy_card(1, "Sniper", 1, 1).with_ability(snipe_ability);

        // Manual units with specific costs
        let expensive = UnitCard::new(2, "Expensive", "Expensive", 1, 10, 10, 0, false);
        let cheap = UnitCard::new(3, "Cheap", "Cheap", 1, 10, 1, 0, false);
        let medium = UnitCard::new(4, "Medium", "Medium", 1, 10, 5, 0, false);

        let p_board = vec![BoardUnit::from_card(sniper)];
        let e_board = vec![
            BoardUnit::from_card(expensive),
            BoardUnit::from_card(cheap),
            BoardUnit::from_card(medium),
        ];

        let events = run_battle(&p_board, &e_board, 42);

        // Verify "Cheap" (e-2) took damage
        let hit = events.iter().find(|e| {
            matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
                if *target_instance_id == UnitId::enemy(2) && *damage == 5)
        });

        assert!(hit.is_some(), "Lowest Mana enemy should have been sniped");
    }

    #[test]
    fn test_mana_reaper_dual_kill() {
        // P: [ManaReaper]. Abilities: 1. Destroy HighestMana, 2. Destroy LowestMana
        // E: [Cheap (1 Mana), Medium (5 Mana), Expensive (10 Mana)]
        // Result: Cheap and Expensive should both die.

        let reaper_ability_high = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Destroy {
                target: AbilityTarget::HighestManaEnemy,
            },
            "Harvest",
        );
        let reaper_ability_low = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Destroy {
                target: AbilityTarget::LowestManaEnemy,
            },
            "Cull",
        );

        let reaper = create_dummy_card(1, "ManaReaper", 2, 2)
            .with_abilities(vec![reaper_ability_high, reaper_ability_low]);

        let cheap = UnitCard::new(2, "Cheap", "Cheap", 1, 10, 1, 0, false);
        let medium = UnitCard::new(3, "Medium", "Medium", 1, 10, 5, 0, false);
        let expensive = UnitCard::new(4, "Expensive", "Expensive", 1, 10, 10, 0, false);

        let p_board = vec![BoardUnit::from_card(reaper)];
        let e_board = vec![
            BoardUnit::from_card(cheap),
            BoardUnit::from_card(medium),
            BoardUnit::from_card(expensive),
        ];

        let events = run_battle(&p_board, &e_board, 42);

        // Analyze deaths
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

        // Expensive is e-3, Cheap is e-1.
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
    fn test_shield_squire_support() {
        // P: [Fodder (1/10), Squire (2/3)]. Squire: BeforeAttack -> +2 HP to AllyAhead.
        // E: [Sandbag (0/50)].
        // Result: Fodder should gain 2 HP before the clash.

        let squire_ability = create_ability(
            AbilityTrigger::BeforeAnyAttack,
            AbilityEffect::ModifyStats {
                health: 2,
                attack: 0,
                target: AbilityTarget::AllyAhead,
            },
            "Squire Shield",
        );

        let fodder = create_dummy_card(1, "Fodder", 1, 10);
        let squire = create_dummy_card(2, "Squire", 2, 3).with_ability(squire_ability);

        let p_board = vec![BoardUnit::from_card(fodder), BoardUnit::from_card(squire)];
        let e_board = vec![create_dummy_enemy()]; // 0 Atk enemy

        let events = run_battle(&p_board, &e_board, 42);

        // Find the ModifyStats event where Squire (p-2) buffs Fodder (p-1)
        let buff_event = events.iter().find(|e| {
            matches!(e, CombatEvent::AbilityModifyStats { source_instance_id, target_instance_id, health_change, .. }
                if *source_instance_id == UnitId::player(2) && *target_instance_id == UnitId::player(1) && *health_change == 2)
        });

        assert!(
            buff_event.is_some(),
            "Shield Squire should have buffed the unit in front before the attack"
        );
    }

    #[test]
    fn test_attack_trigger_scopes() {
        // SCENARIO:
        // P: [Front (1/10), Support (1/10)]
        // Front has BeforeUnitAttack -> +1 Atk
        // Support has BeforeUnitAttack -> +1 Atk (Should NOT trigger)
        // Support has BeforeAnyAttack -> +1 Atk (Should trigger)

        let front_unit = BoardUnit::from_card(
            UnitCard::new(1, "Front", "Front", 1, 10, 0, 0, false).with_ability(create_ability(
                AbilityTrigger::BeforeUnitAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::SelfUnit,
                },
                "FrontUnitTrigger",
            )),
        );

        let support_unit = BoardUnit::from_card(
            UnitCard::new(2, "Support", "Support", 1, 10, 0, 0, false).with_abilities(vec![
                create_ability(
                    AbilityTrigger::BeforeUnitAttack,
                    AbilityEffect::ModifyStats {
                        health: 0,
                        attack: 1,
                        target: AbilityTarget::SelfUnit,
                    },
                    "SupportUnitTrigger",
                ),
                create_ability(
                    AbilityTrigger::BeforeAnyAttack,
                    AbilityEffect::ModifyStats {
                        health: 0,
                        attack: 1,
                        target: AbilityTarget::SelfUnit,
                    },
                    "SupportAnyTrigger",
                ),
            ]),
        );

        let p_board = vec![front_unit, support_unit];
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

        // EXPECTATION:
        // 1. "FrontUnitTrigger" fires (Position 0)
        // 2. "SupportAnyTrigger" fires (Position 1 is allowed for "Any")
        // 3. "SupportUnitTrigger" DOES NOT fire (Position 1 is not front)

        assert!(triggers.contains(&"FrontUnitTrigger".to_string()));
        assert!(triggers.contains(&"SupportAnyTrigger".to_string()));
        assert!(
            !triggers.contains(&"SupportUnitTrigger".to_string()),
            "Support unit should not fire BeforeUnitAttack triggers"
        );
    }

    #[test]
    fn test_after_attack_trigger_scopes() {
        // Similar to above but for After variants
        let front_unit = BoardUnit::from_card(
            UnitCard::new(1, "Front", "Front", 1, 10, 0, 0, false).with_ability(create_ability(
                AbilityTrigger::AfterUnitAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::SelfUnit,
                },
                "FrontAfterUnit",
            )),
        );

        let support_unit = BoardUnit::from_card(
            UnitCard::new(2, "Support", "Support", 1, 10, 0, 0, false).with_abilities(vec![
                create_ability(
                    AbilityTrigger::AfterUnitAttack,
                    AbilityEffect::ModifyStats {
                        health: 0,
                        attack: 1,
                        target: AbilityTarget::SelfUnit,
                    },
                    "SupportAfterUnit",
                ),
                create_ability(
                    AbilityTrigger::AfterAnyAttack,
                    AbilityEffect::ModifyStats {
                        health: 0,
                        attack: 1,
                        target: AbilityTarget::SelfUnit,
                    },
                    "SupportAfterAny",
                ),
            ]),
        );

        let p_board = vec![front_unit, support_unit];
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

        assert!(triggers.contains(&"FrontAfterUnit".to_string()));
        assert!(triggers.contains(&"SupportAfterAny".to_string()));
        assert!(
            !triggers.contains(&"SupportAfterUnit".to_string()),
            "Support unit should not fire AfterUnitAttack triggers"
        );
    }

    #[test]
    fn test_unified_priority_cross_triggers() {
        // SCENARIO: Verify that UnitAttack and AnyAttack triggers are prioritized together.
        // P: [HighAtkFront (10 Atk), LowAtkBack (1 Atk)]
        // HighAtkFront: BeforeUnitAttack
        // LowAtkBack: BeforeAnyAttack

        // EXPECTATION: HighAtkFront should trigger FIRST because it has higher power,
        // even though it's a different trigger type than LowAtkBack.

        let high_atk_front = BoardUnit::from_card(
            UnitCard::new(1, "High", "High", 10, 10, 0, 0, false).with_ability(create_ability(
                AbilityTrigger::BeforeUnitAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::SelfUnit,
                },
                "HighUnitTrigger",
            )),
        );

        let low_atk_back = BoardUnit::from_card(
            UnitCard::new(2, "Low", "Low", 1, 10, 0, 0, false).with_ability(create_ability(
                AbilityTrigger::BeforeAnyAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::SelfUnit,
                },
                "LowAnyTrigger",
            )),
        );

        let p_board = vec![high_atk_front, low_atk_back];
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

        let high_idx = triggers
            .iter()
            .position(|n| n == "HighUnitTrigger")
            .unwrap();
        let low_idx = triggers.iter().position(|n| n == "LowAnyTrigger").unwrap();

        assert!(high_idx < low_idx, "High Attack unit should trigger its 'Unit' ability before Low Attack unit triggers its 'Any' ability.");
    }

    #[test]
    fn test_infinite_battle_draw() {
        // SCENARIO: Both sides have Goblin Grunt (2/2) + Shield Squire (2/3).
        // Every round:
        // 1. Squire buffs Grunt (+2 HP). Grunt is now 2/4.
        // 2. Grunts clash (2 dmg). Grunt is back to 2/2.
        // This repeats forever. The engine must catch it.

        let grunt = create_dummy_card(1, "Grunt", 2, 2);
        let squire = create_dummy_card(2, "Squire", 2, 3).with_ability(create_ability(
            AbilityTrigger::BeforeAnyAttack,
            AbilityEffect::ModifyStats {
                health: 2,
                attack: 0,
                target: AbilityTarget::AllyAhead,
            },
            "SquireShield",
        ));

        let p_board = vec![
            BoardUnit::from_card(grunt.clone()),
            BoardUnit::from_card(squire.clone()),
        ];
        let e_board = vec![BoardUnit::from_card(grunt), BoardUnit::from_card(squire)];

        let events = run_battle(&p_board, &e_board, 42);

        // 1. Verify Battle End result is DRAW
        let last_event = events.last().unwrap();
        if let CombatEvent::BattleEnd { result } = last_event {
            assert_eq!(*result, BattleResult::Draw, "Stalemate should result in a DRAW");
        } else {
            panic!("Battle did not end correctly: {:?}", last_event);
        }

        // 2. Verify LimitExceeded event exists
        let has_limit_exceeded = events
            .iter()
            .any(|e| matches!(e, CombatEvent::LimitExceeded { .. }));
        assert!(
            has_limit_exceeded,
            "Stalemate should trigger a LimitExceeded event"
        );
    }

    // ==========================================
    // CONDITION SYSTEM TESTS
    // ==========================================

    #[test]
    fn test_condition_target_health_threshold() {
        // SCENARIO: "Nurse Goblin" heals ally ahead by +2 HP only if target HP <= 6.
        // Test 1: Ally with 5 HP should be healed.
        // Test 2: Ally with 10 HP should NOT be healed.

        // Helper to create nurse goblin
        let create_nurse = || {
            create_dummy_card(2, "Nurse", 1, 3).with_ability(Ability {
                trigger: AbilityTrigger::BeforeAnyAttack,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 0,
                    target: AbilityTarget::AllyAhead,
                },
                name: "Emergency Heal".to_string(),
                description: "Heal ally ahead if HP <= 6".to_string(),
                condition: AbilityCondition::TargetHealthLessThanOrEqual { value: 6 },
                max_triggers: None,
            })
        };

        // Test 1: Low HP ally SHOULD be healed
        {
            let tank = create_dummy_card(1, "Tank", 5, 5); // HP = 5 <= 6, should heal
            let nurse = create_nurse();
            let enemy = create_dummy_card(3, "Enemy", 1, 10);

            let p_board = vec![BoardUnit::from_card(tank), BoardUnit::from_card(nurse)];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 123);

            // Look for the heal trigger
            let heal_triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Emergency Heal"
                } else {
                    false
                }
            });

            assert!(heal_triggered, "Nurse should heal ally with HP <= 6");
        }

        // Test 2: High HP ally should NOT be healed
        {
            let tank = create_dummy_card(1, "Tank", 5, 10); // HP = 10 > 6, should NOT heal
            let nurse = create_nurse();
            let enemy = create_dummy_card(3, "Enemy", 1, 5);

            let p_board = vec![BoardUnit::from_card(tank), BoardUnit::from_card(nurse)];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 456);

            // Nurse's ability should NOT trigger
            let heal_triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Emergency Heal"
                } else {
                    false
                }
            });

            assert!(!heal_triggered, "Nurse should NOT heal ally with HP > 6");
        }
    }

    #[test]
    fn test_condition_ally_count() {
        // SCENARIO: "Pack Leader" buffs all allies +1/+1 only if ally count >= 3.
        // Test 1: With 3 allies, buff should trigger.
        // Test 2: With 2 allies, buff should NOT trigger.

        let create_pack_leader = || {
            create_dummy_card(1, "PackLeader", 2, 3).with_ability(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 1,
                    attack: 1,
                    target: AbilityTarget::AllAllies,
                },
                name: "Pack Tactics".to_string(),
                description: "Buff all allies if 3+ allies".to_string(),
                condition: AbilityCondition::AllyCountAtLeast { count: 3 },
                max_triggers: None,
            })
        };

        // Test 1: 3 allies (leader + 2 others) - SHOULD trigger
        {
            let leader = create_pack_leader();
            let ally1 = create_dummy_card(2, "Ally1", 1, 1);
            let ally2 = create_dummy_card(3, "Ally2", 1, 1);
            let enemy = create_dummy_card(4, "Enemy", 1, 1);

            let p_board = vec![
                BoardUnit::from_card(leader),
                BoardUnit::from_card(ally1),
                BoardUnit::from_card(ally2),
            ];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 789);

            let buff_triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Pack Tactics"
                } else {
                    false
                }
            });

            assert!(buff_triggered, "Pack Leader should buff when 3+ allies");
        }

        // Test 2: 2 allies (leader + 1 other) - should NOT trigger
        {
            let leader = create_pack_leader();
            let ally1 = create_dummy_card(2, "Ally1", 1, 1);
            let enemy = create_dummy_card(4, "Enemy", 1, 5);

            let p_board = vec![BoardUnit::from_card(leader), BoardUnit::from_card(ally1)];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 101112);

            let buff_triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Pack Tactics"
                } else {
                    false
                }
            });

            assert!(
                !buff_triggered,
                "Pack Leader should NOT buff when < 3 allies"
            );
        }
    }

    #[test]
    fn test_condition_last_stand() {
        // SCENARIO: "Lone Wolf" gains +5 attack only when it's the sole ally.

        let create_lone_wolf = || {
            create_dummy_card(1, "LoneWolf", 2, 4).with_ability(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 5,
                    target: AbilityTarget::SelfUnit,
                },
                name: "Last Stand".to_string(),
                description: "Gain +5 attack if alone".to_string(),
                condition: AbilityCondition::AllyCountAtMost { count: 1 },
                max_triggers: None,
            })
        };

        // Test 1: Alone - SHOULD trigger
        {
            let wolf = create_lone_wolf();
            let enemy = create_dummy_card(2, "Enemy", 3, 5);

            let p_board = vec![BoardUnit::from_card(wolf)];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 1313);

            let buff_triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Last Stand"
                } else {
                    false
                }
            });

            assert!(
                buff_triggered,
                "Lone Wolf should trigger Last Stand when alone"
            );
        }

        // Test 2: With ally - should NOT trigger
        {
            let wolf = create_lone_wolf();
            let ally = create_dummy_card(2, "Ally", 1, 1);
            let enemy = create_dummy_card(3, "Enemy", 3, 5);

            let p_board = vec![BoardUnit::from_card(wolf), BoardUnit::from_card(ally)];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 1414);

            let buff_triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Last Stand"
                } else {
                    false
                }
            });

            assert!(
                !buff_triggered,
                "Lone Wolf should NOT trigger Last Stand with allies"
            );
        }
    }

    #[test]
    fn test_condition_logic_gates() {
        // SCENARIO: Test AND condition - buff only if HP <= 5 AND ally count >= 2.

        let create_conditional_unit = || {
            create_dummy_card(1, "Conditional", 2, 3).with_ability(Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 3,
                    target: AbilityTarget::SelfUnit,
                },
                name: "Complex Condition".to_string(),
                description: "Buff if HP <= 5 AND 2+ allies".to_string(),
                condition: AbilityCondition::And {
                    left: Box::new(AbilityCondition::SourceHealthLessThanOrEqual { value: 5 }),
                    right: Box::new(AbilityCondition::AllyCountAtLeast { count: 2 }),
                },
                max_triggers: None,
            })
        };

        // Test 1: HP=3 (<=5) AND 2 allies - SHOULD trigger
        {
            let unit = create_conditional_unit();
            let ally = create_dummy_card(2, "Ally", 1, 1);
            let enemy = create_dummy_card(3, "Enemy", 1, 5);

            let p_board = vec![BoardUnit::from_card(unit), BoardUnit::from_card(ally)];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 1515);

            let triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Complex Condition"
                } else {
                    false
                }
            });

            assert!(triggered, "Should trigger when both AND conditions are met");
        }

        // Test 2: HP=3 (<=5) BUT only 1 ally - should NOT trigger
        {
            let unit = create_conditional_unit();
            let enemy = create_dummy_card(3, "Enemy", 1, 5);

            let p_board = vec![BoardUnit::from_card(unit)];
            let e_board = vec![BoardUnit::from_card(enemy)];

            let events = run_battle(&p_board, &e_board, 1616);

            let triggered = events.iter().any(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Complex Condition"
                } else {
                    false
                }
            });

            assert!(
                !triggered,
                "Should NOT trigger when only one AND condition is met"
            );
        }
    }

    #[test]
    fn test_max_triggers_limit() {
        // SCENARIO: A unit has an OnDamageTaken ability with max_triggers: Some(2).
        // It takes damage 3 times but the ability should only trigger twice.

        // Create a unit that spawns a zombie when damaged, limited to 2 triggers
        let create_limited_spawner = || {
            let mut card = create_dummy_card(1, "LimitedSpawner", 1, 10);
            card.abilities = vec![Ability {
                trigger: AbilityTrigger::OnDamageTaken,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::SelfUnit,
                },
                name: "Limited Rage".to_string(),
                description: "Gain +1 attack when hurt (max 2 times)".to_string(),
                condition: AbilityCondition::default(),
                max_triggers: Some(2), // Only trigger twice!
            }];
            card
        };

        // Create an enemy that deals 1 damage each clash (will hit multiple times)
        let limited = create_limited_spawner();
        let enemy = create_dummy_card(2, "Enemy", 1, 20); // Low damage, high HP to survive

        let p_board = vec![BoardUnit::from_card(limited)];
        let e_board = vec![BoardUnit::from_card(enemy)];

        let events = run_battle(&p_board, &e_board, 42);

        // Count how many times "Limited Rage" triggered
        let trigger_count = events
            .iter()
            .filter(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Limited Rage"
                } else {
                    false
                }
            })
            .count();

        assert_eq!(
            trigger_count, 2,
            "Limited Rage should only trigger 2 times despite taking damage multiple times"
        );
    }

    #[test]
    fn test_max_triggers_unlimited() {
        // SCENARIO: A unit has an OnDamageTaken ability with max_triggers: None (unlimited).
        // It should trigger every time it takes damage.

        let create_unlimited_rager = || {
            let mut card = create_dummy_card(1, "UnlimitedRager", 1, 10);
            card.abilities = vec![Ability {
                trigger: AbilityTrigger::OnDamageTaken,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::SelfUnit,
                },
                name: "Unlimited Rage".to_string(),
                description: "Gain +1 attack when hurt (unlimited)".to_string(),
                condition: AbilityCondition::default(),
                max_triggers: None, // Unlimited
            }];
            card
        };

        let unlimited = create_unlimited_rager();
        let enemy = create_dummy_card(2, "Enemy", 1, 20);

        let p_board = vec![BoardUnit::from_card(unlimited)];
        let e_board = vec![BoardUnit::from_card(enemy)];

        let events = run_battle(&p_board, &e_board, 42);

        // Count how many times "Unlimited Rage" triggered
        let trigger_count = events
            .iter()
            .filter(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Unlimited Rage"
                } else {
                    false
                }
            })
            .count();

        // With 10 HP and enemy dealing 1 damage per clash, player should survive 9 clashes
        // (dies on the 10th), so it should trigger at least several times
        assert!(
            trigger_count > 2,
            "Unlimited Rage should trigger more than 2 times, got {}",
            trigger_count
        );
    }

    #[test]
    fn test_max_triggers_not_exceeded_on_death() {
        // SCENARIO: A unit has OnDamageTaken with max_triggers: Some(2).
        // It takes damage twice (reaching max), then takes fatal damage.
        // The fatal damage should NOT trigger the ability a 3rd time.

        // Create a unit with low HP that will die after a few hits
        let create_limited_unit = || {
            let mut card = create_dummy_card(1, "LimitedUnit", 1, 4);
            card.abilities = vec![Ability {
                trigger: AbilityTrigger::OnDamageTaken,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::SelfUnit,
                },
                name: "Limited Buff".to_string(),
                description: "Gain +1 attack when hurt (max 2 times)".to_string(),
                condition: AbilityCondition::default(),
                max_triggers: Some(2),
            }];
            card
        };

        // Enemy deals 2 damage per hit: 4 HP -> 2 HP (trigger 1) -> 0 HP (trigger 2? NO - max reached)
        // Actually with 2 damage per hit: 4 -> 2 (hit 1, trigger) -> 0 (hit 2, should NOT trigger again after max)
        // Let's use 1 damage hits to be more precise:
        // 4 -> 3 (trigger 1) -> 2 (trigger 2, max reached) -> 1 -> 0 (death, should NOT trigger)

        let limited = create_limited_unit();
        let enemy = create_dummy_card(2, "Enemy", 1, 20); // 1 damage per clash, high HP

        let p_board = vec![BoardUnit::from_card(limited)];
        let e_board = vec![BoardUnit::from_card(enemy)];

        let events = run_battle(&p_board, &e_board, 42);

        // Count triggers
        let trigger_count = events
            .iter()
            .filter(|e| {
                if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                    ability_name == "Limited Buff"
                } else {
                    false
                }
            })
            .count();

        // Should trigger exactly 2 times, not 3 or 4 (death should not add extra trigger)
        assert_eq!(
            trigger_count, 2,
            "Limited Buff should trigger exactly 2 times even when dying, got {}",
            trigger_count
        );
    }

    // ==========================================
    // MATH SAFETY TESTS
    // ==========================================

    #[test]
    fn test_negative_attack_prevention() {
        // SCENARIO: A unit receives a massive attack debuff.
        // It should NOT heal the enemy when clashing.
        
        let debuff_ability = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: -50, // Massive debuff
                target: AbilityTarget::SelfUnit,
            },
            "Weakness",
        );

        let weak_unit = create_dummy_card(1, "Weakling", 5, 10).with_ability(debuff_ability);
        let enemy = create_dummy_card(2, "Enemy", 0, 10); // 0 Atk so it doesn't kill weakling

        let p_board = vec![BoardUnit::from_card(weak_unit)];
        let e_board = vec![BoardUnit::from_card(enemy)];

        let events = run_battle(&p_board, &e_board, 42);

        // Verify enemy health did NOT increase
        let enemy_health_updates: Vec<i32> = events.iter().filter_map(|e| {
            if let CombatEvent::DamageTaken { target_instance_id, remaining_hp, .. } = e {
                if *target_instance_id == UnitId::enemy(1) {
                    return Some(*remaining_hp);
                }
            }
            None
        }).collect();

        for hp in enemy_health_updates {
            assert!(hp <= 10, "Enemy health should never increase from a clash (got {})", hp);
        }
    }

    #[test]
    fn test_saturating_health_underflow() {
        // SCENARIO: Unit takes more damage than it has health.
        // Health should saturate at 0, never becoming a large positive number due to wrap-around.
        
        let mut unit = create_board_unit(1, "Test", 5, 10);
        unit.take_damage(999); // Massive overkill
        assert_eq!(unit.effective_health(), 0, "Health should saturate at 0");
        assert!(!unit.is_alive());
    }

    #[test]
    fn test_unit_initialization_math_safety() {
        // SCENARIO: A unit is initialized with negative health (e.g. from an effect or corrupt data).
        // It should be treated as 0 HP (dead).
        
        let card = create_dummy_card(1, "Zombie", 1, -10);
        let unit = BoardUnit::from_card(card);
        
        assert_eq!(unit.effective_health(), 0);
        assert!(!unit.is_alive());
    }

    #[test]
    fn test_saturating_stat_buffs() {
        // SCENARIO: Massive buffs that would overflow i32.
        
        let buff_ability = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: i32::MAX,
                attack: i32::MAX,
                target: AbilityTarget::SelfUnit,
            },
            "SuperBuff",
        );

        let unit_card = create_dummy_card(1, "Hero", 10, 10).with_ability(buff_ability);
        let p_board = vec![BoardUnit::from_card(unit_card)];
        let e_board = vec![create_dummy_enemy()];

        let events = run_battle(&p_board, &e_board, 42);

        // Find the stat update event
        let update = events.iter().find_map(|e| {
            if let CombatEvent::AbilityModifyStats { target_instance_id, new_attack, new_health, .. } = e {
                if *target_instance_id == UnitId::player(1) {
                    return Some((*new_attack, *new_health));
                }
            }
            None
        }).expect("ModifyStats event missing");

        assert!(update.0 > 0, "Attack should be a large positive number, not wrapped around");
        assert!(update.1 > 0, "Health should be a large positive number, not wrapped around");
        assert_eq!(update.0, i32::MAX, "Saturating add should cap at i32::MAX");
    }

    #[test]
    fn test_destroy_exact_health() {
        // SCENARIO: Destroy effect should deal exactly the unit's current health.
        
        let reaper_ability = create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::Destroy {
                target: AbilityTarget::FrontEnemy,
            },
            "GrimReaper",
        );

        let reaper = create_dummy_card(1, "Reaper", 1, 1).with_ability(reaper_ability);
        let victim = create_dummy_card(2, "Victim", 1, 42); // 42 Health

        let p_board = vec![BoardUnit::from_card(reaper)];
        let e_board = vec![BoardUnit::from_card(victim)];

        let events = run_battle(&p_board, &e_board, 42);

        // Find the AbilityDamage event
        let damage = events.iter().find_map(|e| {
            if let CombatEvent::AbilityDamage { target_instance_id, damage, .. } = e {
                if *target_instance_id == UnitId::enemy(1) {
                    return Some(*damage);
                }
            }
            None
        }).expect("AbilityDamage event missing");

        assert_eq!(damage, 42, "Destroy should deal exactly the current health of the target");
    }
}
