use crate::types::{Ability, AbilityTrigger, BoardUnit};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
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
}

impl CombatUnit {
    fn to_view(&self) -> UnitView {
        UnitView {
            instance_id: self.instance_id.clone(),
            template_id: self.template_id.clone(),
            name: self.name.clone(),
            attack: self.attack,
            health: self.health,
            max_health: self.max_health,
            ability: self.ability.clone(),
        }
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
            }
        })
        .collect();

    // 1. Start Phase: Trigger OnStartBattle abilities
    let mut start_triggers: Vec<&CombatUnit> = player_units
        .iter()
        .chain(enemy_units.iter())
        .filter(|u| match &u.ability {
            Some(a) => a.trigger == AbilityTrigger::OnStart,
            None => false,
        })
        .collect();

    // Sort by Attack Power (Descending), with RNG tie-break
    start_triggers.shuffle(&mut rng); // Initial random shuffle for tie-breaking
    start_triggers.sort_by_key(|u| -u.attack);

    for unit in start_triggers {
        if let Some(ability) = &unit.ability {
            events.push(CombatEvent::AbilityTrigger {
                source_instance_id: unit.instance_id.clone(),
                ability_name: ability.name.clone(),
            });
            // Note: Effect logic would go here. The prompt focuses on event generation.
            // For now, we assume abilities don't alter the board before the first clash.
        }
    }

    // 2. Main Combat Loop
    while !player_units.is_empty() && !enemy_units.is_empty() {
        // A. Clash Phase
        let p_unit = &player_units[0];
        let e_unit = &enemy_units[0];

        let p_dmg = p_unit.attack;
        let e_dmg = e_unit.attack;

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
            let mut dead_units = Vec::new();
            if p_died {
                dead_units.push(player_units[0].clone());
            }
            if e_died {
                dead_units.push(enemy_units[0].clone());
            }

            // Sort dead units for OnFaint triggers
            dead_units.shuffle(&mut rng);
            dead_units.sort_by_key(|u| -u.attack);

            for unit in dead_units {
                if let Some(ability) = &unit.ability {
                    if ability.trigger == AbilityTrigger::OnFaint {
                        events.push(CombatEvent::AbilityTrigger {
                            source_instance_id: unit.instance_id.clone(),
                            ability_name: ability.name.clone(),
                        });
                        // Again, effect logic is omitted as per prompt focus.
                    }
                }
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
