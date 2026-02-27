use crate::battle::CombatEvent;
use crate::tests::*;
use crate::types::*;

#[test]
fn test_condition_target_health_threshold() {
    let create_nurse = || {
        create_dummy_card(2, "Nurse", 1, 3).with_battle_ability(Ability {
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
                scope: TargetScope::AlliesOther,
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
        create_dummy_card(1, "PackLeader", 2, 3).with_battle_ability(Ability {
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
        create_dummy_card(1, "LoneWolf", 2, 4).with_battle_ability(Ability {
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
        create_dummy_card(1, "Conditional", 2, 3).with_battle_ability(Ability {
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

#[test]
fn test_condition_stat_value_compare_uses_matcher_scope() {
    let create_checker = || {
        create_dummy_card(1, "Checker", 2, 1).with_battle_ability(Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            name: "Enemy Health Check".to_string(),
            description: "Trigger if any enemy has health >= 5".to_string(),
            conditions: vec![Condition::Is(Matcher::StatValueCompare {
                scope: TargetScope::Enemies,
                stat: StatType::Health,
                op: CompareOp::GreaterThanOrEqual,
                value: 5,
            })],
            max_triggers: None,
        })
    };

    {
        let checker = create_checker();
        let enemy = create_dummy_card(2, "Enemy", 1, 6);
        let events = run_battle(
            &[CombatUnit::from_card(checker)],
            &[CombatUnit::from_card(enemy)],
            2020,
        );

        let triggered = events.iter().any(|e| {
            matches!(
                e,
                CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Enemy Health Check"
            )
        });
        assert!(
            triggered,
            "Should trigger when enemy scope satisfies condition"
        );
    }

    {
        let checker = create_checker();
        let enemy = create_dummy_card(2, "Enemy", 1, 4);
        let events = run_battle(
            &[CombatUnit::from_card(checker)],
            &[CombatUnit::from_card(enemy)],
            2021,
        );

        let triggered = events.iter().any(|e| {
            matches!(
                e,
                CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Enemy Health Check"
            )
        });
        assert!(
            !triggered,
            "Should not trigger when enemy scope does not satisfy condition"
        );
    }
}

#[test]
fn test_condition_stat_stat_compare_uses_target_scope() {
    let create_checker = || {
        create_dummy_card(1, "Comparator", 2, 1).with_battle_ability(Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            name: "Enemy Stat Compare".to_string(),
            description: "Trigger if source attack is less than enemy health".to_string(),
            conditions: vec![Condition::Is(Matcher::StatStatCompare {
                source_stat: StatType::Attack,
                op: CompareOp::LessThan,
                target_scope: TargetScope::Enemies,
                target_stat: StatType::Health,
            })],
            max_triggers: None,
        })
    };

    {
        let checker = create_checker();
        let enemy = create_dummy_card(2, "Enemy", 1, 5);
        let events = run_battle(
            &[CombatUnit::from_card(checker)],
            &[CombatUnit::from_card(enemy)],
            3030,
        );

        let triggered = events.iter().any(|e| {
            matches!(
                e,
                CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Enemy Stat Compare"
            )
        });
        assert!(
            triggered,
            "Should trigger when enemy scope satisfies comparison"
        );
    }

    {
        let checker = create_checker();
        let enemy = create_dummy_card(2, "Enemy", 1, 1);
        let events = run_battle(
            &[CombatUnit::from_card(checker)],
            &[CombatUnit::from_card(enemy)],
            3031,
        );

        let triggered = events.iter().any(|e| {
            matches!(
                e,
                CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Enemy Stat Compare"
            )
        });
        assert!(
            !triggered,
            "Should not trigger when enemy scope fails comparison"
        );
    }
}

#[test]
fn test_condition_is_position_uses_matcher_scope() {
    let enemy_scoped = create_dummy_card(1, "EnemyScoped", 2, 5).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::ModifyStats {
            health: 0,
            attack: 1,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        name: "Enemy Position Check".to_string(),
        description: "Should fail because source is not in enemy scope".to_string(),
        conditions: vec![Condition::Is(Matcher::IsPosition {
            scope: TargetScope::Enemies,
            index: 0,
        })],
        max_triggers: None,
    });

    let ally_scoped = create_dummy_card(2, "AllyScoped", 2, 5).with_battle_ability(Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::ModifyStats {
            health: 0,
            attack: 1,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        name: "Ally Position Check".to_string(),
        description: "Should pass when source is front ally".to_string(),
        conditions: vec![Condition::Is(Matcher::IsPosition {
            scope: TargetScope::Allies,
            index: 0,
        })],
        max_triggers: None,
    });

    let enemy = create_dummy_card(3, "Enemy", 1, 5);

    let enemy_scope_events = run_battle(
        &[CombatUnit::from_card(enemy_scoped)],
        &[CombatUnit::from_card(enemy.clone())],
        4040,
    );
    let enemy_scope_triggered = enemy_scope_events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Enemy Position Check"
        )
    });
    assert!(
        !enemy_scope_triggered,
        "Enemy-scoped position check should not trigger for the source unit"
    );

    let ally_scope_events = run_battle(
        &[CombatUnit::from_card(ally_scoped)],
        &[CombatUnit::from_card(enemy)],
        4041,
    );
    let ally_scope_triggered = ally_scope_events.iter().any(|e| {
        matches!(
            e,
            CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Ally Position Check"
        )
    });
    assert!(
        ally_scope_triggered,
        "Ally-scoped position check should trigger for a front source unit"
    );
}
