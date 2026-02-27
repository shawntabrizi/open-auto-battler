mod battle_helpers;
mod battle_result;
mod commit_paths;
mod limits;
mod log;
mod mana;
mod math;
mod opponents;
mod priority;
mod state;
mod state_ops;
mod triggers;
mod turns;
mod units;
mod view;

use crate::battle::{resolve_battle, CombatEvent, CombatUnit};
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

fn create_ability(trigger: AbilityTrigger, effect: AbilityEffect, name: &str) -> Ability {
    Ability {
        trigger,
        effect,
        name: name.to_string(),
        description: "Test Ability".to_string(),
        conditions: vec![],
        max_triggers: None,
    }
}

fn create_tester_unit(
    id: u32,
    name: &str,
    attack: i32,
    health: i32,
    ability_name: &str,
) -> CombatUnit {
    let ability = Ability {
        trigger: AbilityTrigger::OnStart,
        // Simple effect that won't kill anyone to keep the log clean
        effect: AbilityEffect::ModifyStats {
            health: 1,
            attack: 0,
            target: AbilityTarget::All {
                scope: TargetScope::SelfUnit,
            },
        },
        name: ability_name.to_string(),
        description: "Priority Test Ability".to_string(),
        conditions: vec![],
        max_triggers: None,
    };

    let card = UnitCard {
        id: CardId(id),
        name: name.to_string(),
        stats: UnitStats { attack, health },
        economy: EconomyStats {
            play_cost: 1,
            pitch_value: 1,
        },
        abilities: vec![ability],
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
            pitch_value: 0,
        },
        abilities: vec![],
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
    // rat_token (ID 40)
    pool.insert(
        CardId(40),
        UnitCard::new(CardId(40), "Rat Token", 1, 1, 0, 0),
    );
    // zombie_soldier (ID 41)
    pool.insert(
        CardId(41),
        UnitCard::new(CardId(41), "Zombie Soldier", 1, 1, 1, 1),
    );
    // zombie_spawn (ID 42)
    pool.insert(
        CardId(42),
        UnitCard::new(CardId(42), "Zombie Spawn", 1, 1, 0, 0),
    );
    // golem (ID 43)
    pool.insert(CardId(43), UnitCard::new(CardId(43), "Golem", 5, 5, 0, 0));
    // phoenix_egg (ID 44)
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
