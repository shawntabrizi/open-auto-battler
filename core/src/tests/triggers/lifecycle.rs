use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_on_spawn_triggers_for_spawned_unit() {
    let spawnling =
        UnitCard::new(CardId(120), "Spawnling", 1, 3, 0, 0).with_ability(create_ability(
            AbilityTrigger::OnSpawn,
            AbilityEffect::ModifyStats {
                health: 0,
                attack: 2,
                target: AbilityTarget::All {
                    scope: TargetScope::SelfUnit,
                },
            },
            "Awaken",
        ));

    let mut card_pool = spawn_test_card_pool();
    card_pool.insert(CardId(120), spawnling);

    let summoner = create_dummy_card(1, "Summoner", 0, 10).with_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::SpawnUnit {
            card_id: CardId(120),
        },
        "Summon Spawnling",
    ));

    let p_board = vec![CombatUnit::from_card(summoner)];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle_with_pool(&p_board, &e_board, 42, &card_pool);

    let awaken_trigger = events
        .iter()
        .find(|event| {
            matches!(
                event,
                CombatEvent::AbilityTrigger { ability_name, .. } if ability_name == "Awaken"
            )
        })
        .expect("Spawned unit should trigger its OnSpawn ability");

    let spawned_id = match awaken_trigger {
        CombatEvent::AbilityTrigger {
            source_instance_id, ..
        } => *source_instance_id,
        _ => unreachable!(),
    };

    assert_ne!(spawned_id, UnitId::player(1));

    let self_buff = events
        .iter()
        .find(|event| {
            matches!(
                event,
                CombatEvent::AbilityModifyStats {
                    source_instance_id,
                    target_instance_id,
                    attack_change,
                    ..
                } if *source_instance_id == spawned_id
                    && *target_instance_id == spawned_id
                    && *attack_change == 2
            )
        })
        .expect("OnSpawn ability should buff the spawned unit");

    if let CombatEvent::AbilityModifyStats { new_attack, .. } = self_buff {
        assert_eq!(*new_attack, 3);
    }
}

#[test]
fn test_on_hurt_aggressor_scope_hits_the_attacker() {
    let retaliator = create_dummy_card(1, "Retaliator", 0, 2).with_ability(create_ability(
        AbilityTrigger::OnHurt,
        AbilityEffect::Damage {
            amount: 2,
            target: AbilityTarget::All {
                scope: TargetScope::Aggressor,
            },
        },
        "Counterstrike",
    ));

    let attacker = create_dummy_card(2, "Attacker", 1, 2);

    let p_board = vec![CombatUnit::from_card(retaliator)];
    let e_board = vec![CombatUnit::from_card(attacker)];

    let events = run_battle(&p_board, &e_board, 99);

    let retaliate_hit = events
        .iter()
        .find(|event| {
            matches!(
                event,
                CombatEvent::AbilityDamage {
                    source_instance_id,
                    target_instance_id,
                    damage,
                    ..
                } if *source_instance_id == UnitId::player(1)
                    && *target_instance_id == UnitId::enemy(1)
                    && *damage == 2
            )
        })
        .expect("Aggressor-targeted OnHurt should damage the attacking unit");

    if let CombatEvent::AbilityDamage { remaining_hp, .. } = retaliate_hit {
        assert_eq!(*remaining_hp, 0);
    }
}
