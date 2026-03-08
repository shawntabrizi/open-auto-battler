use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_shield_squire_support() {
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
    let squire = create_dummy_card(2, "Squire", 2, 3).with_battle_ability(squire_ability);

    let p_board = vec![CombatUnit::from_card(fodder), CombatUnit::from_card(squire)];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 42);

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
fn test_nurse_goblin_heals_only_when_ally_hp_is_six_or_less() {
    let nurse_goblin = || {
        create_dummy_card(2, "Nurse Goblin", 1, 3).with_battle_ability(Ability {
            trigger: AbilityTrigger::BeforeAnyAttack,
            effect: AbilityEffect::ModifyStats {
                health: 2,
                attack: 0,
                target: AbilityTarget::Position {
                    scope: TargetScope::Allies,
                    index: 0,
                },
            },
            conditions: vec![Condition::Is(Matcher::TargetStatValueCompare {
                target: AbilityTarget::Position {
                    scope: TargetScope::Allies,
                    index: 0,
                },
                stat: StatType::Health,
                op: CompareOp::LessThanOrEqual,
                value: 6,
            })],
            max_triggers: None,
        })
    };

    // Front ally above threshold, but another ally below threshold:
    // ability should NOT trigger because condition checks heal target specifically.
    {
        let healthy_front = create_dummy_card(1, "Healthy Front", 5, 7);
        let wounded_back = create_dummy_card(3, "Wounded Back", 1, 2);
        let enemy = create_dummy_card(4, "Enemy", 1, 1);

        let p_board = vec![
            CombatUnit::from_card(healthy_front),
            CombatUnit::from_card(nurse_goblin()),
            CombatUnit::from_card(wounded_back),
        ];
        let e_board = vec![CombatUnit::from_card(enemy)];
        let events = run_battle(&p_board, &e_board, 2001);

        let heal_triggered = has_ability_trigger(&events, UnitId::player(2), 0);
        assert!(
            !heal_triggered,
            "Nurse Goblin should not trigger when the heal target (front ally) has HP > 6"
        );

        let heal_applied = events.iter().any(|e| {
            matches!(
                e,
                CombatEvent::AbilityModifyStats {
                    source_instance_id,
                    ..
                } if *source_instance_id == UnitId::player(2)
            )
        });
        assert!(
            !heal_applied,
            "No heal stats should be applied when the heal target has HP > 6"
        );
    }

    // Front ally at threshold, another ally above threshold:
    // ability should trigger and heal the front ally.
    {
        let wounded_front = create_dummy_card(1, "Wounded Front", 5, 6);
        let healthy_back = create_dummy_card(3, "Healthy Back", 1, 10);
        let enemy = create_dummy_card(4, "Enemy", 1, 1);

        let p_board = vec![
            CombatUnit::from_card(wounded_front),
            CombatUnit::from_card(nurse_goblin()),
            CombatUnit::from_card(healthy_back),
        ];
        let e_board = vec![CombatUnit::from_card(enemy)];
        let events = run_battle(&p_board, &e_board, 2002);

        let heal_triggered = has_ability_trigger(&events, UnitId::player(2), 0);
        assert!(
            heal_triggered,
            "Nurse Goblin should trigger heal when ally HP <= 6"
        );

        let heal_applied = events.iter().any(|e| {
            matches!(
                e,
                CombatEvent::AbilityModifyStats {
                    source_instance_id,
                    target_instance_id,
                    health_change,
                    ..
                } if *source_instance_id == UnitId::player(2)
                    && *target_instance_id == UnitId::player(1)
                    && *health_change == 2
            )
        });
        assert!(
            heal_applied,
            "Nurse Goblin should apply +2 health to the front ally"
        );
    }
}
