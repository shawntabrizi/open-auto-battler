use super::*;
use crate::battle::{CombatUnit, UnitId};
use crate::types::*;

fn trigger_ref(source_id: UnitId, ability_index: u8) -> AbilityTriggerRef {
    AbilityTriggerRef {
        source_id,
        ability_index,
    }
}

fn position_of(triggers: &[AbilityTriggerRef], target: AbilityTriggerRef) -> usize {
    triggers
        .iter()
        .position(|entry| *entry == target)
        .expect("trigger missing")
}

#[test]
fn test_ability_priority_by_attack() {
    let slow_unit = create_tester_unit(1, "SlowPoke", 1, 10);
    let fast_unit = create_tester_unit(2, "Speedster", 10, 10);

    let player_board = vec![slow_unit, fast_unit];
    let enemy_board = vec![create_dummy_enemy()];

    let events = run_battle(&player_board, &enemy_board, 12345);
    let triggers = collect_ability_triggers(&events);

    assert!(triggers.len() >= 2, "Both abilities should have triggered");
    assert!(
        position_of(&triggers, trigger_ref(UnitId::player(2), 0))
            < position_of(&triggers, trigger_ref(UnitId::player(1), 0)),
        "High attack unit should trigger before low attack unit: {:?}",
        triggers
    );
}

#[test]
fn test_priority_tiebreaker_health() {
    let healthy_unit = create_tester_unit(1, "Healthy", 5, 10);
    let fragile_unit = create_tester_unit(2, "Fragile", 5, 1);

    let player_board = vec![fragile_unit, healthy_unit];
    let enemy_board = vec![create_dummy_enemy()];

    let events = run_battle(&player_board, &enemy_board, 42);
    let triggers = collect_ability_triggers(&events);

    assert!(
        position_of(&triggers, trigger_ref(UnitId::player(2), 0))
            < position_of(&triggers, trigger_ref(UnitId::player(1), 0)),
        "High HP unit should trigger before low HP unit when attack is tied"
    );
}

#[test]
fn test_priority_tiebreaker_team() {
    let enemy_ability = Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::ModifyStats {
            health: 1,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        conditions: vec![],
        max_triggers: None,
    };
    let e_card = UnitCard::new(CardId(2), "Enemy", 5, 5, 0, 0).with_battle_ability(enemy_ability);
    let e_unit = CombatUnit::from_card(e_card);

    let mut player_first_count = 0;
    let mut enemy_first_count = 0;

    for seed in [42u64, 1, 123, 456, 789, 1000, 2000, 3000, 4000, 5000] {
        let p_unit = create_tester_unit(1, "Player", 5, 5);
        let p_board = vec![p_unit];
        let e_board = vec![e_unit.clone()];

        let events = run_battle(&p_board, &e_board, seed);
        let triggers = collect_ability_triggers(&events);

        let p_idx = position_of(&triggers, trigger_ref(UnitId::player(1), 0));
        let e_idx = position_of(&triggers, trigger_ref(UnitId::enemy(1), 0));

        if p_idx < e_idx {
            player_first_count += 1;
        } else {
            enemy_first_count += 1;
        }
    }

    assert!(
        player_first_count > 0 && enemy_first_count > 0,
        "Random tiebreaker should produce varied outcomes: player_first={}, enemy_first={}",
        player_first_count,
        enemy_first_count
    );
}

#[test]
fn test_priority_tiebreaker_index() {
    let front_unit = create_tester_unit(1, "Front", 5, 5);
    let back_unit = create_tester_unit(2, "Back", 5, 5);

    let player_board = vec![front_unit, back_unit];
    let enemy_board = vec![create_dummy_enemy()];

    let events = run_battle(&player_board, &enemy_board, 42);
    let triggers = collect_ability_triggers(&events);

    assert!(
        position_of(&triggers, trigger_ref(UnitId::player(1), 0))
            < position_of(&triggers, trigger_ref(UnitId::player(2), 0)),
        "Front unit should trigger before back unit when attack and health are tied"
    );
}

#[test]
fn test_priority_tiebreaker_ability_order() {
    let ability_a = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );

    let ability_b = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );

    let unit = CombatUnit::from_card(
        UnitCard::new(CardId(1), "Unit", 5, 5, 0, 0)
            .with_battle_abilities(vec![ability_a, ability_b]),
    );

    let events = run_battle(&[unit], &[create_dummy_enemy()], 42);
    let triggers = collect_ability_triggers(&events);

    assert!(
        position_of(&triggers, trigger_ref(UnitId::player(1), 0))
            < position_of(&triggers, trigger_ref(UnitId::player(1), 1)),
        "Earlier ability definitions should trigger first"
    );
}

#[test]
fn test_priority_full_hierarchy_with_ability_order() {
    let u1 = CombatUnit::from_card(
        UnitCard::new(CardId(1), "U1", 10, 1, 0, 0).with_battle_ability(create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 0,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
        )),
    );
    let u2 = create_tester_unit(2, "U2", 5, 10);
    let u3 = create_tester_unit(3, "U3", 5, 5);
    let u4 = CombatUnit::from_card(
        UnitCard::new(CardId(4), "U4", 5, 5, 0, 0).with_battle_ability(create_ability(
            AbilityTrigger::OnStart,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 0,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
        )),
    );
    let ability_u5_a = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );
    let ability_u5_b = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );
    let u5 = CombatUnit::from_card(
        UnitCard::new(CardId(5), "U5", 1, 1, 0, 0)
            .with_battle_abilities(vec![ability_u5_a, ability_u5_b]),
    );
    let u6 = create_tester_unit(6, "U6", 1, 1);

    let p_board = vec![u5, u2, u3, u6];
    let e_board = vec![u1, u4];

    let events = run_battle(&p_board, &e_board, 42);
    let triggers = collect_ability_triggers(&events);

    assert_eq!(
        triggers,
        vec![
            trigger_ref(UnitId::enemy(1), 0),
            trigger_ref(UnitId::player(2), 0),
            trigger_ref(UnitId::enemy(2), 0),
            trigger_ref(UnitId::player(3), 0),
            trigger_ref(UnitId::player(1), 0),
            trigger_ref(UnitId::player(1), 1),
            trigger_ref(UnitId::player(4), 0),
        ]
    );
}

#[test]
fn test_priority_full_hierarchy() {
    let ability_u1 = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );
    let u1 = CombatUnit::from_card(
        UnitCard::new(CardId(1), "U1", 10, 1, 0, 0).with_battle_ability(ability_u1),
    );
    let u2 = create_tester_unit(2, "U2", 5, 10);
    let ability_u4 = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );
    let u4 = CombatUnit::from_card(
        UnitCard::new(CardId(4), "U4", 5, 5, 0, 0).with_battle_ability(ability_u4),
    );
    let u3 = create_tester_unit(3, "U3", 5, 5);
    let u5 = create_tester_unit(5, "U5", 1, 1);
    let u6 = create_tester_unit(6, "U6", 1, 1);

    let p_board = vec![u2, u3, u5, u6];
    let e_board = vec![u1, u4];

    let events = run_battle(&p_board, &e_board, 42);
    let triggers = collect_ability_triggers(&events);

    assert_eq!(
        triggers,
        vec![
            trigger_ref(UnitId::enemy(1), 0),
            trigger_ref(UnitId::player(1), 0),
            trigger_ref(UnitId::enemy(2), 0),
            trigger_ref(UnitId::player(2), 0),
            trigger_ref(UnitId::player(3), 0),
            trigger_ref(UnitId::player(4), 0),
        ]
    );
}

#[test]
fn test_priority_keeps_same_unit_abilities_consecutive() {
    let ability_a = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 1,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );
    let ability_b = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 1,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );
    let ability_c = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 1,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
    );

    let p_card = UnitCard::new(CardId(1), "Player", 5, 5, 0, 0)
        .with_battle_abilities(vec![ability_a, ability_b]);
    let e_card = UnitCard::new(CardId(2), "Enemy", 5, 5, 0, 0).with_battle_ability(ability_c);

    for seed in [1u64, 42, 123, 456, 789, 1000, 9999, 123456] {
        let events = run_battle(
            &[CombatUnit::from_card(p_card.clone())],
            &[CombatUnit::from_card(e_card.clone())],
            seed,
        );
        let triggers = collect_ability_triggers(&events);

        assert_eq!(triggers.len(), 3, "Should have exactly 3 triggers");

        let a_idx = position_of(&triggers, trigger_ref(UnitId::player(1), 0));
        let b_idx = position_of(&triggers, trigger_ref(UnitId::player(1), 1));
        let c_idx = position_of(&triggers, trigger_ref(UnitId::enemy(1), 0));

        assert!(
            a_idx + 1 == b_idx,
            "Seed {}: same-unit abilities must stay consecutive in definition order. Got {:?}",
            seed,
            triggers
        );

        let c_between = a_idx < c_idx && c_idx < b_idx;
        assert!(
            !c_between,
            "Seed {}: enemy trigger should not be interleaved between same-unit abilities. Got {:?}",
            seed,
            triggers
        );
    }
}
