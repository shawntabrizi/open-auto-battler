use crate::battle::{
    permanent_stat_deltas_from_events, player_permanent_stat_deltas_from_events,
    player_shop_mana_delta_from_events, shop_mana_delta_from_events, BattleResult, CombatEvent,
    UnitId,
};
use crate::limits::Team;
use crate::tests::*;
use crate::types::*;

#[test]
fn test_shop_mana_delta_helpers_filter_by_team() {
    let events = vec![
        CombatEvent::AbilityGainMana {
            source_instance_id: UnitId::player(1),
            team: Team::Player,
            amount: 2,
        },
        CombatEvent::AbilityGainMana {
            source_instance_id: UnitId::enemy(1),
            team: Team::Enemy,
            amount: 3,
        },
        CombatEvent::AbilityGainMana {
            source_instance_id: UnitId::player(2),
            team: Team::Player,
            amount: -1,
        },
        CombatEvent::BattleEnd {
            result: BattleResult::Draw,
        },
    ];

    assert_eq!(shop_mana_delta_from_events(&events, Team::Player), 1);
    assert_eq!(shop_mana_delta_from_events(&events, Team::Enemy), 3);
    assert_eq!(player_shop_mana_delta_from_events(&events), 1);
}

#[test]
fn test_permanent_stat_delta_helpers_accumulate_by_target_and_team() {
    let events = vec![
        CombatEvent::AbilityModifyStatsPermanent {
            source_instance_id: UnitId::player(9),
            target_instance_id: UnitId::player(1),
            health_change: 2,
            attack_change: 1,
            new_attack: 4,
            new_health: 7,
        },
        CombatEvent::AbilityModifyStatsPermanent {
            source_instance_id: UnitId::player(8),
            target_instance_id: UnitId::player(1),
            health_change: -1,
            attack_change: 4,
            new_attack: 8,
            new_health: 6,
        },
        CombatEvent::AbilityModifyStatsPermanent {
            source_instance_id: UnitId::enemy(9),
            target_instance_id: UnitId::enemy(1),
            health_change: 3,
            attack_change: 2,
            new_attack: 5,
            new_health: 8,
        },
    ];

    let player_deltas = permanent_stat_deltas_from_events(&events, Team::Player);
    assert_eq!(player_deltas.get(&UnitId::player(1)), Some(&(5, 1)));
    assert_eq!(player_deltas.len(), 1);

    let enemy_deltas = permanent_stat_deltas_from_events(&events, Team::Enemy);
    assert_eq!(enemy_deltas.get(&UnitId::enemy(1)), Some(&(2, 3)));
    assert_eq!(enemy_deltas.len(), 1);

    assert_eq!(
        player_permanent_stat_deltas_from_events(&events),
        player_deltas
    );
}

#[test]
fn test_modify_stats_permanent_effect_emits_expected_delta() {
    let durable = create_dummy_card(1, "Durable", 2, 5).with_ability(create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStatsPermanent {
            health: 3,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        "Fortify",
    ));

    let p_board = vec![CombatUnit::from_card(durable)];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 123);

    let fortify_event = events
        .iter()
        .find(|event| {
            matches!(
                event,
                CombatEvent::AbilityModifyStatsPermanent {
                    source_instance_id,
                    target_instance_id,
                    health_change,
                    attack_change,
                    new_attack,
                    new_health,
                } if *source_instance_id == UnitId::player(1)
                    && *target_instance_id == UnitId::player(1)
                    && *health_change == 3
                    && *attack_change == 2
                    && *new_attack == 4
                    && *new_health == 8
            )
        })
        .expect("Permanent self-buff should emit an AbilityModifyStatsPermanent event");

    assert!(matches!(
        fortify_event,
        CombatEvent::AbilityModifyStatsPermanent { .. }
    ));

    let deltas = player_permanent_stat_deltas_from_events(&events);
    assert_eq!(deltas.get(&UnitId::player(1)), Some(&(2, 3)));
}
