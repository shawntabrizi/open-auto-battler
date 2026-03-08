use super::*;
use crate::battle::{CombatEvent, UnitId};
use crate::types::*;

#[test]
fn test_max_triggers_unlimited() {
    let create_unlimited_rager = || {
        let mut card = create_dummy_card(1, "UnlimitedRager", 1, 10);
        card.battle_abilities = vec![Ability {
            trigger: AbilityTrigger::OnHurt,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            conditions: vec![],
            max_triggers: None,
        }];
        card
    };

    let unlimited = create_unlimited_rager();
    let enemy = create_dummy_card(2, "Enemy", 1, 20);

    let p_board = vec![CombatUnit::from_card(unlimited)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let trigger_count = events
        .iter()
        .filter(|e| {
            matches!(
                e,
                CombatEvent::AbilityTrigger {
                    source_instance_id,
                    ability_index,
                } if *source_instance_id == UnitId::player(1) && *ability_index == 0
            )
        })
        .count();

    assert!(
        trigger_count > 2,
        "Unlimited Rage should trigger more than 2 times, got {}",
        trigger_count
    );
}

#[test]
fn test_max_triggers_not_exceeded_on_death() {
    let create_limited_unit = || {
        let mut card = create_dummy_card(1, "LimitedUnit", 1, 4);
        card.battle_abilities = vec![Ability {
            trigger: AbilityTrigger::OnHurt,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            conditions: vec![],
            max_triggers: Some(2),
        }];
        card
    };

    let limited = create_limited_unit();
    let enemy = create_dummy_card(2, "Enemy", 1, 20);

    let p_board = vec![CombatUnit::from_card(limited)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let trigger_count = events
        .iter()
        .filter(|e| {
            matches!(
                e,
                CombatEvent::AbilityTrigger {
                    source_instance_id,
                    ability_index,
                } if *source_instance_id == UnitId::player(1) && *ability_index == 0
            )
        })
        .count();

    assert_eq!(
        trigger_count, 2,
        "Limited Buff should trigger exactly 2 times even when dying, got {}",
        trigger_count
    );
}

#[test]
fn test_max_triggers_limit() {
    let create_limited_spawner = || {
        let mut card = create_dummy_card(1, "LimitedSpawner", 1, 10);
        card.battle_abilities = vec![Ability {
            trigger: AbilityTrigger::OnHurt,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            conditions: vec![],
            max_triggers: Some(2),
        }];
        card
    };

    let limited = create_limited_spawner();
    let enemy = create_dummy_card(2, "Enemy", 1, 20);

    let p_board = vec![CombatUnit::from_card(limited)];
    let e_board = vec![CombatUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    let trigger_count = events
        .iter()
        .filter(|e| {
            matches!(
                e,
                CombatEvent::AbilityTrigger {
                    source_instance_id,
                    ability_index,
                } if *source_instance_id == UnitId::player(1) && *ability_index == 0
            )
        })
        .count();

    assert_eq!(
        trigger_count, 2,
        "Limited Rage should only trigger 2 times despite taking damage multiple times"
    );
}
