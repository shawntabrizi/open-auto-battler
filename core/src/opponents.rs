//! Opponent generation for battles
//!
//! This module handles generating enemy boards for battles with different "personalities" and scaling.

use alloc::vec;
use alloc::vec::Vec;

use crate::error::{GameError, GameResult};
use crate::rng::{BattleRng, XorShiftRng};
use crate::types::{BoardUnit, UnitCard};
use crate::units::get_starter_templates;

/// Create a unit from a template
fn create_unit_from_template(
    card_id_counter: &mut u32,
    template_id: &str,
) -> GameResult<BoardUnit> {
    *card_id_counter += 1;

    // Get all starter templates
    let templates = get_starter_templates();

    // Find the template
    let template = templates
        .into_iter()
        .find(|t| t.template_id == template_id)
        .ok_or(GameError::TemplateNotFound)?;

    // Create the unit card with the template data
    let mut card = UnitCard::new(
        *card_id_counter,
        template.template_id,
        template.name,
        template.attack,
        template.health,
        template.play_cost,
        template.pitch_value,
        template.is_token,
    );

    // Add abilities if any
    for ability in template.abilities {
        card = card.with_ability(ability);
    }

    Ok(BoardUnit::from_card(card))
}

/// The Swarm Strategy: Focuses on many small units and undead spawning.
fn get_swarm_strategy(round: i32) -> Vec<&'static str> {
    match round {
        1 => vec!["rat_swarm", "goblin_scout"],
        2 => vec!["rat_swarm", "goblin_scout", "goblin_grunt"],
        3 => vec!["zombie_captain", "goblin_scout", "rat_swarm"],
        4 => vec!["zombie_captain", "zombie_captain", "rat_swarm"],
        5 => vec!["necromancer", "zombie_captain", "zombie_captain", "rat_swarm"],
        6 => vec!["necromancer", "pack_leader", "zombie_captain", "zombie_captain", "rat_swarm"],
        7 => vec!["lich", "necromancer", "zombie_captain", "zombie_captain", "rat_swarm"],
        8 => vec!["lich", "lich", "zombie_captain", "zombie_captain", "rat_swarm"],
        9 => vec!["lich", "lich", "necromancer", "zombie_captain", "zombie_captain"],
        _ => vec!["dragon_tyrant", "lich", "lich", "zombie_captain", "zombie_captain"],
    }
}

/// The Tank Strategy: Focuses on high health units and front-line buffs.
fn get_tank_strategy(round: i32) -> Vec<&'static str> {
    match round {
        1 => vec!["shield_bearer", "militia"],
        2 => vec!["shield_bearer", "shield_bearer"],
        3 => vec!["shield_bearer", "battle_hardened", "militia"],
        4 => vec!["shield_master", "shield_bearer", "battle_hardened"],
        5 => vec!["shield_master", "shield_bearer", "shield_bearer", "battle_hardened"],
        6 => vec!["shield_master", "ogre_mauler", "shield_bearer", "battle_hardened"],
        7 => vec!["behemoth", "shield_master", "ogre_mauler", "battle_hardened"],
        8 => vec!["behemoth", "behemoth", "shield_master", "battle_hardened"],
        9 => vec!["behemoth", "behemoth", "shield_master", "shield_master", "shield_master"],
        _ => vec!["behemoth", "behemoth", "behemoth", "behemoth", "behemoth"],
    }
}

/// The Sniper Strategy: Focuses on back-line damage and specialized execution.
fn get_sniper_strategy(round: i32) -> Vec<&'static str> {
    match round {
        1 => vec!["militia", "archer"],
        2 => vec!["shield_bearer", "sniper"],
        3 => vec!["militia", "archer", "sniper"],
        4 => vec!["shield_bearer", "headhunter", "sniper"],
        5 => vec!["shield_bearer", "assassin", "headhunter", "sniper"],
        6 => vec!["ogre_mauler", "assassin", "headhunter", "sniper", "archer"],
        7 => vec!["ogre_mauler", "assassin", "assassin", "headhunter", "sniper"],
        8 => vec!["giant_crusher", "assassin", "assassin", "headhunter", "sniper"],
        9 => vec!["mana_reaper", "giant_crusher", "assassin", "headhunter", "sniper"],
        _ => vec!["mana_reaper", "mana_reaper", "dragon_tyrant", "giant_crusher", "headhunter"],
    }
}

/// Get the opponent board for a given round (1-10)
pub fn get_opponent_for_round(
    round: i32,
    card_id_counter: &mut u32,
    seed: u64,
) -> GameResult<Vec<BoardUnit>> {
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let strategy_roll = rng.gen_range(3); // 0, 1, or 2

    let template_ids = match strategy_roll {
        0 => get_swarm_strategy(round),
        1 => get_tank_strategy(round),
        _ => get_sniper_strategy(round),
    };

    let mut units = Vec::new();
    for template_id in template_ids {
        units.push(create_unit_from_template(card_id_counter, template_id)?);
    }

    Ok(units)
}