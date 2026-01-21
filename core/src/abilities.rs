use crate::types::*;
use crate::battle::{Side, CombatTarget, CombatUnit, CombatEvent};

/// Context for ability execution
#[derive(Debug, Clone)]
pub struct AbilityContext {
    pub trigger_unit: usize,
    pub trigger_side: Side,
    pub player_units: Vec<CombatUnit>,
    pub enemy_units: Vec<CombatUnit>,
    pub events: Vec<CombatEvent>,
}

impl AbilityContext {
    pub fn new(
        trigger_unit: usize,
        trigger_side: Side,
        player_units: Vec<CombatUnit>,
        enemy_units: Vec<CombatUnit>,
        events: Vec<CombatEvent>,
    ) -> Self {
        Self {
            trigger_unit,
            trigger_side,
            player_units,
            enemy_units,
            events,
        }
    }

    pub fn get_units(&self, side: Side) -> &Vec<CombatUnit> {
        match side {
            Side::Player => &self.player_units,
            Side::Enemy => &self.enemy_units,
        }
    }

    pub fn get_units_mut(&mut self, side: Side) -> &mut Vec<CombatUnit> {
        match side {
            Side::Player => &mut self.player_units,
            Side::Enemy => &mut self.enemy_units,
        }
    }
}

/// Execute an ability effect
pub fn execute_ability_effect(
    ability: &Ability,
    context: &mut AbilityContext,
) -> Vec<CombatEvent> {
    let mut new_events = Vec::new();

    match &ability.effect {
        AbilityEffect::Damage { amount, target } => {
            let targets = resolve_targets(target, context.trigger_unit, context.trigger_side, &context);
            for target_unit in targets {
                if let Some(unit) = context.get_units_mut(target_unit.side).get_mut(target_unit.index) {
                    unit.take_damage(*amount);
                    new_events.push(CombatEvent::AbilityEffect {
                        ability_name: ability.name.clone(),
                        target: target_unit,
                        effect: format!("Dealt {} damage", amount),
                        new_health: unit.health,
                    });
                }
            }
        }
        AbilityEffect::Heal { amount, target } => {
            let targets = resolve_targets(target, context.trigger_unit, context.trigger_side, &context);
            for target_unit in targets {
                if let Some(unit) = context.get_units_mut(target_unit.side).get_mut(target_unit.index) {
                    let old_health = unit.health;
                    unit.health = (unit.health + amount).min(unit.max_health);
                    let actual_heal = unit.health - old_health;
                    if actual_heal > 0 {
                        new_events.push(CombatEvent::AbilityEffect {
                            ability_name: ability.name.clone(),
                            target: target_unit,
                            effect: format!("Healed {} health", actual_heal),
                            new_health: unit.health,
                        });
                    }
                }
            }
        }
        AbilityEffect::AttackBuff { amount, target, duration: _ } => {
            let targets = resolve_targets(target, context.trigger_unit, context.trigger_side, &context);
            for target_unit in targets {
                if let Some(unit) = context.get_units_mut(target_unit.side).get_mut(target_unit.index) {
                    unit.attack += amount;
                    new_events.push(CombatEvent::AbilityEffect {
                        ability_name: ability.name.clone(),
                        target: target_unit,
                        effect: format!("Attack {} {}", if *amount > 0 { "+" } else { "" }, amount),
                        new_health: unit.health,
                    });
                }
            }
        }
        AbilityEffect::HealthBuff { amount, target, duration: _ } => {
            let targets = resolve_targets(target, context.trigger_unit, context.trigger_side, &context);
            for target_unit in targets {
                if let Some(unit) = context.get_units_mut(target_unit.side).get_mut(target_unit.index) {
                    unit.max_health += amount;
                    unit.health += amount; // Also heal for the buff amount
                    new_events.push(CombatEvent::AbilityEffect {
                        ability_name: ability.name.clone(),
                        target: target_unit,
                        effect: format!("Max health {} {}", if *amount > 0 { "+" } else { "" }, amount),
                        new_health: unit.health,
                    });
                }
            }
        }
    }

    new_events
}

/// Resolve ability targets to specific unit positions
fn resolve_targets(
    target: &AbilityTarget,
    trigger_unit: usize,
    trigger_side: Side,
    context: &AbilityContext,
) -> Vec<CombatTarget> {
    match target {
        AbilityTarget::SelfUnit => {
            if let Some(unit) = context.get_units(trigger_side).get(trigger_unit) {
                vec![CombatTarget {
                    side: trigger_side,
                    index: trigger_unit,
                    name: unit.name.clone(),
                }]
            } else {
                vec![]
            }
        }
        AbilityTarget::AllAllies => {
            context.get_units(trigger_side).iter().enumerate()
                .map(|(index, unit)| CombatTarget {
                    side: trigger_side,
                    index,
                    name: unit.name.clone(),
                })
                .collect()
        }
        AbilityTarget::AllEnemies => {
            let enemy_side = match trigger_side {
                Side::Player => Side::Enemy,
                Side::Enemy => Side::Player,
            };
            context.get_units(enemy_side).iter().enumerate()
                .map(|(index, unit)| CombatTarget {
                    side: enemy_side,
                    index,
                    name: unit.name.clone(),
                })
                .collect()
        }
        AbilityTarget::FrontAlly => {
            if let Some(unit) = context.get_units(trigger_side).first() {
                vec![CombatTarget {
                    side: trigger_side,
                    index: 0,
                    name: unit.name.clone(),
                }]
            } else {
                vec![]
            }
        }
        AbilityTarget::FrontEnemy => {
            let enemy_side = match trigger_side {
                Side::Player => Side::Enemy,
                Side::Enemy => Side::Player,
            };
            if let Some(unit) = context.get_units(enemy_side).first() {
                vec![CombatTarget {
                    side: enemy_side,
                    index: 0,
                    name: unit.name.clone(),
                }]
            } else {
                vec![]
            }
        }
        // Simplified implementations for now
        AbilityTarget::RandomAlly => {
            // Just target first ally for now
            if let Some(unit) = context.get_units(trigger_side).first() {
                vec![CombatTarget {
                    side: trigger_side,
                    index: 0,
                    name: unit.name.clone(),
                }]
            } else {
                vec![]
            }
        }
        AbilityTarget::RandomEnemy => {
            // Just target first enemy for now
            let enemy_side = match trigger_side {
                Side::Player => Side::Enemy,
                Side::Enemy => Side::Player,
            };
            if let Some(unit) = context.get_units(enemy_side).first() {
                vec![CombatTarget {
                    side: enemy_side,
                    index: 0,
                    name: unit.name.clone(),
                }]
            } else {
                vec![]
            }
        }
    }
}

/// Collect and sort units with abilities for a given trigger
pub fn collect_trigger_units(
    trigger: &AbilityTrigger,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
) -> Vec<(Side, usize, Ability)> {
    let mut trigger_units = Vec::new();

    // Collect player units with this trigger
    for (index, unit) in player_units.iter().enumerate() {
        if let Some(ability) = &unit.ability {
            if &ability.trigger == trigger {
                trigger_units.push((Side::Player, index, ability.clone()));
            }
        }
    }

    // Collect enemy units with this trigger
    for (index, unit) in enemy_units.iter().enumerate() {
        if let Some(ability) = &unit.ability {
            if &ability.trigger == trigger {
                trigger_units.push((Side::Enemy, index, ability.clone()));
            }
        }
    }

    // Sort by attack (descending), then by index for deterministic ordering
    trigger_units.sort_by(|a, b| {
        let a_attack = match a.0 {
            Side::Player => player_units[a.1].attack,
            Side::Enemy => enemy_units[a.1].attack,
        };
        let b_attack = match b.0 {
            Side::Player => player_units[b.1].attack,
            Side::Enemy => enemy_units[b.1].attack,
        };
        b_attack.cmp(&a_attack).then(a.1.cmp(&b.1))
    });

    trigger_units
}