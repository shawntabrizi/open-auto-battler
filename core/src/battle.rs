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
        #[serde(rename = "playerUnits")]
        player_units: Vec<String>,
        #[serde(rename = "enemyUnits")]
        enemy_units: Vec<String>,
    },
    UnitsClash {
        player: CombatTarget,
        enemy: CombatTarget,
    },
    DamageDealt {
        target: CombatTarget,
        amount: i32,
        #[serde(rename = "newHealth")]
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
    pub fn simulate(mut self) -> (BattleResult, Vec<CombatEvent>, Vec<CombatUnit>) {
        // Record battle start
        self.events.push(CombatEvent::BattleStart {
            player_units: self.player_units.iter().map(|u| u.name.clone()).collect(),
            enemy_units: self.enemy_units.iter().map(|u| u.name.clone()).collect(),
        });

        // Main combat loop - continue until all units on one side are dead
        loop {
            self.resolve_clash();
            self.check_dead_units();

            // Check if battle should end (all units on one side are dead)
            let player_alive = self.player_units.iter().any(|u| u.is_alive());
            let enemy_alive = self.enemy_units.iter().any(|u| u.is_alive());

            if !player_alive || !enemy_alive {
                break;
            }
        }

        // Determine result
        let player_alive_count = self.player_units.iter().filter(|u| u.is_alive()).count();
        let enemy_alive_count = self.enemy_units.iter().filter(|u| u.is_alive()).count();

        let result = match (player_alive_count > 0, enemy_alive_count > 0) {
            (true, false) => BattleResult::Victory {
                remaining: player_alive_count,
            },
            (false, true) => BattleResult::Defeat {
                remaining: enemy_alive_count,
            },
            (true, true) => BattleResult::Draw, // Both sides have living units, but battle ended? This shouldn't happen
            (false, false) => BattleResult::Draw,
        };

        self.events.push(CombatEvent::BattleEnd {
            result: match &result {
                BattleResult::Victory { .. } => "victory".to_string(),
                BattleResult::Defeat { .. } => "defeat".to_string(),
                BattleResult::Draw => "draw".to_string(),
            },
        });

        (result, self.events, self.player_units)
    }

    /// Resolve a single clash between front units
    fn resolve_clash(&mut self) {
        // Get front units safely - return early if either side is empty
        let (player_name, player_damage) = match self.player_units.first() {
            Some(unit) => (unit.name.clone(), unit.attack),
            None => return,
        };
        let (enemy_name, enemy_damage) = match self.enemy_units.first() {
            Some(unit) => (unit.name.clone(), unit.attack),
            None => return,
        };

        // Record the clash
        self.events.push(CombatEvent::UnitsClash {
            player: CombatTarget {
                side: Side::Player,
                index: 0,
                name: player_name.clone(),
            },
            enemy: CombatTarget {
                side: Side::Enemy,
                index: 0,
                name: enemy_name.clone(),
            },
        });

        // Apply damage to enemy (safely)
        if let Some(enemy_front) = self.enemy_units.first_mut() {
            enemy_front.take_damage(player_damage);
            self.events.push(CombatEvent::DamageDealt {
                target: CombatTarget {
                    side: Side::Enemy,
                    index: 0,
                    name: enemy_name,
                },
                amount: player_damage,
                new_health: enemy_front.health,
            });
        }

        // Apply damage to player (safely)
        if let Some(player_front) = self.player_units.first_mut() {
            player_front.take_damage(enemy_damage);
            self.events.push(CombatEvent::DamageDealt {
                target: CombatTarget {
                    side: Side::Player,
                    index: 0,
                    name: player_name,
                },
                amount: enemy_damage,
                new_health: player_front.health,
            });
        }
    }

    /// Check for dead units but don't remove them - keep them on board with 0 health
    fn check_dead_units(&mut self) {

        // Check player deaths (don't remove, just record the event)
        if let Some(front) = self.player_units.first() {
            if !front.is_alive() {
                let dead_name = front.name.clone();
                self.events.push(CombatEvent::UnitDied {
                    target: CombatTarget {
                        side: Side::Player,
                        index: 0,
                        name: dead_name,
                    },
                });
                // Don't remove the unit - keep it on board with 0 health
                // Don't slide units either since we're keeping dead units
            }
        }

        // Check enemy deaths (don't remove, just record the event)
        if let Some(front) = self.enemy_units.first() {
            if !front.is_alive() {
                let dead_name = front.name.clone();
                self.events.push(CombatEvent::UnitDied {
                    target: CombatTarget {
                        side: Side::Enemy,
                        index: 0,
                        name: dead_name,
                    },
                });
                // Don't remove the unit
            }
        }
    }
}
