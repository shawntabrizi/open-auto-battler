use crate::types::{BoardUnit, UnitCard};

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
        *card_id_counter += 1;
        let card = UnitCard::new(
            *card_id_counter,
            template_id,
            name,
            attack,
            health,
            0, // play_cost
            0, // pitch_value
        );
        units.push(BoardUnit::from_card(card));
    }

    units
}