use crate::battle::{CombatEvent, UnitId};
use crate::tests::*;
use crate::types::*;

#[test]
fn test_berserker_combo() {
    let smith_buff = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::Allies,
            },
        },
        "Sharpen",
    );
    let smith_dmg = create_ability(
        AbilityTrigger::OnStart,
        AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::All {
                scope: TargetScope::Allies,
            },
        },
        "Fire",
    );
    let pain_smith =
        create_dummy_card(1, "Smith", 3, 3).with_abilities(vec![smith_buff, smith_dmg]);

    let orc_rage = create_ability(
        AbilityTrigger::OnHurt,
        AbilityEffect::ModifyStats {
            health: 0,
            attack: 2,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        "Berserk",
    );
    let raging_orc = create_dummy_card(2, "Orc", 2, 8).with_ability(orc_rage);

    let p_board = vec![
        BoardUnit::from_card(pain_smith),
        BoardUnit::from_card(raging_orc),
    ];
    let e_board = vec![create_dummy_enemy()];

    let events = run_battle(&p_board, &e_board, 42);

    let orc_buffs: Vec<i32> = events
        .iter()
        .filter_map(|e| {
            if let CombatEvent::AbilityModifyStats {
                target_instance_id,
                attack_change,
                ..
            } = e
            {
                if *target_instance_id == UnitId::player(2) {
                    return Some(*attack_change);
                }
            }
            None
        })
        .collect();

    assert_eq!(
        orc_buffs.iter().sum::<i32>(),
        4,
        "Orc should gain +4 Attack total (+2 Self, +2 Smith)"
    );
    assert_eq!(orc_buffs.len(), 2, "Orc should receive 2 distinct buffs");

    let orc_dmg = events.iter().find(|e| {
             matches!(e, CombatEvent::AbilityDamage { target_instance_id, .. } if *target_instance_id == UnitId::player(2))
        });
    assert!(orc_dmg.is_some(), "Orc should take damage");
}
