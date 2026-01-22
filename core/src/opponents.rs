use crate::types::{Ability, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit, UnitCard};

/// Create a unit with an optional ability
fn create_unit(
    card_id_counter: &mut u32,
    template_id: &str,
    name: &str,
    attack: i32,
    health: i32,
    ability: Option<Ability>,
) -> BoardUnit {
    *card_id_counter += 1;
    let mut card = UnitCard::new(*card_id_counter, template_id, name, attack, health, 0, 0);
    if let Some(a) = ability {
        card = card.with_ability(a);
    }
    BoardUnit::from_card(card)
}

/// Get the ability for a specific opponent unit type
fn get_opponent_ability(template_id: &str) -> Option<Ability> {
    match template_id {
        "orc_shaman" => Some(Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::ModifyStats {
                health: 2,
                attack: 0,
                target: AbilityTarget::FrontAlly,
            },
            name: "Healing Totem".to_string(),
            description: "Heal front ally for 2 at battle start".to_string(),
        }),
        "dragon_tyrant" => Some(Ability {
            trigger: AbilityTrigger::OnStart,
            effect: AbilityEffect::Damage {
                amount: 3,
                target: AbilityTarget::AllEnemies,
            },
            name: "Dragon Breath".to_string(),
            description: "Deal 3 damage to all enemies at battle start".to_string(),
        }),
        _ => None,
    }
}

/// Get the opponent board for a given round (1-10)
pub fn get_opponent_for_round(round: i32, card_id_counter: &mut u32) -> Vec<BoardUnit> {
    let mut units = Vec::new();
    let templates = match round {
        1 => vec![("goblin_scout", "Goblin Scout", 1, 2)],
        2 => vec![
            ("goblin_scout", "Goblin Scout", 1, 2),
            ("goblin_grunt", "Goblin Grunt", 2, 2),
        ],
        3 => vec![
            ("orc_shaman", "Orc Shaman", 2, 3),
            ("goblin_scout", "Goblin Scout", 1, 2),
            ("goblin_grunt", "Goblin Grunt", 2, 2),
        ],
        4 => vec![
            ("orc_warrior", "Orc Warrior", 3, 4),
            ("orc_shaman", "Orc Shaman", 2, 3),
            ("goblin_grunt", "Goblin Grunt", 2, 2),
        ],
        5 => vec![
            ("troll_brute", "Troll Brute", 4, 5),
            ("orc_warrior", "Orc Warrior", 3, 3),
            ("orc_shaman", "Orc Shaman", 2, 3),
        ],
        6 => vec![
            ("troll_brute", "Troll Brute", 4, 6),
            ("troll_warrior", "Troll Warrior", 3, 5),
            ("orc_warrior", "Orc Warrior", 3, 3),
            ("goblin_grunt", "Goblin Grunt", 2, 2),
        ],
        7 => vec![
            ("ogre_mauler", "Ogre Mauler", 5, 7),
            ("troll_brute", "Troll Brute", 4, 5),
            ("troll_warrior", "Troll Warrior", 3, 5),
            ("orc_shaman", "Orc Shaman", 2, 3),
        ],
        8 => vec![
            ("ogre_mauler", "Ogre Mauler", 5, 8),
            ("ogre_warrior", "Ogre Warrior", 4, 6),
            ("troll_brute", "Troll Brute", 4, 5),
            ("troll_warrior", "Troll Warrior", 3, 5),
        ],
        9 => vec![
            ("giant_crusher", "Giant Crusher", 6, 9),
            ("ogre_mauler", "Ogre Mauler", 5, 7),
            ("ogre_warrior", "Ogre Warrior", 4, 6),
            ("troll_brute", "Troll Brute", 4, 5),
            ("orc_shaman", "Orc Shaman", 2, 3),
        ],
        _ => vec![
            // Default to round 10 for any round beyond
            ("dragon_tyrant", "Dragon Tyrant", 8, 12),
            ("giant_crusher", "Giant Crusher", 6, 8),
            ("ogre_mauler", "Ogre Mauler", 5, 7),
            ("ogre_warrior", "Ogre Warrior", 4, 6),
            ("troll_brute", "Troll Brute", 4, 5),
        ],
    };

    for (template_id, name, attack, health) in templates {
        let ability = get_opponent_ability(template_id);
        units.push(create_unit(
            card_id_counter,
            template_id,
            name,
            attack,
            health,
            ability,
        ));
    }

    units
}
