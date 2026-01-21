use crate::types::*;
use serde::{Deserialize, Serialize};

/// Which side a unit belongs to
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Player,
    Enemy,
}

/// Target reference for combat events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatTarget {
    pub side: Side,
    pub index: usize,
    pub name: String,
}

/// Events generated during combat for UI playback
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CombatEvent {
    BattleStart {
        player_units: Vec<String>,
        enemy_units: Vec<String>,
    },
    UnitsClash {
        player: CombatTarget,
        enemy: CombatTarget,
    },
    DamageDealt {
        target: CombatTarget,
        amount: i32,
        new_health: i32,
    },
    UnitDied {
        target: CombatTarget,
    },
    UnitsSlide {
        side: Side,
    },
    BattleEnd {
        result: String,
    },
}

/// The result of a battle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BattleResult {
    Victory { remaining: usize },
    Defeat { remaining: usize },
    Draw,
}

/// A combat unit (simplified for battle simulation)
#[derive(Debug, Clone)]
pub struct CombatUnit {
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub max_health: i32,
}

impl CombatUnit {
    pub fn from_board_unit(unit: &BoardUnit) -> Self {
        Self {
            name: unit.card.name.clone(),
            attack: unit.card.stats.attack,
            health: unit.current_health,
            max_health: unit.card.stats.health,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.health > 0
    }

    pub fn take_damage(&mut self, amount: i32) {
        self.health -= amount;
    }
}

/// The battle simulator
pub struct BattleSimulator {
    player_units: Vec<CombatUnit>,
    enemy_units: Vec<CombatUnit>,
    events: Vec<CombatEvent>,
}

impl BattleSimulator {
    pub fn new(player_units: Vec<CombatUnit>, enemy_units: Vec<CombatUnit>) -> Self {
        Self {
            player_units,
            enemy_units,
            events: Vec::new(),
        }
    }

    /// Run the full battle simulation
    pub fn simulate(mut self) -> (BattleResult, Vec<CombatEvent>) {
        // Record battle start
        self.events.push(CombatEvent::BattleStart {
            player_units: self.player_units.iter().map(|u| u.name.clone()).collect(),
            enemy_units: self.enemy_units.iter().map(|u| u.name.clone()).collect(),
        });

        // Main combat loop
        while !self.player_units.is_empty() && !self.enemy_units.is_empty() {
            self.resolve_clash();
            self.remove_dead_units();
        }

        // Determine result
        let result = match (self.player_units.is_empty(), self.enemy_units.is_empty()) {
            (false, true) => BattleResult::Victory {
                remaining: self.player_units.len(),
            },
            (true, false) => BattleResult::Defeat {
                remaining: self.enemy_units.len(),
            },
            (true, true) => BattleResult::Draw,
            (false, false) => unreachable!("Battle should have ended"),
        };

        self.events.push(CombatEvent::BattleEnd {
            result: match &result {
                BattleResult::Victory { .. } => "victory".to_string(),
                BattleResult::Defeat { .. } => "defeat".to_string(),
                BattleResult::Draw => "draw".to_string(),
            },
        });

        (result, self.events)
    }

    /// Resolve a single clash between front units
    fn resolve_clash(&mut self) {
        if self.player_units.is_empty() || self.enemy_units.is_empty() {
            return;
        }

        let player_front = &self.player_units[0];
        let enemy_front = &self.enemy_units[0];

        // Record the clash
        self.events.push(CombatEvent::UnitsClash {
            player: CombatTarget {
                side: Side::Player,
                index: 0,
                name: player_front.name.clone(),
            },
            enemy: CombatTarget {
                side: Side::Enemy,
                index: 0,
                name: enemy_front.name.clone(),
            },
        });

        // Calculate damage (simultaneous)
        let player_damage = player_front.attack;
        let enemy_damage = enemy_front.attack;

        // Apply damage to enemy
        self.enemy_units[0].take_damage(player_damage);
        self.events.push(CombatEvent::DamageDealt {
            target: CombatTarget {
                side: Side::Enemy,
                index: 0,
                name: self.enemy_units[0].name.clone(),
            },
            amount: player_damage,
            new_health: self.enemy_units[0].health,
        });

        // Apply damage to player
        self.player_units[0].take_damage(enemy_damage);
        self.events.push(CombatEvent::DamageDealt {
            target: CombatTarget {
                side: Side::Player,
                index: 0,
                name: self.player_units[0].name.clone(),
            },
            amount: enemy_damage,
            new_health: self.player_units[0].health,
        });
    }

    /// Remove dead units and slide remaining units forward
    fn remove_dead_units(&mut self) {
        // Check player deaths
        let player_had_deaths = self.player_units.first().map_or(false, |u| !u.is_alive());
        if player_had_deaths {
            let dead_name = self.player_units[0].name.clone();
            self.events.push(CombatEvent::UnitDied {
                target: CombatTarget {
                    side: Side::Player,
                    index: 0,
                    name: dead_name,
                },
            });
            self.player_units.remove(0);
            if !self.player_units.is_empty() {
                self.events.push(CombatEvent::UnitsSlide { side: Side::Player });
            }
        }

        // Check enemy deaths
        let enemy_had_deaths = self.enemy_units.first().map_or(false, |u| !u.is_alive());
        if enemy_had_deaths {
            let dead_name = self.enemy_units[0].name.clone();
            self.events.push(CombatEvent::UnitDied {
                target: CombatTarget {
                    side: Side::Enemy,
                    index: 0,
                    name: dead_name,
                },
            });
            self.enemy_units.remove(0);
            if !self.enemy_units.is_empty() {
                self.events.push(CombatEvent::UnitsSlide { side: Side::Enemy });
            }
        }
    }
}
