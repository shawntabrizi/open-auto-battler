//! Unit templates and card definitions
//!
//! This module contains all unit card templates used in the game.

use crate::rng::BattleRng;
use crate::state::CardSet;
use crate::types::{
    Ability, AbilityEffect, AbilityTarget, AbilityTrigger, CompareOp, Condition, EconomyStats,
    Matcher, SortOrder, StatType, TargetScope, UnitCard, UnitStats,
};
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

/// Card template for creating starter deck cards
pub struct CardTemplate {
    pub template_id: &'static str,
    pub name: &'static str,
    pub attack: i32,
    pub health: i32,
    pub play_cost: i32,
    pub pitch_value: i32,
    pub abilities: Vec<Ability>,
    pub rarity: u32,
}

/// The comprehensive "First Pack" of units
pub fn get_starter_templates() -> Vec<CardTemplate> {
    vec![
        // ==========================================
        // TIER 1 (COST 1-2): Early Game / Tokens
        // ==========================================
        CardTemplate {
            template_id: "rat_swarm",
            name: "Rat Swarm",
            attack: 1,
            health: 1,
            play_cost: 1,
            pitch_value: 1,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::SpawnUnit {
                    template_id: String::from("rat_token"),
                },
                name: String::from("Infestation"),
                description: String::from("Spawn a Rat Token when killed"),
                conditions: vec![],
                max_triggers: Some(1),
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "goblin_scout",
            name: "Goblin Scout",
            attack: 1,
            health: 2,
            play_cost: 1,
            pitch_value: 2,
            abilities: vec![],
            rarity: 10,
        },
        CardTemplate {
            template_id: "goblin_grunt",
            name: "Goblin Grunt",
            attack: 2,
            health: 2,
            play_cost: 2,
            pitch_value: 1,
            abilities: vec![],
            rarity: 10,
        },
        CardTemplate {
            template_id: "scaredy_cat",
            name: "Scaredy Cat",
            attack: 1,
            health: 3,
            play_cost: 1,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 0,
                    target: AbilityTarget::Position {
                        scope: TargetScope::SelfUnit,
                        index: 1,
                    },
                },
                name: String::from("Hiss"),
                description: String::from("Give the ally behind +2 Health at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "brave_commander",
            name: "Brave Commander",
            attack: 2,
            health: 3,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 2,
                    target: AbilityTarget::Random {
                        scope: TargetScope::AlliesOther,
                        count: 1,
                    },
                },
                name: String::from("Command"),
                description: String::from("Give a random other ally +2/+2 at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "militia",
            name: "Militia",
            attack: 2,
            health: 2,
            play_cost: 2,
            pitch_value: 2,
            abilities: vec![],
            rarity: 10,
        },
        CardTemplate {
            template_id: "shield_bearer",
            name: "Shield Bearer",
            attack: 1,
            health: 4,
            play_cost: 2,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 0,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Allies,
                        index: 0,
                    },
                },
                name: String::from("Shield Wall"),
                description: String::from("Heal front ally for 2 at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "nurse_goblin",
            name: "Nurse Goblin",
            attack: 1,
            health: 3,
            play_cost: 2,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::BeforeAnyAttack,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 0,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Allies,
                        index: 0,
                    },
                },
                name: String::from("Emergency Heal"),
                description: String::from("Heal front ally for 2 if its health is <= 6"),
                conditions: vec![Condition::Is(Matcher::StatValueCompare {
                    scope: TargetScope::Allies, // Will check target front unit via get_targets
                    stat: StatType::Health,
                    op: CompareOp::LessThanOrEqual,
                    value: 6,
                })],
                max_triggers: None,
            }],
            rarity: 10,
        },
        // ==========================================
        // TIER 2 (COST 3-4): Mid Game Synergies
        // ==========================================
        CardTemplate {
            template_id: "wolf_rider",
            name: "Wolf Rider",
            attack: 3,
            health: 2,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::Damage {
                    amount: 2,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Enemies,
                        index: 0,
                    },
                },
                name: String::from("Dying Bite"),
                description: String::from("Deal 2 damage to front enemy on death"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "martyr_knight",
            name: "Martyr Knight",
            attack: 2,
            health: 3,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 2,
                    target: AbilityTarget::Position {
                        scope: TargetScope::SelfUnit,
                        index: 1,
                    },
                },
                name: String::from("Last Stand"),
                description: String::from("Give the ally behind +2/+2 on death"),
                conditions: vec![],
                max_triggers: Some(1),
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "abyssal_bomber",
            name: "Abyssal Bomber",
            attack: 2,
            health: 2,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::Damage {
                    amount: 3,
                    target: AbilityTarget::All {
                        scope: TargetScope::All,
                    },
                },
                name: String::from("Abyssal Blast"),
                description: String::from("Deal 3 damage to ALL units on death"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "archer",
            name: "Archer",
            attack: 1,
            health: 3,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 1,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Enemies,
                        index: -1,
                    },
                },
                name: String::from("Long Shot"),
                description: String::from("Deal 1 damage to the back enemy at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "sniper",
            name: "Sniper",
            attack: 2,
            health: 2,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 2,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Enemies,
                        index: -1,
                    },
                },
                name: String::from("Assassinate"),
                description: String::from("Deal 2 damage to the back enemy at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "skeleton_archer",
            name: "Skeleton Archer",
            attack: 2,
            health: 2,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 2,
                    target: AbilityTarget::Random {
                        scope: TargetScope::Enemies,
                        count: 1,
                    },
                },
                name: String::from("Bone Arrow"),
                description: String::from("Deal 2 damage to a random enemy at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "battle_hardened",
            name: "Battle Hardened",
            attack: 2,
            health: 3,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![
                Ability {
                    trigger: AbilityTrigger::BeforeUnitAttack,
                    effect: AbilityEffect::ModifyStats {
                        health: 2,
                        attack: 0,
                        target: AbilityTarget::All {
                            scope: TargetScope::SelfUnit,
                        },
                    },
                    name: String::from("Brace"),
                    description: String::from("Gain +2 health before attacking"),
                    conditions: vec![],
                    max_triggers: None,
                },
                Ability {
                    trigger: AbilityTrigger::AfterUnitAttack,
                    effect: AbilityEffect::ModifyStats {
                        health: 0,
                        attack: 2,
                        target: AbilityTarget::All {
                            scope: TargetScope::SelfUnit,
                        },
                    },
                    name: String::from("Adrenaline"),
                    description: String::from("Gain +2 attack after attacking"),
                    conditions: vec![],
                    max_triggers: None,
                },
            ],
            rarity: 10,
        },
        CardTemplate {
            template_id: "lone_wolf",
            name: "Lone Wolf",
            attack: 2,
            health: 4,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::BeforeUnitAttack,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 5,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                name: String::from("Last Stand"),
                description: String::from("Gain +5 attack if you are the only ally"),
                conditions: vec![Condition::Is(Matcher::UnitCount {
                    scope: TargetScope::Allies,
                    op: CompareOp::Equal,
                    value: 1,
                })],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "pack_leader",
            name: "Pack Leader",
            attack: 2,
            health: 3,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 1,
                    attack: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::Allies,
                    },
                },
                name: String::from("Strength in Numbers"),
                description: String::from("Give all allies +1/+1 if you have 3+ allies"),
                conditions: vec![Condition::Is(Matcher::UnitCount {
                    scope: TargetScope::Allies,
                    op: CompareOp::GreaterThanOrEqual,
                    value: 3,
                })],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "spined_urchin",
            name: "Spined Urchin",
            attack: 1,
            health: 4,
            play_cost: 2,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnHurt,
                effect: AbilityEffect::Damage {
                    amount: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::TriggerSource,
                    },
                },
                name: String::from("Spines"),
                description: String::from("Deal 1 damage to the attacker when hurt"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "vampire",
            name: "Vampire",
            attack: 3,
            health: 3,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::AfterUnitAttack,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 0,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                name: String::from("Lifesteal"),
                description: String::from("Heal 2 health after attacking"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "raging_orc",
            name: "Raging Orc",
            attack: 2,
            health: 8,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnHurt,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 2,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                name: String::from("Berserk"),
                description: String::from("Gain +2 attack when hurt"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "zombie_captain",
            name: "Zombie Captain",
            attack: 3,
            health: 4,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::SpawnUnit {
                    template_id: String::from("zombie_soldier"),
                },
                name: String::from("Undead Call"),
                description: String::from("Spawn a Zombie Soldier on death"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "necromancer",
            name: "Necromancer",
            attack: 2,
            health: 3,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnAllySpawn,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 2,
                    target: AbilityTarget::All {
                        scope: TargetScope::TriggerSource,
                    },
                },
                name: String::from("Spawn Boost"),
                description: String::from("Give +2 attack to any spawned unit"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "headhunter",
            name: "Headhunter",
            attack: 4,
            health: 2,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 5,
                    target: AbilityTarget::Standard {
                        scope: TargetScope::Enemies,
                        stat: StatType::Health,
                        order: SortOrder::Ascending,
                        count: 1,
                    },
                },
                name: String::from("Assassinate"),
                description: String::from("Deal 5 damage to the enemy with the lowest health"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "giant_slayer",
            name: "Giant Slayer",
            attack: 2,
            health: 2,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 3,
                    target: AbilityTarget::Standard {
                        scope: TargetScope::Enemies,
                        stat: StatType::Attack,
                        order: SortOrder::Descending,
                        count: 1,
                    },
                },
                name: String::from("Weak Point"),
                description: String::from("Deal 3 damage to the enemy with the highest attack"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "shield_squire",
            name: "Shield Squire",
            attack: 2,
            health: 3,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::BeforeAnyAttack,
                effect: AbilityEffect::ModifyStats {
                    health: 2,
                    attack: 0,
                    target: AbilityTarget::Position {
                        scope: TargetScope::SelfUnit,
                        index: -1,
                    },
                },
                name: String::from("Squire's Aegis"),
                description: String::from("Give unit in front +2 health before every clash"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "warder",
            name: "Warder",
            attack: 2,
            health: 4,
            play_cost: 3,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnEnemySpawn,
                effect: AbilityEffect::Damage {
                    amount: 1,
                    target: AbilityTarget::All {
                        scope: TargetScope::TriggerSource,
                    },
                },
                name: String::from("Seal Fate"),
                description: String::from("Deal 1 damage to any enemy that spawns"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        // ==========================================
        // TIER 3 (COST 5-7): High Impact
        // ==========================================
        CardTemplate {
            template_id: "artillery_mage",
            name: "Artillery Mage",
            attack: 3,
            health: 3,
            play_cost: 5,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 5,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Enemies,
                        index: 2,
                    },
                },
                name: String::from("Artillery Strike"),
                description: String::from("Deal 5 damage to enemy in 3rd slot (pos 2) at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "rear_guard",
            name: "Rear Guard",
            attack: 2,
            health: 5,
            play_cost: 4,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 3,
                    attack: 3,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Allies,
                        index: 4,
                    },
                },
                name: String::from("Supply Line"),
                description: String::from("Give unit in 5th slot (pos 4) +3/+3 at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "troll_brute",
            name: "Troll Brute",
            attack: 4,
            health: 5,
            play_cost: 5,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::Damage {
                    amount: 3,
                    target: AbilityTarget::All {
                        scope: TargetScope::Enemies,
                    },
                },
                name: String::from("Death Nova"),
                description: String::from("Deal 3 damage to all enemies on death"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "lich",
            name: "Lich",
            attack: 3,
            health: 3,
            play_cost: 5,
            pitch_value: 2,
            abilities: vec![
                Ability {
                    trigger: AbilityTrigger::OnStart,
                    effect: AbilityEffect::Destroy {
                        target: AbilityTarget::Position {
                            scope: TargetScope::SelfUnit,
                            index: -1,
                        },
                    },
                    name: String::from("Ritual"),
                    description: String::from("Sacrifice the ally in front..."),
                    conditions: vec![],
                    max_triggers: None,
                },
                Ability {
                    trigger: AbilityTrigger::OnStart,
                    effect: AbilityEffect::SpawnUnit {
                        template_id: String::from("golem"),
                    },
                    name: String::from("...Raise Golem"),
                    description: String::from("...to spawn a 5/5 Golem"),
                    conditions: vec![],
                    max_triggers: None,
                },
            ],
            rarity: 10,
        },
        CardTemplate {
            template_id: "assassin",
            name: "Assassin",
            attack: 5,
            health: 1,
            play_cost: 5,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Destroy {
                    target: AbilityTarget::Position {
                        scope: TargetScope::Enemies,
                        index: 0,
                    },
                },
                name: String::from("Execute"),
                description: String::from("Destroy front enemy if its health is <= 10"),
                conditions: vec![Condition::Is(Matcher::StatValueCompare {
                    scope: TargetScope::Enemies,
                    stat: StatType::Health,
                    op: CompareOp::LessThanOrEqual,
                    value: 10,
                })],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "fire_elemental",
            name: "Fire Elemental",
            attack: 4,
            health: 4,
            play_cost: 5,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::AfterUnitAttack,
                effect: AbilityEffect::Damage {
                    amount: 2,
                    target: AbilityTarget::Random {
                        scope: TargetScope::Enemies,
                        count: 1,
                    },
                },
                name: String::from("Spark"),
                description: String::from("Deal 2 damage to a random enemy after attacking"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "ogre_mauler",
            name: "Ogre Mauler",
            attack: 5,
            health: 6,
            play_cost: 6,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::ModifyStats {
                    health: 0,
                    attack: 3,
                    target: AbilityTarget::All {
                        scope: TargetScope::SelfUnit,
                    },
                },
                name: String::from("Crushing Blow"),
                description: String::from("Gain +3 attack at battle start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "phoenix",
            name: "Phoenix",
            attack: 3,
            health: 3,
            play_cost: 6,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnFaint,
                effect: AbilityEffect::SpawnUnit {
                    template_id: String::from("phoenix_egg"),
                },
                name: String::from("Rebirth"),
                description: String::from("Spawn a Phoenix Egg on death"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "shield_master",
            name: "Shield Master",
            attack: 3,
            health: 10,
            play_cost: 7,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::BeforeAnyAttack,
                effect: AbilityEffect::ModifyStats {
                    health: 3,
                    attack: 0,
                    target: AbilityTarget::All {
                        scope: TargetScope::Allies,
                    },
                },
                name: String::from("Guardian's Aura"),
                description: String::from("Give ALL allies +3 health before every clash"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "void_walker",
            name: "Void Walker",
            attack: 4,
            health: 4,
            play_cost: 7,
            pitch_value: 2,
            abilities: vec![
                Ability {
                    trigger: AbilityTrigger::OnStart,
                    effect: AbilityEffect::ModifyStats {
                        health: 0,
                        attack: 2,
                        target: AbilityTarget::All {
                            scope: TargetScope::SelfUnit,
                        },
                    },
                    name: String::from("Leech"),
                    description: String::from("Steal 2 attack from the front enemy at start"),
                    conditions: vec![],
                    max_triggers: None,
                },
                Ability {
                    trigger: AbilityTrigger::OnStart,
                    effect: AbilityEffect::ModifyStats {
                        health: 0,
                        attack: -2,
                        target: AbilityTarget::Position {
                            scope: TargetScope::Enemies,
                            index: 0,
                        },
                    },
                    name: String::from("Void Touch"),
                    description: String::from(" (Steal Effect Continued)"),
                    conditions: vec![],
                    max_triggers: None,
                },
            ],
            rarity: 10,
        },
        // ==========================================
        // TIER 4 (COST 8-10): Legendary
        // ==========================================
        CardTemplate {
            template_id: "mana_reaper",
            name: "Mana Reaper",
            attack: 2,
            health: 2,
            play_cost: 8,
            pitch_value: 2,
            abilities: vec![
                Ability {
                    trigger: AbilityTrigger::OnStart,
                    effect: AbilityEffect::Destroy {
                        target: AbilityTarget::Standard {
                            scope: TargetScope::Enemies,
                            stat: StatType::Mana,
                            order: SortOrder::Descending,
                            count: 1,
                        },
                    },
                    name: String::from("Harvest the Rich"),
                    description: String::from("Destroy the highest mana cost enemy"),
                    conditions: vec![],
                    max_triggers: None,
                },
                Ability {
                    trigger: AbilityTrigger::OnStart,
                    effect: AbilityEffect::Destroy {
                        target: AbilityTarget::Standard {
                            scope: TargetScope::Enemies,
                            stat: StatType::Mana,
                            order: SortOrder::Ascending,
                            count: 1,
                        },
                    },
                    name: String::from("Cull the Weak"),
                    description: String::from("Destroy the lowest mana cost enemy"),
                    conditions: vec![],
                    max_triggers: None,
                },
            ],
            rarity: 10,
        },
        CardTemplate {
            template_id: "giant_crusher",
            name: "Giant Crusher",
            attack: 6,
            health: 8,
            play_cost: 8,
            pitch_value: 2,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 4,
                    target: AbilityTarget::Position {
                        scope: TargetScope::Enemies,
                        index: 0,
                    },
                },
                name: String::from("Earthshaker"),
                description: String::from("Deal 4 damage to front enemy at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        CardTemplate {
            template_id: "behemoth",
            name: "Behemoth",
            attack: 10,
            health: 10,
            play_cost: 10,
            pitch_value: 2,
            abilities: vec![],
            rarity: 10,
        },
        CardTemplate {
            template_id: "dragon_tyrant",
            name: "Dragon Tyrant",
            attack: 8,
            health: 12,
            play_cost: 10,
            pitch_value: 3,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::Damage {
                    amount: 3,
                    target: AbilityTarget::All {
                        scope: TargetScope::Enemies,
                    },
                },
                name: String::from("Dragon Breath"),
                description: String::from("Deal 3 damage to all enemies at start"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 10,
        },
        // ==========================================
        // TOKENS (Non-deck cards)
        // ==========================================
        CardTemplate {
            template_id: "rat_token",
            name: "Rat Token",
            attack: 1,
            health: 1,
            play_cost: 0,
            pitch_value: 0,
            abilities: vec![],
            rarity: 0,
        },
        CardTemplate {
            template_id: "zombie_soldier",
            name: "Zombie Soldier",
            attack: 1,
            health: 1,
            play_cost: 1,
            pitch_value: 1,
            abilities: vec![],
            rarity: 0,
        },
        CardTemplate {
            template_id: "zombie_spawn",
            name: "Zombie Spawn",
            attack: 1,
            health: 1,
            play_cost: 0,
            pitch_value: 0,
            abilities: vec![],
            rarity: 0,
        },
        CardTemplate {
            template_id: "golem",
            name: "Golem",
            attack: 5,
            health: 5,
            play_cost: 0,
            pitch_value: 0,
            abilities: vec![],
            rarity: 0,
        },
        CardTemplate {
            template_id: "phoenix_egg",
            name: "Phoenix Egg",
            attack: 0,
            health: 5,
            play_cost: 0,
            pitch_value: 0,
            abilities: vec![Ability {
                trigger: AbilityTrigger::OnStart,
                effect: AbilityEffect::SpawnUnit {
                    template_id: String::from("phoenix"),
                },
                name: String::from("Hatch"),
                description: String::from("Respawn the Phoenix at start of battle"),
                conditions: vec![],
                max_triggers: None,
            }],
            rarity: 0,
        },
    ]
}

/// Get all card templates with unique, stable CardIds
/// Returns a tuple of (UnitCard, rarity)
pub fn get_all_templates() -> Vec<(UnitCard, u32)> {
    let mut cards = Vec::new();
    let templates = get_starter_templates();

    for (i, t) in templates.into_iter().enumerate() {
        let card = UnitCard {
            id: crate::types::CardId((i as u32) + 1),
            template_id: String::from(t.template_id),
            name: String::from(t.name),
            stats: UnitStats {
                attack: t.attack,
                health: t.health,
            },
            economy: EconomyStats {
                play_cost: t.play_cost,
                pitch_value: t.pitch_value,
            },
            abilities: t.abilities,
        };
        cards.push((card, t.rarity));
    }
    cards
}

/// Get the list of Template CardIds that belong to a specific set
pub fn get_set_template_ids(set_id: u32) -> Vec<crate::types::CardId> {
    match set_id {
        0 => {
            // Set 0 includes all non-token cards from the starter templates
            get_all_templates()
                .into_iter()
                .filter(|(_, rarity)| *rarity > 0)
                .map(|(c, _)| c.id)
                .collect()
        }
        _ => Vec::new(),
    }
}

/// Get a complete CardSet for a given set_id (contains definitions for all cards in the set)
pub fn get_card_set(set_id: u32) -> Option<CardSet> {
    match set_id {
        0 => {
            // Set 0 includes all cards from the starter templates
            // Rarity is now explicitly defined in the template
            let cards = get_all_templates()
                .into_iter()
                .map(|(c, rarity)| {
                    crate::state::CardSetEntry {
                        card_id: c.id,
                        rarity,
                    }
                })
                .collect();

            Some(CardSet { cards })
        }
        _ => None,
    }
}

/// Create a bag of 100 random CardIds from a specific set
pub fn create_genesis_bag(set: &CardSet, seed: u64) -> Vec<crate::types::CardId> {
    if set.cards.is_empty() {
        return Vec::new();
    }

    let mut bag = Vec::with_capacity(100);
    let mut rng = crate::rng::XorShiftRng::seed_from_u64(seed);

    // Calculate total weight for weighted selection
    let total_weight: u32 = set.cards.iter().map(|entry| entry.rarity).sum();
    if total_weight == 0 {
        return Vec::new();
    }

    for _ in 0..100 {
        let mut target = rng.gen_range(total_weight as usize) as u32;
        for entry in &set.cards {
            if entry.rarity == 0 {
                continue;
            }
            if target < entry.rarity {
                bag.push(entry.card_id);
                break;
            }
            target -= entry.rarity;
        }
    }

    bag
}