use crate::limits::BattleLimits;
use crate::types::{Ability, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::Rng;
use rand::SeedableRng;
use serde::{Deserialize, Serialize};

// Re-export Team for backward compatibility
pub use crate::limits::Team;

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
    pub abilities: Vec<Ability>,
}

/// Events generated during combat for UI playback.
/// These events use "Smart Payloads" to make the UI layer as simple as possible.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum CombatEvent {
    #[serde(rename_all = "camelCase")]
    PhaseStart { phase: String },
    #[serde(rename_all = "camelCase")]
    PhaseEnd { phase: String },
    #[serde(rename_all = "camelCase")]
    AbilityTrigger {
        source_instance_id: UnitInstanceId,
        ability_name: String,
    },
    #[serde(rename_all = "camelCase")]
    Clash { p_dmg: i32, e_dmg: i32 },
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
    AbilityModifyStats {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
        health_change: i32,
        attack_change: i32,
        new_attack: i32,
        new_health: i32,
    },
    #[serde(rename_all = "camelCase")]
    UnitSpawn {
        team: String,
        spawned_unit: UnitView,
        new_board_state: Vec<UnitView>,
    },
    #[serde(rename_all = "camelCase")]
    LimitExceeded {
        losing_team: String, // "PLAYER" or "ENEMY"
        reason: String,
    },
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
    let mut limits = BattleLimits::new();

    let mut player_units: Vec<CombatUnit> = player_board
        .iter()
        .map(|u| {
            instance_counter += 1;
            CombatUnit {
                instance_id: format!("p-{}", instance_counter),
                team: Team::Player,
                attack: u.card.stats.attack,
                health: u.current_health,
                abilities: u.card.abilities.clone(),
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
                abilities: u.card.abilities.clone(),
                template_id: u.card.template_id.clone(),
                name: u.card.name.clone(),
                attack_buff: 0,
                health_buff: 0,
            }
        })
        .collect();

    // Execute battle phases
    let battle_phases = [BattlePhase::Start];

    // Execute initial phases
    for &phase in &battle_phases {
        limits.reset_phase_counters();
        if execute_phase(
            phase,
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
            &mut limits,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }
    }

    // Main combat loop
    while !player_units.is_empty() && !enemy_units.is_empty() {
        limits.reset_phase_counters();
        if execute_phase(
            BattlePhase::BeforeAttack,
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
            &mut limits,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }

        // Perform hurt and faint loop after before-attack abilities
        if perform_hurt_faint_loop(
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
            &mut limits,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }

        limits.reset_phase_counters();
        if execute_phase(
            BattlePhase::Attack,
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
            &mut limits,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }

        // Perform hurt and faint loop after attack damage
        if perform_hurt_faint_loop(
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
            &mut limits,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }

        limits.reset_phase_counters();
        if execute_phase(
            BattlePhase::AfterAttack,
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
            &mut limits,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }

        // Perform hurt and faint loop after after-attack abilities
        if perform_hurt_faint_loop(
            &mut player_units,
            &mut enemy_units,
            &mut events,
            &mut rng,
            &mut limits,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }
    }

    // Battle end
    let _ = execute_phase(
        BattlePhase::End,
        &mut player_units,
        &mut enemy_units,
        &mut events,
        &mut rng,
        &mut limits,
    );

    events
}

/// Finalize the battle when a limit is exceeded
fn finalize_with_limit_exceeded(
    events: &mut Vec<CombatEvent>,
    limits: &BattleLimits,
) -> Vec<CombatEvent> {
    let losing_team = limits.limit_exceeded_by.unwrap_or(Team::Player);
    events.push(CombatEvent::LimitExceeded {
        losing_team: losing_team.to_string(),
        reason: limits.limit_exceeded_reason.clone().unwrap_or_default(),
    });
    events.push(CombatEvent::BattleEnd {
        result: match losing_team {
            Team::Player => "DEFEAT".to_string(),
            Team::Enemy => "VICTORY".to_string(),
        },
    });
    events.drain(..).collect()
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BattlePhase {
    Start,
    BeforeAttack,
    Attack,
    AfterAttack,
    HurtAndFaint,
    Knockout,
    End,
}

#[derive(Debug)]
struct PendingTrigger {
    source_id: String,
    team: Team,
    effect: AbilityEffect,
    ability_name: String,
    priority_attack: i32,
    is_from_dead: bool,
}

#[derive(Debug, Clone)]
pub struct CombatUnit {
    pub instance_id: String,
    pub team: Team,
    pub attack: i32,
    pub health: i32,
    pub abilities: Vec<Ability>,
    pub template_id: String,
    pub name: String,
    pub attack_buff: i32,
    pub health_buff: i32,
}

impl CombatUnit {
    fn from_card(card: crate::types::UnitCard) -> Self {
        Self {
            instance_id: format!("unit-{}", card.id),
            team: Team::Player, // This will be overridden when spawning
            attack: card.stats.attack,
            health: card.stats.health,
            abilities: card.abilities,
            template_id: card.template_id,
            name: card.name,
            attack_buff: 0,
            health_buff: 0,
        }
    }

    fn to_view(&self) -> UnitView {
        UnitView {
            instance_id: self.instance_id.clone(),
            template_id: self.template_id.clone(),
            name: self.name.clone(),
            attack: self.effective_attack(),
            health: self.effective_health(),
            abilities: self.abilities.clone(),
        }
    }

    fn effective_attack(&self) -> i32 {
        self.attack + self.attack_buff
    }

    fn effective_health(&self) -> i32 {
        self.health
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
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    limits.enter_recursion(source_team)?;

    let result = match effect {
        AbilityEffect::Damage { amount, target } => {
            let targets = get_targets(
                source_instance_id,
                source_team,
                target,
                player_units,
                enemy_units,
                rng,
            );
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
            Ok(())
        }
        AbilityEffect::ModifyStats {
            health,
            attack,
            target,
        } => {
            let targets = get_targets(
                source_instance_id,
                source_team,
                target,
                player_units,
                enemy_units,
                rng,
            );
            for target_id in targets {
                if let Some(unit) = find_unit_mut(&target_id, player_units, enemy_units) {
                    // Apply attack buff/debuff
                    unit.attack_buff += attack;

                    // Apply health buff/debuff
                    unit.health += health;
                    unit.health_buff += health;

                    events.push(CombatEvent::AbilityModifyStats {
                        source_instance_id: source_instance_id.to_string(),
                        target_instance_id: target_id,
                        health_change: *health,
                        attack_change: *attack,
                        new_attack: unit.effective_attack(),
                        new_health: unit.effective_health(),
                    });
                }
            }
            Ok(())
        }
        AbilityEffect::SpawnUnit { template_id } => {
            // Check spawn limit before spawning
            limits.record_spawn(source_team)?;

            // Get all starter templates (this includes all units now)
            let templates = crate::units::get_starter_templates();

            // Find the template
            let template = templates
                .into_iter()
                .find(|t| t.template_id == *template_id)
                .expect(&format!("Spawn template '{}' not found", template_id));

            // Calculate instance counter
            let current_count = player_units.len() + enemy_units.len();
            let instance_counter = current_count + 1;
            let instance_id = format!(
                "spawn-{}-{}",
                match source_team {
                    Team::Player => "p",
                    Team::Enemy => "e",
                },
                instance_counter
            );

            // Create the unit card with the template data
            let mut card = crate::types::UnitCard::new(
                (instance_counter * 1000) as u32, // Generate a unique ID
                &template.template_id,
                &template.name,
                template.attack,
                template.health,
                template.play_cost,
                template.pitch_value,
            );

            // Add abilities from template
            for ability in &template.abilities {
                card = card.with_ability(ability.clone());
            }

            // Create the combat unit
            let mut new_unit = CombatUnit::from_card(card);
            new_unit.instance_id = instance_id.clone();
            new_unit.team = source_team;

            // Spawn a new unit for the source team
            let spawned_unit_id = instance_id.clone();
            match source_team {
                Team::Player => {
                    player_units.insert(0, new_unit);
                    events.push(CombatEvent::UnitSpawn {
                        team: "PLAYER".to_string(),
                        spawned_unit: player_units[0].to_view(),
                        new_board_state: player_units.iter().map(|u| u.to_view()).collect(),
                    });
                }
                Team::Enemy => {
                    enemy_units.insert(0, new_unit);
                    events.push(CombatEvent::UnitSpawn {
                        team: "ENEMY".to_string(),
                        spawned_unit: enemy_units[0].to_view(),
                        new_board_state: enemy_units.iter().map(|u| u.to_view()).collect(),
                    });
                }
            }

            // Trigger OnSpawn abilities - these trigger when any unit is spawned
            // The abilities belong to existing units and can affect the spawned unit
            let mut spawn_triggers: Vec<(String, Team, usize, AbilityEffect, String)> =
                player_units
                    .iter()
                    .enumerate()
                    .chain(enemy_units.iter().enumerate().map(|(i, u)| (i, u)))
                    .flat_map(|(unit_idx, u)| {
                        u.abilities.iter().filter_map(move |a| {
                            if a.trigger == AbilityTrigger::OnSpawn {
                                Some((
                                    u.instance_id.clone(),
                                    u.team,
                                    unit_idx,
                                    a.effect.clone(),
                                    a.name.clone(),
                                ))
                            } else {
                                None
                            }
                        })
                    })
                    .collect();

            // Sort triggers by priority order
            let priority_order = calculate_priority_order(player_units, enemy_units, rng);
            spawn_triggers.sort_by_key(|(_, team, unit_idx, _, _)| {
                // Find the position of this unit in the priority order
                priority_order
                    .iter()
                    .position(|(p_team, p_idx)| p_team == team && p_idx == unit_idx)
                    .unwrap_or(usize::MAX)
            });

            for (instance_id, team, _, effect, ability_name) in spawn_triggers {
                // Check trigger limit
                limits.record_trigger(team)?;

                events.push(CombatEvent::AbilityTrigger {
                    source_instance_id: instance_id.clone(),
                    ability_name,
                });
                // For OnSpawn abilities, we want to apply the effect as if the ability owner
                // is the source, but we need to modify targeting to affect the spawned unit
                // For now, let's assume OnSpawn abilities use SelfUnit to target the spawned unit
                // This is a bit of a hack, but works for the example
                apply_ability_effect(
                    &spawned_unit_id, // Use spawned unit as target for SelfUnit targeting
                    team,
                    &effect,
                    player_units,
                    enemy_units,
                    events,
                    rng,
                    limits,
                )?;
            }
            Ok(())
        }
    };

    limits.exit_recursion();
    result
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
        AbilityTarget::BackAlly => {
            if allies.is_empty() {
                vec![]
            } else {
                vec![allies[allies.len() - 1].instance_id.clone()]
            }
        }
        AbilityTarget::BackEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                vec![enemies[enemies.len() - 1].instance_id.clone()]
            }
        }
    }
}

/// Find a reference to a unit by instance_id
fn find_unit<'a>(
    instance_id: &str,
    player_units: &'a Vec<CombatUnit>,
    enemy_units: &'a Vec<CombatUnit>,
) -> Option<&'a CombatUnit> {
    player_units
        .iter()
        .chain(enemy_units.iter())
        .find(|u| u.instance_id == instance_id)
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

/// Calculate effect priority for units: attack desc, then health desc, then random
pub fn calculate_priority_order(
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    rng: &mut StdRng,
) -> Vec<(Team, usize)> {
    let mut units_with_priority: Vec<(Team, usize, i32, i32)> = Vec::new();

    // Collect all units with their stats
    for (idx, unit) in player_units.iter().enumerate() {
        if unit.health > 0 {
            units_with_priority.push((
                Team::Player,
                idx,
                unit.effective_attack(),
                unit.effective_health(),
            ));
        }
    }
    for (idx, unit) in enemy_units.iter().enumerate() {
        if unit.health > 0 {
            units_with_priority.push((
                Team::Enemy,
                idx,
                unit.effective_attack(),
                unit.effective_health(),
            ));
        }
    }

    // Sort by: attack desc, health desc, random tiebreaker
    units_with_priority.shuffle(rng); // Random tiebreaker
    units_with_priority.sort_by(|a, b| {
        b.2.cmp(&a.2) // attack desc
            .then(b.3.cmp(&a.3)) // health desc
    });

    units_with_priority
        .into_iter()
        .map(|(team, idx, _, _)| (team, idx))
        .collect()
}

/// Resolve a queue of pending triggers in priority order, handling deaths and recursive triggers
fn resolve_trigger_queue(
    queue: &mut Vec<PendingTrigger>,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    // Sort queue by priority_attack descending
    queue.sort_by(|a, b| b.priority_attack.cmp(&a.priority_attack));

    while let Some(trigger) = queue.pop() {
        // Check if source is still alive (skip only for alive sources)
        if !trigger.is_from_dead
            && find_unit(&trigger.source_id, player_units, enemy_units).is_none()
        {
            continue;
        }

        // Record and emit trigger event
        limits.record_trigger(trigger.team)?;
        events.push(CombatEvent::AbilityTrigger {
            source_instance_id: trigger.source_id.clone(),
            ability_name: trigger.ability_name,
        });

        // Apply the effect
        apply_ability_effect(
            &trigger.source_id,
            trigger.team,
            &trigger.effect,
            player_units,
            enemy_units,
            events,
            rng,
            limits,
        )?;

        // After applying the effect, check for dead units and queue OnFaint triggers
        let dead_units = execute_death_check_phase(player_units, enemy_units, events);

        // For each dead unit, queue their OnFaint abilities
        for dead_unit in dead_units.0 {
            for ability in &dead_unit.abilities {
                if ability.trigger == AbilityTrigger::OnFaint {
                    let priority_attack = dead_unit.effective_attack();
                    queue.push(PendingTrigger {
                        source_id: dead_unit.instance_id.clone(),
                        team: Team::Player,
                        effect: ability.effect.clone(),
                        ability_name: ability.name.clone(),
                        priority_attack,
                        is_from_dead: true,
                    });
                }
            }
        }
        for dead_unit in dead_units.1 {
            for ability in &dead_unit.abilities {
                if ability.trigger == AbilityTrigger::OnFaint {
                    let priority_attack = dead_unit.effective_attack();
                    queue.push(PendingTrigger {
                        source_id: dead_unit.instance_id.clone(),
                        team: Team::Enemy,
                        effect: ability.effect.clone(),
                        ability_name: ability.name.clone(),
                        priority_attack,
                        is_from_dead: true,
                    });
                }
            }
        }

        // Recursively resolve any new triggers (including the OnFaint ones we just added)
        resolve_trigger_queue(queue, player_units, enemy_units, events, rng, limits)?;
    }

    Ok(())
}

/// Execute effects for a specific battle phase
fn execute_phase(
    phase: BattlePhase,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    let phase_name = match phase {
        BattlePhase::Start => "start",
        BattlePhase::BeforeAttack => "beforeAttack",
        BattlePhase::Attack => "attack",
        BattlePhase::AfterAttack => "afterAttack",
        BattlePhase::HurtAndFaint => "hurtAndFaint",
        BattlePhase::Knockout => "knockout",
        BattlePhase::End => "end",
    };

    if phase != BattlePhase::End {
        events.push(CombatEvent::PhaseStart {
            phase: phase_name.to_string(),
        });
    }

    // For now, only implement the phases we currently have
    let result = match phase {
        BattlePhase::Start => {
            // Start phase logic (OnStartBattle abilities)
            execute_start_phase(player_units, enemy_units, events, rng, limits)
        }
        BattlePhase::BeforeAttack => {
            // Before attack phase logic
            execute_before_attack_phase(player_units, enemy_units, events, rng, limits)
        }
        BattlePhase::Attack => {
            // Handle attack phase
            execute_attack_phase(player_units, enemy_units, events, rng);
            Ok(())
        }
        BattlePhase::AfterAttack => {
            // Handle after attack effects
            execute_after_attack_phase(player_units, enemy_units, events, rng, limits)
        }
        BattlePhase::End => {
            // Battle end logic
            let result = match (player_units.is_empty(), enemy_units.is_empty()) {
                (false, true) => "VICTORY".to_string(),
                (true, false) => "DEFEAT".to_string(),
                (true, true) => "DRAW".to_string(),
                (false, false) => "DRAW".to_string(), // Should not happen
            };
            events.push(CombatEvent::BattleEnd { result });
            return Ok(()); // Don't emit PhaseEnd for End phase
        }
        _ => {
            // Placeholder for other phases
            Ok(())
        }
    };

    events.push(CombatEvent::PhaseEnd {
        phase: phase_name.to_string(),
    });

    result
}

/// Execute start-of-battle abilities
fn execute_start_phase(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    // Collect trigger info (we need owned data to avoid borrow issues)
    let mut start_triggers: Vec<(String, Team, usize, AbilityEffect, String)> = player_units
        .iter()
        .enumerate()
        .chain(enemy_units.iter().enumerate().map(|(i, u)| (i, u)))
        .flat_map(|(unit_idx, u)| {
            u.abilities.iter().filter_map(move |a| {
                if a.trigger == AbilityTrigger::OnStart {
                    Some((
                        u.instance_id.clone(),
                        u.team,
                        unit_idx,
                        a.effect.clone(),
                        a.name.clone(),
                    ))
                } else {
                    None
                }
            })
        })
        .collect();

    // Create trigger queue
    let mut trigger_queue: Vec<PendingTrigger> = start_triggers
        .into_iter()
        .map(|(instance_id, team, _, effect, ability_name)| {
            // Get the unit's current attack for priority
            let priority_attack = find_unit(&instance_id, player_units, enemy_units)
                .map(|u| u.effective_attack())
                .unwrap_or(0);
            PendingTrigger {
                source_id: instance_id,
                team,
                effect,
                ability_name,
                priority_attack,
                is_from_dead: false,
            }
        })
        .collect();

    // Resolve the queue (this handles deaths and OnFaint recursively)
    resolve_trigger_queue(
        &mut trigger_queue,
        player_units,
        enemy_units,
        events,
        rng,
        limits,
    )?;

    Ok(())
}

/// Execute attack phase (damage dealing)
fn execute_attack_phase(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    _rng: &mut StdRng,
) {
    if player_units.is_empty() || enemy_units.is_empty() {
        return;
    }

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
}

/// Execute before attack phase (abilities that trigger before attacking)
fn execute_before_attack_phase(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    // Trigger BeforeAttack abilities on front units
    if !player_units.is_empty() {
        let player_abilities: Vec<(String, AbilityEffect)> = player_units[0]
            .abilities
            .iter()
            .filter(|a| a.trigger == AbilityTrigger::BeforeAttack)
            .map(|a| (a.name.clone(), a.effect.clone()))
            .collect();

        for (ability_name, ability_effect) in player_abilities {
            let instance_id = player_units[0].instance_id.clone();

            limits.record_trigger(Team::Player)?;
            events.push(CombatEvent::AbilityTrigger {
                source_instance_id: instance_id.clone(),
                ability_name,
            });
            apply_ability_effect(
                &instance_id,
                Team::Player,
                &ability_effect,
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
        }
    }

    if !enemy_units.is_empty() {
        let enemy_abilities: Vec<(String, AbilityEffect)> = enemy_units[0]
            .abilities
            .iter()
            .filter(|a| a.trigger == AbilityTrigger::BeforeAttack)
            .map(|a| (a.name.clone(), a.effect.clone()))
            .collect();

        for (ability_name, ability_effect) in enemy_abilities {
            let instance_id = enemy_units[0].instance_id.clone();

            limits.record_trigger(Team::Enemy)?;
            events.push(CombatEvent::AbilityTrigger {
                source_instance_id: instance_id.clone(),
                ability_name,
            });
            apply_ability_effect(
                &instance_id,
                Team::Enemy,
                &ability_effect,
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
        }
    }
    Ok(())
}

/// Execute after attack phase (abilities that trigger after attacking)
fn execute_after_attack_phase(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    // Trigger AfterAttack abilities on units that just attacked (if they're still alive)
    // Note: We check if units are still at index 0 (they weren't killed in the attack)
    if !player_units.is_empty() {
        let player_abilities: Vec<(String, AbilityEffect)> = player_units[0]
            .abilities
            .iter()
            .filter(|a| a.trigger == AbilityTrigger::AfterAttack)
            .map(|a| (a.name.clone(), a.effect.clone()))
            .collect();

        for (ability_name, ability_effect) in player_abilities {
            let instance_id = player_units[0].instance_id.clone();

            limits.record_trigger(Team::Player)?;
            events.push(CombatEvent::AbilityTrigger {
                source_instance_id: instance_id.clone(),
                ability_name,
            });
            apply_ability_effect(
                &instance_id,
                Team::Player,
                &ability_effect,
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
        }
    }

    if !enemy_units.is_empty() {
        let enemy_abilities: Vec<(String, AbilityEffect)> = enemy_units[0]
            .abilities
            .iter()
            .filter(|a| a.trigger == AbilityTrigger::AfterAttack)
            .map(|a| (a.name.clone(), a.effect.clone()))
            .collect();

        for (ability_name, ability_effect) in enemy_abilities {
            let instance_id = enemy_units[0].instance_id.clone();

            limits.record_trigger(Team::Enemy)?;
            events.push(CombatEvent::AbilityTrigger {
                source_instance_id: instance_id.clone(),
                ability_name,
            });
            apply_ability_effect(
                &instance_id,
                Team::Enemy,
                &ability_effect,
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
        }
    }
    Ok(())
}

/// Execute death check phase (remove units with 0 or less health)
/// Returns ALL dead units from both teams, not just the front ones
fn execute_death_check_phase(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
) -> (Vec<CombatUnit>, Vec<CombatUnit>) {
    // Collect all dead player units
    let mut player_dead: Vec<CombatUnit> = Vec::new();
    let mut i = 0;
    while i < player_units.len() {
        if player_units[i].health <= 0 {
            player_dead.push(player_units.remove(i));
        } else {
            i += 1;
        }
    }
    if !player_dead.is_empty() {
        events.push(CombatEvent::UnitDeath {
            team: Team::Player.to_string(),
            new_board_state: player_units.iter().map(|u| u.to_view()).collect(),
        });
    }

    // Collect all dead enemy units
    let mut enemy_dead: Vec<CombatUnit> = Vec::new();
    let mut i = 0;
    while i < enemy_units.len() {
        if enemy_units[i].health <= 0 {
            enemy_dead.push(enemy_units.remove(i));
        } else {
            i += 1;
        }
    }
    if !enemy_dead.is_empty() {
        events.push(CombatEvent::UnitDeath {
            team: Team::Enemy.to_string(),
            new_board_state: enemy_units.iter().map(|u| u.to_view()).collect(),
        });
    }

    (player_dead, enemy_dead)
}

/// Perform hurt and faint loop: repeatedly check for dead units and trigger OnFaint abilities
/// until no new deaths occur (following SAP AI battle.py pattern)
fn perform_hurt_faint_loop(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    loop {
        // Check for dead units
        let dead_units = execute_death_check_phase(player_units, enemy_units, events);

        // If no units died, break the loop
        if dead_units.0.is_empty() && dead_units.1.is_empty() {
            break;
        }

        // Execute OnFaint abilities for the dead units
        execute_hurt_and_faint_phase(dead_units, player_units, enemy_units, events, rng, limits)?;
    }
    Ok(())
}

/// Execute hurt and faint phase (handle OnFaint triggers for units that died this turn)
fn execute_hurt_and_faint_phase(
    dead_units: (Vec<CombatUnit>, Vec<CombatUnit>),
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    let (player_dead, enemy_dead) = dead_units;

    // Execute OnFaint abilities for all player units that died this turn
    for dead_unit in &player_dead {
        for ability in &dead_unit.abilities {
            if ability.trigger == AbilityTrigger::OnFaint {
                limits.record_trigger(Team::Player)?;
                events.push(CombatEvent::AbilityTrigger {
                    source_instance_id: dead_unit.instance_id.clone(),
                    ability_name: ability.name.clone(),
                });
                apply_ability_effect(
                    &dead_unit.instance_id,
                    Team::Player,
                    &ability.effect,
                    player_units,
                    enemy_units,
                    events,
                    rng,
                    limits,
                )?;
            }
        }
    }

    // Execute OnFaint abilities for all enemy units that died this turn
    for dead_unit in &enemy_dead {
        for ability in &dead_unit.abilities {
            if ability.trigger == AbilityTrigger::OnFaint {
                limits.record_trigger(Team::Enemy)?;
                events.push(CombatEvent::AbilityTrigger {
                    source_instance_id: dead_unit.instance_id.clone(),
                    ability_name: ability.name.clone(),
                });
                apply_ability_effect(
                    &dead_unit.instance_id,
                    Team::Enemy,
                    &ability.effect,
                    player_units,
                    enemy_units,
                    events,
                    rng,
                    limits,
                )?;
            }
        }
    }

    Ok(())
}
