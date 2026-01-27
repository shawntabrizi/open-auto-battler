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
    let squire = create_dummy_card(2, "Squire", 2, 3).with_ability(squire_ability);

    let p_board = vec![BoardUnit::from_card(fodder), BoardUnit::from_card(squire)];
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
