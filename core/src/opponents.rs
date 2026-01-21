use crate::battle::CombatUnit;

/// Get the opponent board for a given round (1-10)
pub fn get_opponent_for_round(round: i32) -> Vec<CombatUnit> {
    match round {
        1 => vec![
            CombatUnit {
                name: "Goblin Scout".to_string(),
                attack: 1,
                health: 2,
                max_health: 2,
            },
        ],
        2 => vec![
            CombatUnit {
                name: "Goblin Scout".to_string(),
                attack: 1,
                health: 2,
                max_health: 2,
            },
            CombatUnit {
                name: "Goblin Grunt".to_string(),
                attack: 2,
                health: 2,
                max_health: 2,
            },
        ],
        3 => vec![
            CombatUnit {
                name: "Orc Warrior".to_string(),
                attack: 2,
                health: 3,
                max_health: 3,
            },
            CombatUnit {
                name: "Goblin Scout".to_string(),
                attack: 1,
                health: 2,
                max_health: 2,
            },
            CombatUnit {
                name: "Goblin Grunt".to_string(),
                attack: 2,
                health: 2,
                max_health: 2,
            },
        ],
        4 => vec![
            CombatUnit {
                name: "Orc Warrior".to_string(),
                attack: 3,
                health: 4,
                max_health: 4,
            },
            CombatUnit {
                name: "Orc Shaman".to_string(),
                attack: 2,
                health: 3,
                max_health: 3,
            },
            CombatUnit {
                name: "Goblin Grunt".to_string(),
                attack: 2,
                health: 2,
                max_health: 2,
            },
        ],
        5 => vec![
            CombatUnit {
                name: "Troll Brute".to_string(),
                attack: 4,
                health: 5,
                max_health: 5,
            },
            CombatUnit {
                name: "Orc Warrior".to_string(),
                attack: 3,
                health: 3,
                max_health: 3,
            },
            CombatUnit {
                name: "Orc Shaman".to_string(),
                attack: 2,
                health: 3,
                max_health: 3,
            },
        ],
        6 => vec![
            CombatUnit {
                name: "Troll Brute".to_string(),
                attack: 4,
                health: 6,
                max_health: 6,
            },
            CombatUnit {
                name: "Troll Warrior".to_string(),
                attack: 3,
                health: 5,
                max_health: 5,
            },
            CombatUnit {
                name: "Orc Warrior".to_string(),
                attack: 3,
                health: 3,
                max_health: 3,
            },
            CombatUnit {
                name: "Goblin Grunt".to_string(),
                attack: 2,
                health: 2,
                max_health: 2,
            },
        ],
        7 => vec![
            CombatUnit {
                name: "Ogre Mauler".to_string(),
                attack: 5,
                health: 7,
                max_health: 7,
            },
            CombatUnit {
                name: "Troll Brute".to_string(),
                attack: 4,
                health: 5,
                max_health: 5,
            },
            CombatUnit {
                name: "Troll Warrior".to_string(),
                attack: 3,
                health: 5,
                max_health: 5,
            },
            CombatUnit {
                name: "Orc Shaman".to_string(),
                attack: 2,
                health: 3,
                max_health: 3,
            },
        ],
        8 => vec![
            CombatUnit {
                name: "Ogre Mauler".to_string(),
                attack: 5,
                health: 8,
                max_health: 8,
            },
            CombatUnit {
                name: "Ogre Warrior".to_string(),
                attack: 4,
                health: 6,
                max_health: 6,
            },
            CombatUnit {
                name: "Troll Brute".to_string(),
                attack: 4,
                health: 5,
                max_health: 5,
            },
            CombatUnit {
                name: "Troll Warrior".to_string(),
                attack: 3,
                health: 5,
                max_health: 5,
            },
        ],
        9 => vec![
            CombatUnit {
                name: "Giant Crusher".to_string(),
                attack: 6,
                health: 9,
                max_health: 9,
            },
            CombatUnit {
                name: "Ogre Mauler".to_string(),
                attack: 5,
                health: 7,
                max_health: 7,
            },
            CombatUnit {
                name: "Ogre Warrior".to_string(),
                attack: 4,
                health: 6,
                max_health: 6,
            },
            CombatUnit {
                name: "Troll Brute".to_string(),
                attack: 4,
                health: 5,
                max_health: 5,
            },
            CombatUnit {
                name: "Orc Shaman".to_string(),
                attack: 2,
                health: 3,
                max_health: 3,
            },
        ],
        10 => vec![
            CombatUnit {
                name: "Dragon Tyrant".to_string(),
                attack: 8,
                health: 12,
                max_health: 12,
            },
            CombatUnit {
                name: "Giant Crusher".to_string(),
                attack: 6,
                health: 8,
                max_health: 8,
            },
            CombatUnit {
                name: "Ogre Mauler".to_string(),
                attack: 5,
                health: 7,
                max_health: 7,
            },
            CombatUnit {
                name: "Ogre Warrior".to_string(),
                attack: 4,
                health: 6,
                max_health: 6,
            },
            CombatUnit {
                name: "Troll Brute".to_string(),
                attack: 4,
                health: 5,
                max_health: 5,
            },
        ],
        _ => vec![
            // Default to round 10 for any round beyond
            CombatUnit {
                name: "Dragon Tyrant".to_string(),
                attack: 8,
                health: 12,
                max_health: 12,
            },
            CombatUnit {
                name: "Giant Crusher".to_string(),
                attack: 6,
                health: 8,
                max_health: 8,
            },
        ],
    }
}
