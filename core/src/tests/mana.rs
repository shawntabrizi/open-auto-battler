use super::*;
use crate::battle::{BattleResult, CombatEvent, UnitId};
use crate::state::GameState;
use crate::types::*;

// ==========================================
// 1. SANITY CHECKS (Mana & Basic State)
// ==========================================

#[test]
fn test_mana_limit_calculation() {
    let state = GameState::new(42);
    assert_eq!(
        state.calculate_mana_limit(),
        3,
        "Round 1 mana limit should be 3"
    );

    let mut state2 = GameState::new(42);
    state2.round = 5;
    assert_eq!(
        state2.calculate_mana_limit(),
        7,
        "Round 5 mana limit should be 7"
    );

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
                id,
                template.template_id,
                template.name,
                template.attack,
                template.health,
                template.play_cost,
                template.pitch_value,
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
    assert_ne!(
        hand1, hand3,
        "Different round should produce different hand"
    );

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
        assert!(
            idx < state.bag.len(),
            "Hand index should be within bag bounds"
        );
    }
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
            target: AbilityTarget::Position {
                scope: TargetScope::Allies,
                index: 0,
            },
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
fn test_berserker_combo() {
    // Setup: [Pain Smith, Raging Orc]
    // Pain Smith: OnStart -> 1. Damage(1, AllAllies), 2. Buff(+2, AllAllies)
    // Raging Orc: 2/8. OnHurt -> Buff(+2, Self).

    // Construct Pain Smith (Manual)
    let smith_buff = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::Allies,
            },
        },
        "Sharpen",
    );
    let smith_dmg = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::All {
                scope: TargetScope::Allies,
            },
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
        AbilityTrigger::OnHurt,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
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
    // Player: "Martyr" (1/1). Ability: OnHurt -> Deal 5 damage to FrontEnemy.
    // Enemy: "Killer" (10/10).
    // Result: Killer hits Martyr (10 dmg). Martyr dies (-9 HP). Martyr trigger fires (5 dmg to Killer).
    // Final Killer HP: 5.

    let revenge_shot = create_ability(
        AbilityTrigger::OnHurt,
        AbilityEffect::Damage {
            amount: 5,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 0,
            },
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
fn test_shield_squire_support() {
    // P: [Fodder (1/10), Squire (2/3)]. Squire: BeforeAttack -> +2 HP to AllyAhead.
    // E: [Sandbag (0/50)].
    // Result: Fodder should gain 2 HP before the clash.

    let squire_ability = create_ability(
        AbilityTrigger::BeforeAnyAttack,
        AbilityEffect::ModifyStats {
            health: 2,
            attack: 0,
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: -1,
            },
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
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
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
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                "SupportUnitTrigger",
            ),
            create_ability(
                AbilityTrigger::BeforeAnyAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
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
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
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
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                "SupportAfterUnit",
            ),
            create_ability(
                AbilityTrigger::AfterAnyAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
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

    let high_atk_front = BoardUnit::from_card(
        UnitCard::new(1, "High", "High", 10, 10, 0, 0, false).with_ability(create_ability(
            AbilityTrigger::BeforeUnitAttack,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
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
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
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
    let grunt = create_dummy_card(1, "Grunt", 2, 2);
    let squire = create_dummy_card(2, "Squire", 2, 3).with_ability(create_ability(
        AbilityTrigger::BeforeAnyAttack,
        AbilityEffect::ModifyStats {
            health: 2,
            attack: 0,
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: -1,
            },
        },
        "SquireShield",
    ));

    let p_board = vec![
        BoardUnit::from_card(grunt.clone()),
        BoardUnit::from_card(squire.clone()),
    ];
    let e_board = vec![BoardUnit::from_card(grunt), BoardUnit::from_card(squire)];

    let events = run_battle(&p_board, &e_board, 42);

    let last_event = events.last().unwrap();
    if let CombatEvent::BattleEnd { result } = last_event {
        assert_eq!(
            *result,
            BattleResult::Draw,
            "Stalemate should result in a DRAW"
        );
    } else {
        panic!("Battle did not end correctly: {:?}", last_event);
    }

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
            condition: AbilityCondition::StatValueCompare {
                scope: TargetScope::Allies,
                stat: StatType::Health,
                op: CompareOp::LessThanOrEqual,
                value: 6,
            },
            max_triggers: None,
        })
    };

    {
        let tank = create_dummy_card(1, "Tank", 5, 5);
        let nurse = create_nurse();
        let enemy = create_dummy_card(3, "Enemy", 1, 10);

        let p_board = vec![BoardUnit::from_card(tank), BoardUnit::from_card(nurse)];
        let e_board = vec![BoardUnit::from_card(enemy)];

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

        let p_board = vec![BoardUnit::from_card(tank), BoardUnit::from_card(nurse)];
        let e_board = vec![BoardUnit::from_card(enemy)];

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
            condition: AbilityCondition::UnitCount {
                scope: TargetScope::Allies,
                op: CompareOp::GreaterThanOrEqual,
                value: 3,
            },
            max_triggers: None,
        })
    };

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
            condition: AbilityCondition::UnitCount {
                scope: TargetScope::Allies,
                op: CompareOp::LessThanOrEqual,
                value: 1,
            },
            max_triggers: None,
        })
    };

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
            condition: AbilityCondition::And {
                left: Box::new(AbilityCondition::StatValueCompare {
                    scope: TargetScope::SelfUnit,
                    stat: StatType::Health,
                    op: CompareOp::LessThanOrEqual,
                    value: 5,
                }),
                right: Box::new(AbilityCondition::UnitCount {
                    scope: TargetScope::Allies,
                    op: CompareOp::GreaterThanOrEqual,
                    value: 2,
                }),
            },
            max_triggers: None,
        })
    };

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
fn test_ally_behind_on_faint_buffs_correctly() {
    let martyr = create_dummy_card(1, "Martyr", 2, 3).with_ability(Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::ModifyStats {
            health: 2,
            attack: 2,
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: 1,
            },
        },
        name: "Last Stand".to_string(),
        description: "Give the ally behind +2/+2 on death".to_string(),
        condition: AbilityCondition::None,
        max_triggers: Some(1),
    });

    let ally_behind = create_dummy_card(2, "Ally", 5, 5);

    let p_board = vec![
        BoardUnit::from_card(martyr),
        BoardUnit::from_card(ally_behind),
    ];
    let e_board = vec![create_board_unit(3, "Enemy", 10, 10)];

    let events = run_battle(&p_board, &e_board, 42);

    let trigger_event = events.iter().find(|e| {
            matches!(e, CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Last Stand")
        });
    assert!(
        trigger_event.is_some(),
        "Last Stand should trigger on Martyr's death"
    );

    let buff_event = events.iter().find(|e| {
        if let CombatEvent::AbilityModifyStats {
            target_instance_id,
            attack_change,
            health_change,
            ..
        } = e
        {
            *target_instance_id == UnitId::player(2) && *attack_change == 2 && *health_change == 2
        } else {
            false
        }
    });
    assert!(
        buff_event.is_some(),
        "Ally behind should receive +2/+2 from Last Stand"
    );
}

#[test]
fn test_ally_behind_on_faint_with_lich_sacrifice() {
    let mk_ability = Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::ModifyStats {
            health: 2,
            attack: 2,
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: 1,
            },
        },
        name: "Last Stand".to_string(),
        description: "Give the ally behind +2/+2 on death".to_string(),
        condition: AbilityCondition::None,
        max_triggers: Some(1),
    };

    let mk1 = create_dummy_card(1, "MK1", 2, 3).with_ability(mk_ability.clone());
    let mk2 = create_dummy_card(2, "MK2", 2, 3).with_ability(mk_ability.clone());
    let mk3 = create_dummy_card(3, "MK3", 2, 3).with_ability(mk_ability.clone());
    let lich = create_dummy_card(4, "Lich", 3, 3).with_abilities(vec![
        Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Destroy {
                target: AbilityTarget::Position {
                    scope: TargetScope::SelfUnit,
                    index: -1,
                },
            },
            name: "Ritual".to_string(),
            description: "Sacrifice the ally in front".to_string(),
            condition: AbilityCondition::None,
            max_triggers: None,
        },
        Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::SpawnUnit {
                template_id: "golem".to_string(),
            },
            name: "Raise Golem".to_string(),
            description: "Spawn a 5/5 Golem".to_string(),
            condition: AbilityCondition::None,
            max_triggers: None,
        },
    ]);
    let mk5 = create_dummy_card(5, "MK5", 2, 3).with_ability(mk_ability.clone());

    let e_mk1 = create_dummy_card(6, "EMK1", 2, 3).with_ability(mk_ability.clone());
    let e_mk2 = create_dummy_card(7, "EMK2", 2, 3).with_ability(mk_ability.clone());
    let e_lich = create_dummy_card(8, "ELich", 3, 3).with_abilities(vec![
        Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Destroy {
                target: AbilityTarget::Position {
                    scope: TargetScope::SelfUnit,
                    index: -1,
                },
            },
            name: "Ritual".to_string(),
            description: "Sacrifice the ally in front".to_string(),
            condition: AbilityCondition::None,
            max_triggers: None,
        },
        Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::SpawnUnit {
                template_id: "golem".to_string(),
            },
            name: "Raise Golem".to_string(),
            description: "Spawn a 5/5 Golem".to_string(),
            condition: AbilityCondition::None,
            max_triggers: None,
        },
    ]);

    let p_board = vec![
        BoardUnit::from_card(mk1),
        BoardUnit::from_card(mk2),
        BoardUnit::from_card(mk3),
        BoardUnit::from_card(lich),
        BoardUnit::from_card(mk5),
    ];
    let e_board = vec![
        BoardUnit::from_card(e_mk1),
        BoardUnit::from_card(e_mk2),
        BoardUnit::from_card(e_lich),
    ];

    let events = run_battle(&p_board, &e_board, 42);

    let mk3_trigger = events.iter().find(|e| {
        if let CombatEvent::AbilityTrigger {
            source_instance_id,
            ability_name,
        } = e
        {
            *source_instance_id == UnitId::player(3) && ability_name == "Last Stand"
        } else {
            false
        }
    });
    assert!(
        mk3_trigger.is_some(),
        "MK3's Last Stand should trigger when sacrificed by Lich"
    );

    let lich_buff = events.iter().find(|e| {
        if let CombatEvent::AbilityModifyStats {
            source_instance_id,
            target_instance_id,
            attack_change,
            health_change,
            ..
        } = e
        {
            *source_instance_id == UnitId::player(3)
                && *target_instance_id == UnitId::player(4)
                && *attack_change == 2
                && *health_change == 2
        } else {
            false
        }
    });
    assert!(
        lich_buff.is_some(),
        "MK3's Last Stand should buff the Lich (+2/+2), which was directly behind it"
    );
}

#[test]
fn test_destroy_exact_health() {
    let reaper_ability = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Destroy {
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: 0,
            },
        },
        "GrimReaper",
    );

    let reaper = create_dummy_card(1, "Reaper", 1, 1).with_ability(reaper_ability);
    let victim = create_dummy_card(2, "Victim", 1, 42);

    let p_board = vec![BoardUnit::from_card(reaper)];
    let e_board = vec![BoardUnit::from_card(victim)];

    let events = run_battle(&p_board, &e_board, 42);

    let damage = events
        .iter()
        .find_map(|e| {
            if let CombatEvent::AbilityDamage {
                target_instance_id,
                damage,
                ..
            } = e
            {
                if *target_instance_id == UnitId::enemy(1) {
                    return Some(*damage);
                }
            }
            None
        })
        .expect("AbilityDamage event missing");

    assert_eq!(
        damage, 42,
        "Destroy should deal exactly the current health of the target"
    );
}