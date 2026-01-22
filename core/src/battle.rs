use crate::types::{Ability, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::Rng;
use rand::SeedableRng;
use serde::{Deserialize, Serialize};

// A unique ID for a unit instance in a battle
pub type UnitInstanceId = String;

/// Simplified view of a unit for battle replay.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnitView {
    pub instance_id: UnitInstanceId,
    pub template_id: String,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub max_health: i32,
    pub ability: Option<Ability>,
}

/// Events generated during combat for UI playback.
/// These events use "Smart Payloads" to make the UI layer as simple as possible.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum CombatEvent {
    #[serde(rename_all = "camelCase")]
    AbilityTrigger {
        source_instance_id: UnitInstanceId,
        ability_name: String,
    },
    #[serde(rename_all = "camelCase")]
    Clash {
        p_dmg: i32,
        e_dmg: i32,
    },
    #[serde(rename_all = "camelCase")]
    DamageTaken {
        target_instance_id: UnitInstanceId,
        team: String, // "PLAYER" or "ENEMY"
        remaining_hp: i32,
    },
    #[serde(rename_all = "camelCase")]
    UnitDeath {
        team: String, // "PLAYER" or "ENEMY"
        new_board_state: Vec<UnitView>,
    },
    #[serde(rename_all = "camelCase")]
    BattleEnd {
        result: String, // "VICTORY", "DEFEAT", "DRAW"
    },
    #[serde(rename_all = "camelCase")]
    AbilityDamage {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
        damage: i32,
        remaining_hp: i32,
    },
    #[serde(rename_all = "camelCase")]
    AbilityHeal {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
        heal: i32,
        new_hp: i32,
    },
    #[serde(rename_all = "camelCase")]
    AbilityBuff {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
        attack_buff: i32,
        health_buff: i32,
        new_attack: i32,
        new_health: i32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Team {
    Player,
    Enemy,
}

impl Team {
    fn to_string(&self) -> String {
        match self {
            Team::Player => "PLAYER".to_string(),
            Team::Enemy => "ENEMY".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
struct CombatUnit {
    instance_id: UnitInstanceId,
    team: Team,
    attack: i32,
    health: i32,
    max_health: i32,
    ability: Option<Ability>,
    template_id: String,
    name: String,
    attack_buff: i32,
    health_buff: i32,
}

impl CombatUnit {
    fn to_view(&self) -> UnitView {
        UnitView {
            instance_id: self.instance_id.clone(),
            template_id: self.template_id.clone(),
            name: self.name.clone(),
            attack: self.attack + self.attack_buff,
            health: self.health,
            max_health: self.max_health,
            ability: self.ability.clone(),
        }
    }

    fn effective_attack(&self) -> i32 {
        self.attack + self.attack_buff
    }
}

/// Apply an ability effect from a source unit to targets
fn apply_ability_effect(
    source_instance_id: &str,
    source_team: Team,
    effect: &AbilityEffect,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
) {
    match effect {
        AbilityEffect::Damage { amount, target } => {
            let targets = get_targets(source_instance_id, source_team, target, player_units, enemy_units, rng);
            for target_id in targets {
                // Find and damage the target
                if let Some(unit) = find_unit_mut(&target_id, player_units, enemy_units) {
                    unit.health -= amount;
                    events.push(CombatEvent::AbilityDamage {
                        source_instance_id: source_instance_id.to_string(),
                        target_instance_id: target_id,
                        damage: *amount,
                        remaining_hp: unit.health,
                    });
                }
            }
        }
        AbilityEffect::Heal { amount, target } => {
            let targets = get_targets(source_instance_id, source_team, target, player_units, enemy_units, rng);
            for target_id in targets {
                if let Some(unit) = find_unit_mut(&target_id, player_units, enemy_units) {
                    unit.health = (unit.health + amount).min(unit.max_health);
                    events.push(CombatEvent::AbilityHeal {
                        source_instance_id: source_instance_id.to_string(),
                        target_instance_id: target_id,
                        heal: *amount,
                        new_hp: unit.health,
                    });
                }
            }
        }
        AbilityEffect::AttackBuff { amount, target, duration: _ } => {
            let targets = get_targets(source_instance_id, source_team, target, player_units, enemy_units, rng);
            for target_id in targets {
                if let Some(unit) = find_unit_mut(&target_id, player_units, enemy_units) {
                    unit.attack_buff += amount;
                    events.push(CombatEvent::AbilityBuff {
                        source_instance_id: source_instance_id.to_string(),
                        target_instance_id: target_id,
                        attack_buff: *amount,
                        health_buff: 0,
                        new_attack: unit.effective_attack(),
                        new_health: unit.health,
                    });
                }
            }
        }
        AbilityEffect::HealthBuff { amount, target, duration: _ } => {
            let targets = get_targets(source_instance_id, source_team, target, player_units, enemy_units, rng);
            for target_id in targets {
                if let Some(unit) = find_unit_mut(&target_id, player_units, enemy_units) {
                    unit.health_buff += amount;
                    unit.health += amount;
                    unit.max_health += amount;
                    events.push(CombatEvent::AbilityBuff {
                        source_instance_id: source_instance_id.to_string(),
                        target_instance_id: target_id,
                        attack_buff: 0,
                        health_buff: *amount,
                        new_attack: unit.effective_attack(),
                        new_health: unit.health,
                    });
                }
            }
        }
    }
}

/// Get target instance IDs based on ability target type and source team
fn get_targets(
    source_instance_id: &str,
    source_team: Team,
    target: &AbilityTarget,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    rng: &mut StdRng,
) -> Vec<String> {
    let (allies, enemies) = match source_team {
        Team::Player => (player_units, enemy_units),
        Team::Enemy => (enemy_units, player_units),
    };

    match target {
        AbilityTarget::SelfUnit => vec![source_instance_id.to_string()],
        AbilityTarget::AllAllies => allies.iter().map(|u| u.instance_id.clone()).collect(),
        AbilityTarget::AllEnemies => enemies.iter().map(|u| u.instance_id.clone()).collect(),
        AbilityTarget::RandomAlly => {
            if allies.is_empty() {
                vec![]
            } else {
                let idx = rng.gen_range(0..allies.len());
                vec![allies[idx].instance_id.clone()]
            }
        }
        AbilityTarget::RandomEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                let idx = rng.gen_range(0..enemies.len());
                vec![enemies[idx].instance_id.clone()]
            }
        }
        AbilityTarget::FrontAlly => {
            if allies.is_empty() {
                vec![]
            } else {
                vec![allies[0].instance_id.clone()]
            }
        }
        AbilityTarget::FrontEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                vec![enemies[0].instance_id.clone()]
            }
        }
    }
}

/// Find a mutable reference to a unit by instance_id
fn find_unit_mut<'a>(
    instance_id: &str,
    player_units: &'a mut Vec<CombatUnit>,
    enemy_units: &'a mut Vec<CombatUnit>,
) -> Option<&'a mut CombatUnit> {
    player_units
        .iter_mut()
        .chain(enemy_units.iter_mut())
        .find(|u| u.instance_id == instance_id)
}

/// Remove any dead units (health <= 0) and emit death events
fn remove_dead_units(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
) {
    // Check for player deaths
    let player_had_deaths = player_units.iter().any(|u| u.health <= 0);
    player_units.retain(|u| u.health > 0);
    if player_had_deaths {
        events.push(CombatEvent::UnitDeath {
            team: Team::Player.to_string(),
            new_board_state: player_units.iter().map(|u| u.to_view()).collect(),
        });
    }

    // Check for enemy deaths
    let enemy_had_deaths = enemy_units.iter().any(|u| u.health <= 0);
    enemy_units.retain(|u| u.health > 0);
    if enemy_had_deaths {
        events.push(CombatEvent::UnitDeath {
            team: Team::Enemy.to_string(),
            new_board_state: enemy_units.iter().map(|u| u.to_view()).collect(),
        });
    }
}

/// The deterministic battle simulation.
/// Takes the board state and returns a log of events for the UI to replay.
pub fn resolve_battle(
    player_board: &[BoardUnit],
    enemy_board: &[BoardUnit],
    seed: u64,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut rng = StdRng::seed_from_u64(seed);
    let mut instance_counter = 0;

    let mut player_units: Vec<CombatUnit> = player_board
        .iter()
        .map(|u| {
            instance_counter += 1;
            CombatUnit {
                instance_id: format!("p-{}", instance_counter),
                team: Team::Player,
                attack: u.card.stats.attack,
                health: u.current_health,
                max_health: u.card.stats.health,
                ability: u.card.ability.clone(),
                template_id: u.card.template_id.clone(),
                name: u.card.name.clone(),
                attack_buff: 0,
                health_buff: 0,
            }
        })
        .collect();

    let mut enemy_units: Vec<CombatUnit> = enemy_board
        .iter()
        .map(|u| {
            instance_counter += 1;
            CombatUnit {
                instance_id: format!("e-{}", instance_counter),
                team: Team::Enemy,
                attack: u.card.stats.attack,
                health: u.current_health,
                max_health: u.card.stats.health,
                ability: u.card.ability.clone(),
                template_id: u.card.template_id.clone(),
                name: u.card.name.clone(),
                attack_buff: 0,
                health_buff: 0,
            }
        })
        .collect();

    // 1. Start Phase: Trigger OnStartBattle abilities
    // Collect trigger info (we need owned data to avoid borrow issues)
    let mut start_triggers: Vec<(String, Team, i32, AbilityEffect, String)> = player_units
        .iter()
        .chain(enemy_units.iter())
        .filter_map(|u| {
            u.ability.as_ref().and_then(|a| {
                if a.trigger == AbilityTrigger::OnStart {
                    Some((
                        u.instance_id.clone(),
                        u.team,
                        u.attack,
                        a.effect.clone(),
                        a.name.clone(),
                    ))
                } else {
                    None
                }
            })
        })
        .collect();

    // Sort by Attack Power (Descending), with RNG tie-break
    start_triggers.shuffle(&mut rng);
    start_triggers.sort_by_key(|(_, _, attack, _, _)| -attack);

    for (instance_id, team, _, effect, ability_name) in start_triggers {
        events.push(CombatEvent::AbilityTrigger {
            source_instance_id: instance_id.clone(),
            ability_name,
        });
        apply_ability_effect(
            &instance_id,
            team,
            &effect,
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
        );
    }

    // Remove any units killed by OnStart abilities
    remove_dead_units(&mut player_units, &mut enemy_units, &mut events);

    // 2. Main Combat Loop
    while !player_units.is_empty() && !enemy_units.is_empty() {
        // A. Clash Phase
        let p_unit = &player_units[0];
        let e_unit = &enemy_units[0];

        let p_dmg = p_unit.effective_attack();
        let e_dmg = e_unit.effective_attack();

        events.push(CombatEvent::Clash { p_dmg, e_dmg });

        let p_target_id = p_unit.instance_id.clone();
        let e_target_id = e_unit.instance_id.clone();

        let new_p_hp = p_unit.health - e_dmg;
        let new_e_hp = e_unit.health - p_dmg;

        // Damage is calculated for both, then applied.
        events.push(CombatEvent::DamageTaken {
            target_instance_id: p_target_id,
            team: Team::Player.to_string(),
            remaining_hp: new_p_hp,
        });
        player_units[0].health = new_p_hp;

        events.push(CombatEvent::DamageTaken {
            target_instance_id: e_target_id,
            team: Team::Enemy.to_string(),
            remaining_hp: new_e_hp,
        });
        enemy_units[0].health = new_e_hp;

        // B. Death Phase
        let p_died = player_units[0].health <= 0;
        let e_died = enemy_units[0].health <= 0;

        if p_died || e_died {
            // Collect OnFaint triggers from units about to die
            let mut faint_triggers: Vec<(String, Team, i32, AbilityEffect, String)> = Vec::new();

            if p_died {
                if let Some(ability) = &player_units[0].ability {
                    if ability.trigger == AbilityTrigger::OnFaint {
                        faint_triggers.push((
                            player_units[0].instance_id.clone(),
                            player_units[0].team,
                            player_units[0].attack,
                            ability.effect.clone(),
                            ability.name.clone(),
                        ));
                    }
                }
            }
            if e_died {
                if let Some(ability) = &enemy_units[0].ability {
                    if ability.trigger == AbilityTrigger::OnFaint {
                        faint_triggers.push((
                            enemy_units[0].instance_id.clone(),
                            enemy_units[0].team,
                            enemy_units[0].attack,
                            ability.effect.clone(),
                            ability.name.clone(),
                        ));
                    }
                }
            }

            // Sort by attack power (descending), with RNG tie-break
            faint_triggers.shuffle(&mut rng);
            faint_triggers.sort_by_key(|(_, _, attack, _, _)| -attack);

            // Execute OnFaint abilities
            for (instance_id, team, _, effect, ability_name) in faint_triggers {
                events.push(CombatEvent::AbilityTrigger {
                    source_instance_id: instance_id.clone(),
                    ability_name,
                });
                apply_ability_effect(
                    &instance_id,
                    team,
                    &effect,
                    &mut player_units,
                    &mut enemy_units,
                    &mut events,
                    &mut rng,
                );
            }

            // Remove dead units and emit state changes
            if p_died {
                player_units.remove(0);
                events.push(CombatEvent::UnitDeath {
                    team: Team::Player.to_string(),
                    new_board_state: player_units.iter().map(|u| u.to_view()).collect(),
                });
            }
            if e_died {
                enemy_units.remove(0);
                events.push(CombatEvent::UnitDeath {
                    team: Team::Enemy.to_string(),
                    new_board_state: enemy_units.iter().map(|u| u.to_view()).collect(),
                });
            }

            // Remove any additional units killed by OnFaint abilities
            remove_dead_units(&mut player_units, &mut enemy_units, &mut events);
        }
    }

    // 3. Battle End
    let result = match (player_units.is_empty(), enemy_units.is_empty()) {
        (false, true) => "VICTORY".to_string(),
        (true, false) => "DEFEAT".to_string(),
        (true, true) => "DRAW".to_string(),
        (false, false) => "DRAW".to_string(), // Should not happen
    };
    events.push(CombatEvent::BattleEnd { result });

    events
}
