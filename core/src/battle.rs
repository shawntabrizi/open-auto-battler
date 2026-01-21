use crate::types::*;
use crate::abilities::*;
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
        player_units: Vec<CombatUnitInfo>,
        #[serde(rename = "enemyUnits")]
        enemy_units: Vec<CombatUnitInfo>,
    },
    AbilityTrigger {
        unit: CombatTarget,
        ability_name: String,
    },
    AbilityEffect {
        ability_name: String,
        target: CombatTarget,
        effect: String,
        #[serde(rename = "newHealth")]
        new_health: i32,
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
    pub template_id: String,
    pub attack: i32,
    pub health: i32,
    pub max_health: i32,
    pub ability: Option<crate::types::Ability>,
}

impl CombatUnit {
    pub fn from_board_unit(unit: &BoardUnit) -> Self {
        Self {
            name: unit.card.name.clone(),
            template_id: unit.card.template_id.clone(),
            attack: unit.card.stats.attack,
            health: unit.current_health,
            max_health: unit.card.stats.health,
            ability: unit.card.ability.clone(),
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
            player_units: self.player_units.iter().map(|u| CombatUnitInfo {
                name: u.name.clone(),
                template_id: u.template_id.clone(),
                attack: u.attack,
                health: u.health,
                max_health: u.max_health,
                ability: u.ability.clone(),
            }).collect(),
            enemy_units: self.enemy_units.iter().map(|u| CombatUnitInfo {
                name: u.name.clone(),
                template_id: u.template_id.clone(),
                attack: u.attack,
                health: u.health,
                max_health: u.max_health,
                ability: u.ability.clone(),
            }).collect(),
        });

        // Phase 1: Execute On Start triggers
        self.execute_triggers(&AbilityTrigger::OnStart);

        // Main combat loop - continue until one side has no units left
        while !self.player_units.is_empty() && !self.enemy_units.is_empty() {
            self.resolve_clash();
            self.check_dead_units_with_triggers();
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
            // This case should never happen due to the while loop condition
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

    /// Execute abilities for a given trigger
    fn execute_triggers(&mut self, trigger: &AbilityTrigger) {
        let trigger_units = collect_trigger_units(trigger, &self.player_units, &self.enemy_units);

        for (side, index, ability) in trigger_units {
            // Record ability trigger
            let unit_name = match side {
                Side::Player => self.player_units[index].name.clone(),
                Side::Enemy => self.enemy_units[index].name.clone(),
            };
            self.events.push(CombatEvent::AbilityTrigger {
                unit: CombatTarget {
                    side,
                    index,
                    name: unit_name,
                },
                ability_name: ability.name.clone(),
            });

            // Execute the ability
            let mut context = AbilityContext::new(
                index,
                side,
                self.player_units.clone(),
                self.enemy_units.clone(),
                self.events.clone(),
            );

            let effect_events = execute_ability_effect(&ability, &mut context);

            // Update our units with the changes
            self.player_units = context.player_units;
            self.enemy_units = context.enemy_units;

            // Add the effect events
            self.events.extend(effect_events);
        }
    }

    /// Resolve clash between front units only (Super Auto Pets style)
    fn resolve_clash(&mut self) {
        // Only front units (index 0) fight each other
        let (player_name, player_damage) = match self.player_units.first() {
            Some(unit) => (unit.name.clone(), unit.attack),
            None => return, // No player units left
        };
        let (enemy_name, enemy_damage) = match self.enemy_units.first() {
            Some(unit) => (unit.name.clone(), unit.attack),
            None => return, // No enemy units left
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

    /// Check for dead units, execute On Faint triggers, and slide remaining units forward (Super Auto Pets style)
    fn check_dead_units_with_triggers(&mut self) {
        // Collect all dead units (only front units can die in this phase)
        let mut dead_units = Vec::new();

        if let Some(front) = self.player_units.first() {
            if !front.is_alive() {
                dead_units.push((Side::Player, 0, front.clone()));
            }
        }

        if let Some(front) = self.enemy_units.first() {
            if !front.is_alive() {
                dead_units.push((Side::Enemy, 0, front.clone()));
            }
        }

        // Sort dead units by attack (descending) for On Faint trigger execution
        dead_units.sort_by(|a, b| b.2.attack.cmp(&a.2.attack));

        // Execute On Faint triggers for dead units
        for (side, index, unit) in &dead_units {
            if let Some(ability) = &unit.ability {
                if ability.trigger == AbilityTrigger::OnFaint {
                    // Record ability trigger
                    self.events.push(CombatEvent::AbilityTrigger {
                        unit: CombatTarget {
                            side: *side,
                            index: *index,
                            name: unit.name.clone(),
                        },
                        ability_name: ability.name.clone(),
                    });

                    // Execute the ability
                    let mut context = AbilityContext::new(
                        *index,
                        *side,
                        self.player_units.clone(),
                        self.enemy_units.clone(),
                        self.events.clone(),
                    );

                    let effect_events = execute_ability_effect(ability, &mut context);

                    // Update our units with the changes
                    self.player_units = context.player_units;
                    self.enemy_units = context.enemy_units;

                    // Add the effect events
                    self.events.extend(effect_events);
                }
            }
        }

        // Remove dead units and record deaths
        for (side, index, unit) in dead_units {
            self.events.push(CombatEvent::UnitDied {
                target: CombatTarget {
                    side,
                    index,
                    name: unit.name,
                },
            });

            match side {
                Side::Player => {
                    self.player_units.remove(0);
                    if !self.player_units.is_empty() {
                        self.events.push(CombatEvent::UnitsSlide { side: Side::Player });
                    }
                }
                Side::Enemy => {
                    self.enemy_units.remove(0);
                    if !self.enemy_units.is_empty() {
                        self.events.push(CombatEvent::UnitsSlide { side: Side::Enemy });
                    }
                }
            }
        }
    }
}
