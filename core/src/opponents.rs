//! Opponent generation for battles
//!
//! This module handles generating enemy boards for battles.

use alloc::vec;
use alloc::vec::Vec;

use crate::error::{GameError, GameResult};
use crate::types::{BoardUnit, UnitCard};
use crate::units::get_starter_templates;

/// Create a unit from a template
fn create_unit_from_template(
    card_id_counter: &mut u32,
    template_id: &str,
) -> GameResult<BoardUnit> {
    *card_id_counter += 1;

    // Get all starter templates (this includes all units now)
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

/// Get the opponent board for a given round (1-10)
pub fn get_opponent_for_round(
    round: i32,
    card_id_counter: &mut u32,
) -> GameResult<Vec<BoardUnit>> {
    let mut units = Vec::new();
    let template_ids = match round {
        1 => vec!["goblin_scout"],
        2 => vec!["goblin_scout", "goblin_grunt"],
        3 => vec!["orc_shaman", "goblin_scout", "goblin_grunt"],
        4 => vec!["orc_warrior", "orc_shaman", "goblin_grunt"],
        5 => vec!["troll_brute", "orc_warrior", "orc_shaman"],
        6 => vec![
            "troll_brute",
            "troll_warrior",
            "orc_warrior",
            "goblin_grunt",
        ],
        7 => vec!["ogre_mauler", "troll_brute", "troll_warrior", "orc_shaman"],
        8 => vec![
            "ogre_mauler",
            "ogre_warrior",
            "troll_brute",
            "troll_warrior",
        ],
        9 => vec![
            "giant_crusher",
            "ogre_mauler",
            "ogre_warrior",
            "troll_brute",
            "orc_shaman",
        ],
        _ => vec![
            // Default to round 10 for any round beyond
            "dragon_tyrant",
            "giant_crusher",
            "ogre_mauler",
            "ogre_warrior",
            "troll_brute",
        ],
    };

    for template_id in template_ids {
        units.push(create_unit_from_template(card_id_counter, template_id)?);
    }

    Ok(units)
}
