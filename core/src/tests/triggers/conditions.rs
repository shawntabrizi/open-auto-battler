use crate::battle::CombatEvent;
use crate::tests::*;
use crate::types::*;

#[test]
fn test_condition_target_health_threshold() {
    let create_nurse = || {
        create_dummy_card(2, "Nurse", 1, 3).with_ability(Ability {
            trigger: AbilityTrigger::BeforeAnyAttack,
            effect: AbilityEffect::ModifyStats {
                health: 2,
                attack: 0,
                target: AbilityTarget::Position {
                    scope: TargetScope::SelfUnit,
                    index: -1,
                },
            },
            name: "Emergency Heal".to_string(),
            description: "Heal ally ahead if HP <= 6".to_string(),
            conditions: vec![Condition::Is(Matcher::StatValueCompare {
                scope: TargetScope::Allies,
                stat: StatType::Health,
                op: CompareOp::LessThanOrEqual,
                value: 6,
            })],
            max_triggers: None,
        })
    };

    {
        let tank = create_dummy_card(1, "Tank", 5, 5);
        let nurse = create_nurse();
        let enemy = create_dummy_card(3, "Enemy", 1, 10);

        let p_board = vec![CombatUnit::from_card(tank), CombatUnit::from_card(nurse)];
        let e_board = vec![CombatUnit::from_card(enemy)];

        let events = run_battle(&p_board, &e_board, 123);

        let heal_triggered = events.iter().any(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                ability_name == "Emergency Heal"
            } else {
                false
            }
        });

        assert!(heal_triggered, "Nurse should heal ally with HP <= 6");
    }

    {
        let tank = create_dummy_card(1, "Tank", 5, 10);
        let nurse = create_nurse();
        let enemy = create_dummy_card(3, "Enemy", 1, 5);

        let p_board = vec![CombatUnit::from_card(tank), CombatUnit::from_card(nurse)];
        let e_board = vec![CombatUnit::from_card(enemy)];

        let events = run_battle(&p_board, &e_board, 456);

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
    let create_pack_leader = || {
        create_dummy_card(1, "PackLeader", 2, 3).with_ability(Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::ModifyStats {
                health: 1,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::Allies,
                },
            },
            name: "Pack Tactics".to_string(),
            description: "Buff all allies if 3+ allies".to_string(),
            conditions: vec![Condition::Is(Matcher::UnitCount {
                scope: TargetScope::Allies,
                op: CompareOp::GreaterThanOrEqual,
                value: 3,
            })],
            max_triggers: None,
        })
    };

    {
        let leader = create_pack_leader();
        let ally1 = create_dummy_card(2, "Ally1", 1, 1);
        let ally2 = create_dummy_card(3, "Ally2", 1, 1);
        let enemy = create_dummy_card(4, "Enemy", 1, 1);

        let p_board = vec![
            CombatUnit::from_card(leader),
            CombatUnit::from_card(ally1),
            CombatUnit::from_card(ally2),
        ];
        let e_board = vec![CombatUnit::from_card(enemy)];

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

    {
        let leader = create_pack_leader();
        let ally1 = create_dummy_card(2, "Ally1", 1, 1);
        let enemy = create_dummy_card(4, "Enemy", 1, 5);

        let p_board = vec![CombatUnit::from_card(leader), CombatUnit::from_card(ally1)];
        let e_board = vec![CombatUnit::from_card(enemy)];

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
    let create_lone_wolf = || {
        create_dummy_card(1, "LoneWolf", 2, 4).with_ability(Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 5,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            name: "Last Stand".to_string(),
            description: "Gain +5 attack if alone".to_string(),
            conditions: vec![Condition::Is(Matcher::UnitCount {
                scope: TargetScope::Allies,
                op: CompareOp::LessThanOrEqual,
                value: 1,
            })],
            max_triggers: None,
        })
    };

    {
        let wolf = create_lone_wolf();
        let enemy = create_dummy_card(2, "Enemy", 3, 5);

        let p_board = vec![CombatUnit::from_card(wolf)];
        let e_board = vec![CombatUnit::from_card(enemy)];

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

    {
        let wolf = create_lone_wolf();
        let ally = create_dummy_card(2, "Ally", 1, 1);
        let enemy = create_dummy_card(3, "Enemy", 3, 5);

        let p_board = vec![CombatUnit::from_card(wolf), CombatUnit::from_card(ally)];
        let e_board = vec![CombatUnit::from_card(enemy)];

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
    let create_conditional_unit = || {
        create_dummy_card(1, "Conditional", 2, 3).with_ability(Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 3,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            name: "Complex Condition".to_string(),
            description: "Buff if HP <= 5 AND 2+ allies".to_string(),
            conditions: vec![
                Condition::Is(Matcher::StatValueCompare {
                    scope: TargetScope::SelfUnit,
                    stat: StatType::Health,
                    op: CompareOp::LessThanOrEqual,
                    value: 5,
                }),
                Condition::Is(Matcher::UnitCount {
                    scope: TargetScope::Allies,
                    op: CompareOp::GreaterThanOrEqual,
                    value: 2,
                }),
            ],
            max_triggers: None,
        })
    };

    {
        let unit = create_conditional_unit();
        let ally = create_dummy_card(2, "Ally", 1, 1);
        let enemy = create_dummy_card(3, "Enemy", 1, 5);

        let p_board = vec![CombatUnit::from_card(unit), CombatUnit::from_card(ally)];
        let e_board = vec![CombatUnit::from_card(enemy)];

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

    {
        let unit = create_conditional_unit();
        let enemy = create_dummy_card(3, "Enemy", 1, 5);

        let p_board = vec![CombatUnit::from_card(unit)];
        let e_board = vec![CombatUnit::from_card(enemy)];

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
