mod battle_helpers;
mod battle_result;
mod limits;
mod log;
mod math;
mod priority;
mod triggers;

use crate::battle::{resolve_battle, CombatEvent, CombatUnit, UnitId};
use crate::rng::XorShiftRng;
use crate::types::*;
use alloc::collections::BTreeMap;

// ==========================================
// HELPER FUNCTIONS (Boilerplate Reduction)
// ==========================================

fn create_dummy_card(id: u32, name: &str, atk: i32, hp: i32) -> UnitCard {
    UnitCard::new(CardId(id), name, atk, hp, 1, 1)
}

fn create_board_unit(id: u32, name: &str, atk: i32, hp: i32) -> CombatUnit {
    CombatUnit::from_card(create_dummy_card(id, name, atk, hp))
}

fn create_ability(trigger: AbilityTrigger, effect: AbilityEffect) -> Ability {
    Ability {
        trigger,
        effect,
        conditions: vec![],
        max_triggers: None,
    }
}

fn create_tester_unit(id: u32, name: &str, attack: i32, health: i32) -> CombatUnit {
    let ability = Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::ModifyStats {
            health: 1,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        conditions: vec![],
        max_triggers: None,
    };

    let card = UnitCard {
        id: CardId(id),
        name: name.to_string(),
        stats: UnitStats { attack, health },
        economy: EconomyStats {
            play_cost: 1,
            burn_value: 1,
        },
        shop_abilities: vec![],
        battle_abilities: vec![ability],
    };

    CombatUnit::from_card(card)
}

fn create_dummy_enemy() -> CombatUnit {
    let card = UnitCard {
        id: CardId(999),
        name: "Sandbag".to_string(),
        stats: UnitStats {
            attack: 0,
            health: 50,
        },
        economy: EconomyStats {
            play_cost: 0,
            burn_value: 0,
        },
        shop_abilities: vec![],
        battle_abilities: vec![],
    };
    CombatUnit::from_card(card)
}

/// Empty card pool for tests that don't use SpawnUnit
fn empty_card_pool() -> BTreeMap<CardId, UnitCard> {
    BTreeMap::new()
}

/// Card pool with common token cards for spawn tests
fn spawn_test_card_pool() -> BTreeMap<CardId, UnitCard> {
    let mut pool = BTreeMap::new();
    pool.insert(
        CardId(40),
        UnitCard::new(CardId(40), "Rat Token", 1, 1, 0, 0),
    );
    pool.insert(
        CardId(41),
        UnitCard::new(CardId(41), "Zombie Soldier", 1, 1, 1, 1),
    );
    pool.insert(
        CardId(42),
        UnitCard::new(CardId(42), "Zombie Spawn", 1, 1, 0, 0),
    );
    pool.insert(CardId(43), UnitCard::new(CardId(43), "Golem", 5, 5, 0, 0));
    pool.insert(
        CardId(44),
        UnitCard::new(CardId(44), "Phoenix Egg", 0, 5, 0, 0),
    );
    pool
}

fn run_battle(
    player_board: &[CombatUnit],
    enemy_board: &[CombatUnit],
    seed: u64,
) -> Vec<CombatEvent> {
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let card_pool = empty_card_pool();
    resolve_battle(
        player_board.to_vec(),
        enemy_board.to_vec(),
        &mut rng,
        &card_pool,
    )
}

fn run_battle_with_pool(
    player_board: &[CombatUnit],
    enemy_board: &[CombatUnit],
    seed: u64,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> Vec<CombatEvent> {
    let mut rng = XorShiftRng::seed_from_u64(seed);
    resolve_battle(
        player_board.to_vec(),
        enemy_board.to_vec(),
        &mut rng,
        card_pool,
    )
}

fn has_ability_trigger(events: &[CombatEvent], source_id: UnitId, ability_index: u32) -> bool {
    events.iter().any(|event| {
        matches!(
            event,
            CombatEvent::AbilityTrigger {
                source_instance_id,
                ability_index: idx,
            } if *source_instance_id == source_id && *idx == ability_index
        )
    })
}

fn count_ability_triggers(events: &[CombatEvent], source_id: UnitId, ability_index: u32) -> usize {
    events
        .iter()
        .filter(|event| {
            matches!(
                event,
                CombatEvent::AbilityTrigger {
                    source_instance_id,
                    ability_index: idx,
                } if *source_instance_id == source_id && *idx == ability_index
            )
        })
        .count()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct AbilityTriggerRef {
    source_id: UnitId,
    ability_index: u32,
}

fn collect_ability_triggers(events: &[CombatEvent]) -> Vec<AbilityTriggerRef> {
    events
        .iter()
        .filter_map(|event| {
            if let CombatEvent::AbilityTrigger {
                source_instance_id,
                ability_index,
            } = event
            {
                Some(AbilityTriggerRef {
                    source_id: *source_instance_id,
                    ability_index: *ability_index,
                })
            } else {
                None
            }
        })
        .collect()
}
