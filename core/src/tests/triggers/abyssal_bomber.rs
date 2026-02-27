use crate::battle::{CombatEvent, Team, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_abyssal_bomber_death_nova() {
    let bomber_ability = create_ability(
        AbilityTrigger::OnFaint,
        AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::All {
                scope: TargetScope::All,
            },
        },
        "Abyssal Blast",
    );

    let bomber = create_dummy_card(1, "Abyssal Bomber", 2, 2).with_battle_ability(bomber_ability);
    let ally = create_dummy_card(2, "Ally", 1, 5);

    let enemy1 = create_dummy_card(3, "Enemy1", 2, 5);
    let enemy2 = create_dummy_card(4, "Enemy2", 1, 2);

    let p_board = vec![CombatUnit::from_card(bomber), CombatUnit::from_card(ally)];
    let e_board = vec![CombatUnit::from_card(enemy1), CombatUnit::from_card(enemy2)];

    let events = run_battle(&p_board, &e_board, 42);

    let bomber_death = events
        .iter()
        .any(|e| matches!(e, CombatEvent::UnitDeath { team, .. } if *team == Team::Player));
    assert!(bomber_death, "Abyssal Bomber should have died");

    let ally_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
            if *target_instance_id == UnitId::player(2) && *damage == 3)
    });
    assert!(ally_hit, "Ally should have taken 3 damage from Bomber");

    let enemy1_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
            if *target_instance_id == UnitId::enemy(1) && *damage == 3)
    });
    assert!(enemy1_hit, "Enemy1 should have taken 3 damage from Bomber");

    let enemy2_hit = events.iter().any(|e| {
        matches!(e, CombatEvent::AbilityDamage { target_instance_id, damage, .. }
            if *target_instance_id == UnitId::enemy(2) && *damage == 3)
    });
    assert!(enemy2_hit, "Enemy2 should have taken 3 damage from Bomber");

    let enemy_death_event = events
        .iter()
        .find(|e| matches!(e, CombatEvent::UnitDeath { team, .. } if *team == Team::Enemy));

    assert!(
        enemy_death_event.is_some(),
        "Enemy death event should have occurred"
    );
    if let Some(CombatEvent::UnitDeath {
        new_board_state, ..
    }) = enemy_death_event
    {
        assert!(
            new_board_state.is_empty(),
            "Both enemies should have been removed from the board"
        );
    }
}
