use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_targeting_logic_front_ally() {
    let buff = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 5,
            attack: 0,
            target: AbilityTarget::Position {
                scope: TargetScope::Allies,
                index: 0,
            },
        },
        "Buff",
    );

    let front = create_dummy_card(1, "Front", 1, 10);
    let back = create_dummy_card(2, "Back", 1, 10).with_ability(buff);

    let p_board = vec![BoardUnit::from_card(front), BoardUnit::from_card(back)];
    let e_board = vec![create_board_unit(3, "Dummy", 1, 50)];

    let events = run_battle(&p_board, &e_board, 42);

    let buff_event = events
        .iter()
        .find(|e| matches!(e, CombatEvent::AbilityModifyStats { .. }))
        .unwrap();

    if let CombatEvent::AbilityModifyStats {
        target_instance_id,
        health_change,
        ..
    } = buff_event
    {
        assert_eq!(*target_instance_id, UnitId::player(1));
        assert_eq!(*health_change, 5);
    }
}
