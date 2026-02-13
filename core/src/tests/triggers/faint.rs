use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

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
        conditions: vec![],
        max_triggers: Some(1),
    });

    let ally_behind = create_dummy_card(2, "Ally", 5, 5);

    let p_board = vec![
        CombatUnit::from_card(martyr),
        CombatUnit::from_card(ally_behind),
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
        conditions: vec![],
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
            conditions: vec![],
            max_triggers: None,
        },
        Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::SpawnUnit {
                card_id: CardId(43), // golem
            },
            name: "Raise Golem".to_string(),
            description: "Spawn a 5/5 Golem".to_string(),
            conditions: vec![],
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
            conditions: vec![],
            max_triggers: None,
        },
        Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::SpawnUnit {
                card_id: CardId(43), // golem
            },
            name: "Raise Golem".to_string(),
            description: "Spawn a 5/5 Golem".to_string(),
            conditions: vec![],
            max_triggers: None,
        },
    ]);

    let p_board = vec![
        CombatUnit::from_card(mk1),
        CombatUnit::from_card(mk2),
        CombatUnit::from_card(mk3),
        CombatUnit::from_card(lich),
        CombatUnit::from_card(mk5),
    ];
    let e_board = vec![
        CombatUnit::from_card(e_mk1),
        CombatUnit::from_card(e_mk2),
        CombatUnit::from_card(e_lich),
    ];

    let card_pool = spawn_test_card_pool();
    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

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
