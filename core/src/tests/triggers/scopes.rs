use crate::battle::CombatEvent;
use crate::tests::*;
use crate::types::*;

#[test]
fn test_attack_trigger_scopes() {
    let front_unit = CombatUnit::from_card(
        UnitCard::new(CardId(1), "Front", "Front", 1, 10, 0, 0, false).with_ability(
            create_ability(
                AbilityTrigger::BeforeUnitAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                "FrontUnitTrigger",
            ),
        ),
    );

    let support_unit = CombatUnit::from_card(
        UnitCard::new(CardId(2), "Support", "Support", 1, 10, 0, 0, false).with_abilities(vec![
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
    let front_unit = CombatUnit::from_card(
        UnitCard::new(CardId(1), "Front", "Front", 1, 10, 0, 0, false).with_ability(
            create_ability(
                AbilityTrigger::AfterUnitAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                "FrontAfterUnit",
            ),
        ),
    );

    let support_unit = CombatUnit::from_card(
        UnitCard::new(CardId(2), "Support", "Support", 1, 10, 0, 0, false).with_abilities(vec![
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
