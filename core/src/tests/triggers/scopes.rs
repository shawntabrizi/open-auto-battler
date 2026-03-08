use crate::battle::UnitId;
use crate::tests::*;
use crate::types::*;

#[test]
fn test_attack_trigger_scopes() {
    let front_unit = CombatUnit::from_card(
        UnitCard::new(CardId(1), "Front", 1, 10, 0, 0).with_battle_ability(create_ability(
            AbilityTrigger::BeforeUnitAttack,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
        )),
    );

    let support_unit = CombatUnit::from_card(
        UnitCard::new(CardId(2), "Support", 1, 10, 0, 0).with_battle_abilities(vec![
            create_ability(
                AbilityTrigger::BeforeUnitAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
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
            ),
        ]),
    );

    let p_board = vec![front_unit, support_unit];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 42);

    let triggers = collect_ability_triggers(&events);
    let front_trigger = AbilityTriggerRef {
        source_id: UnitId::player(1),
        ability_index: 0,
    };
    let support_any_trigger = AbilityTriggerRef {
        source_id: UnitId::player(2),
        ability_index: 1,
    };
    let support_unit_trigger = AbilityTriggerRef {
        source_id: UnitId::player(2),
        ability_index: 0,
    };

    assert!(triggers.contains(&front_trigger));
    assert!(triggers.contains(&support_any_trigger));
    assert!(
        !triggers.contains(&support_unit_trigger),
        "Support unit should not fire BeforeUnitAttack triggers"
    );
}

#[test]
fn test_after_attack_trigger_scopes() {
    let front_unit = CombatUnit::from_card(
        UnitCard::new(CardId(1), "Front", 1, 10, 0, 0).with_battle_ability(create_ability(
            AbilityTrigger::AfterUnitAttack,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
        )),
    );

    let support_unit = CombatUnit::from_card(
        UnitCard::new(CardId(2), "Support", 1, 10, 0, 0).with_battle_abilities(vec![
            create_ability(
                AbilityTrigger::AfterUnitAttack,
                AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
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
            ),
        ]),
    );

    let p_board = vec![front_unit, support_unit];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 42);

    let triggers = collect_ability_triggers(&events);
    let front_trigger = AbilityTriggerRef {
        source_id: UnitId::player(1),
        ability_index: 0,
    };
    let support_any_trigger = AbilityTriggerRef {
        source_id: UnitId::player(2),
        ability_index: 1,
    };
    let support_unit_trigger = AbilityTriggerRef {
        source_id: UnitId::player(2),
        ability_index: 0,
    };

    assert!(triggers.contains(&front_trigger));
    assert!(triggers.contains(&support_any_trigger));
    assert!(
        !triggers.contains(&support_unit_trigger),
        "Support unit should not fire AfterUnitAttack triggers"
    );
}
