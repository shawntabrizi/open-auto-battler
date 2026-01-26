use super::*;
use crate::battle::CombatEvent;
use crate::types::*;

#[test]
fn test_max_triggers_unlimited() {
    // SCENARIO: A unit has an OnDamageTaken ability with max_triggers: None (unlimited).
    // It should trigger every time it takes damage.

    let create_unlimited_rager = || {
        let mut card = create_dummy_card(1, "UnlimitedRager", 1, 10);
        card.abilities = vec![Ability {
            trigger: AbilityTrigger::OnDamageTaken,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::SelfUnit,
            },
            name: "Unlimited Rage".to_string(),
            description: "Gain +1 attack when hurt (unlimited)".to_string(),
            condition: AbilityCondition::default(),
            max_triggers: None, // Unlimited
        }];
        card
    };

    let unlimited = create_unlimited_rager();
    let enemy = create_dummy_card(2, "Enemy", 1, 20);

    let p_board = vec![BoardUnit::from_card(unlimited)];
    let e_board = vec![BoardUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Count how many times "Unlimited Rage" triggered
    let trigger_count = events
        .iter()
        .filter(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                ability_name == "Unlimited Rage"
            } else {
                false
            }
        })
        .count();

    // With 10 HP and enemy dealing 1 damage per clash, player should survive 9 clashes
    // (dies on the 10th), so it should trigger at least several times
    assert!(
        trigger_count > 2,
        "Unlimited Rage should trigger more than 2 times, got {}",
        trigger_count
    );
}

#[test]
fn test_max_triggers_not_exceeded_on_death() {
    // SCENARIO: A unit has OnDamageTaken with max_triggers: Some(2).
    // It takes damage twice (reaching max), then takes fatal damage.
    // The fatal damage should NOT trigger the ability a 3rd time.

    // Create a unit with low HP that will die after a few hits
    let create_limited_unit = || {
        let mut card = create_dummy_card(1, "LimitedUnit", 1, 4);
        card.abilities = vec![Ability {
            trigger: AbilityTrigger::OnDamageTaken,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::SelfUnit,
            },
            name: "Limited Buff".to_string(),
            description: "Gain +1 attack when hurt (max 2 times)".to_string(),
            condition: AbilityCondition::default(),
            max_triggers: Some(2),
        }];
        card
    };

    // Enemy deals 2 damage per hit: 4 HP -> 2 HP (trigger 1) -> 0 HP (trigger 2? NO - max reached)
    // Actually with 2 damage per hit: 4 -> 2 (hit 1, trigger) -> 0 (hit 2, should NOT trigger again after max)
    // Let's use 1 damage hits to be more precise:
    // 4 -> 3 (trigger 1) -> 2 (trigger 2, max reached) -> 1 -> 0 (death, should NOT trigger)

    let limited = create_limited_unit();
    let enemy = create_dummy_card(2, "Enemy", 1, 20); // 1 damage per clash, high HP

    let p_board = vec![BoardUnit::from_card(limited)];
    let e_board = vec![BoardUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Count triggers
    let trigger_count = events
        .iter()
        .filter(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                ability_name == "Limited Buff"
            } else {
                false
            }
        })
        .count();

    // Should trigger exactly 2 times, not 3 or 4 (death should not add extra trigger)
    assert_eq!(
        trigger_count, 2,
        "Limited Buff should trigger exactly 2 times even when dying, got {}",
        trigger_count
    );
}

#[test]
fn test_max_triggers_limit() {
    // SCENARIO: A unit has an OnDamageTaken ability with max_triggers: Some(2).
    // It takes damage 3 times but the ability should only trigger twice.

    // Create a unit that spawns a zombie when damaged, limited to 2 triggers
    let create_limited_spawner = || {
        let mut card = create_dummy_card(1, "LimitedSpawner", 1, 10);
        card.abilities = vec![Ability {
            trigger: AbilityTrigger::OnDamageTaken,
            effect: AbilityEffect::ModifyStats {
                health: 0,
                attack: 1,
                target: AbilityTarget::SelfUnit,
            },
            name: "Limited Rage".to_string(),
            description: "Gain +1 attack when hurt (max 2 times)".to_string(),
            condition: AbilityCondition::default(),
            max_triggers: Some(2), // Only trigger twice!
        }];
        card
    };

    // Create an enemy that deals 1 damage each clash (will hit multiple times)
    let limited = create_limited_spawner();
    let enemy = create_dummy_card(2, "Enemy", 1, 20); // Low damage, high HP to survive

    let p_board = vec![BoardUnit::from_card(limited)];
    let e_board = vec![BoardUnit::from_card(enemy)];

    let events = run_battle(&p_board, &e_board, 42);

    // Count how many times "Limited Rage" triggered
    let trigger_count = events
        .iter()
        .filter(|e| {
            if let CombatEvent::AbilityTrigger { ability_name, .. } = e {
                ability_name == "Limited Rage"
            } else {
                false
            }
        })
        .count();

    assert_eq!(
        trigger_count, 2,
        "Limited Rage should only trigger 2 times despite taking damage multiple times"
    );
}
