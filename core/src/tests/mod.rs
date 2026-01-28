mod battle_result;
mod limits;
mod mana;
mod math;
mod priority;
mod state;
mod triggers;
mod turns;

use crate::battle::{resolve_battle, CombatEvent, CombatUnit};
use crate::rng::XorShiftRng;
use crate::types::*;

// ==========================================
// HELPER FUNCTIONS (Boilerplate Reduction)
// ==========================================

fn create_dummy_card(id: u32, name: &str, atk: i32, hp: i32) -> UnitCard {
    UnitCard::new(CardId(id), name, name, atk, hp, 1, 1, false)
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
        condition: crate::types::AbilityCondition::default(),
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
        condition: crate::types::AbilityCondition::default(),
        max_triggers: None,
    };

    let card = UnitCard {
        id: CardId(id),
        template_id: "test_dummy".to_string(),
        name: name.to_string(),
        stats: UnitStats { attack, health },
        economy: EconomyStats {
            play_cost: 1,
            pitch_value: 1,
        },
        abilities: vec![ability],
        is_token: false,
    };

    CombatUnit::from_card(card)
}

fn create_dummy_enemy() -> CombatUnit {
    let card = UnitCard {
        id: CardId(999),
        template_id: "sandbag".to_string(),
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
        is_token: false,
    };
    CombatUnit::from_card(card)
}

fn run_battle(
    player_board: &[CombatUnit],
    enemy_board: &[CombatUnit],
    seed: u64,
) -> Vec<CombatEvent> {
    let mut rng = XorShiftRng::seed_from_u64(seed);
    resolve_battle(player_board.to_vec(), enemy_board.to_vec(), &mut rng)
}
