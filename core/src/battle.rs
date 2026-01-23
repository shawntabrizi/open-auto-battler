use crate::limits::BattleLimits;
use crate::state::BOARD_SIZE;
use crate::types::{Ability, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit};
use rand::rngs::StdRng;
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

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BattlePhase {
    Start,
    BeforeAttack,
    Attack,
    AfterAttack,
    End,
}

/// Priority data used for sorting triggers
#[derive(Debug)]
struct TriggerPriority {
    attack: i32,
    health: i32,
    unit_position: usize,
    ability_order: usize,
}

/// Trigger struct with support for location-based spawning
#[derive(Debug)]
struct PendingTrigger {
    source_id: String,
    team: Team,
    effect: AbilityEffect,
    ability_name: String,
    priority: TriggerPriority,
    is_from_dead: bool,
    spawn_index_override: Option<usize>,
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
    pub play_cost: i32,
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
            play_cost: card.economy.play_cost,
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

// ==========================================
// MAIN BATTLE RESOLVER
// ==========================================

pub fn resolve_battle(
    player_board: &[BoardUnit],
    enemy_board: &[BoardUnit],
    seed: u64,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut rng = StdRng::seed_from_u64(seed);
    let mut limits = BattleLimits::new();

    // Initialize Units
    let mut player_units: Vec<CombatUnit> = player_board
        .iter()
        .map(|u| {
            let mut cu = CombatUnit::from_card(u.card.clone());
            cu.instance_id = format!("p-{}", limits.generate_instance_id());
            cu.team = Team::Player;
            cu.health = u.current_health;
            cu
        })
        .collect();

    let mut enemy_units: Vec<CombatUnit> = enemy_board
        .iter()
        .map(|u| {
            let mut cu = CombatUnit::from_card(u.card.clone());
            cu.instance_id = format!("e-{}", limits.generate_instance_id());
            cu.team = Team::Enemy;
            cu.health = u.current_health;
            cu
        })
        .collect();

    // 1. Start of Battle Phase
    limits.reset_phase_counters();
    if execute_phase(
        BattlePhase::Start,
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

    // 2. Main Loop
    while !player_units.is_empty() && !enemy_units.is_empty() {
        if limits.record_round().is_err() {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }

        // Before Attack
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

        // The Clash (Attack)
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

        // After Attack
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
    }

    // 3. Battle End
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

fn finalize_with_limit_exceeded(
    events: &mut Vec<CombatEvent>,
    limits: &BattleLimits,
) -> Vec<CombatEvent> {
    let losing_team = limits.limit_exceeded_by;
    
    if let Some(team) = losing_team {
        events.push(CombatEvent::LimitExceeded {
            losing_team: team.to_string(),
            reason: limits.limit_exceeded_reason.clone().unwrap_or_default(),
        });
    } else {
        events.push(CombatEvent::LimitExceeded {
            losing_team: "NONE".to_string(),
            reason: limits.limit_exceeded_reason.clone().unwrap_or_default(),
        });
    }

    events.push(CombatEvent::BattleEnd {
        result: match losing_team {
            Some(Team::Player) => "DEFEAT".to_string(),
            Some(Team::Enemy) => "VICTORY".to_string(),
            None => "DRAW".to_string(),
        },
    });
    events.drain(..).collect()
}

// ==========================================
// CORE LOGIC: RECURSIVE TRIGGER RESOLUTION
// ==========================================

/// Resolves triggers depth-first.
/// If a trigger causes a state change (Death), we resolve reactions IMMEDIATELY.
fn resolve_trigger_queue(
    queue: &mut Vec<PendingTrigger>,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    // Trigger Priority:
    // 1. Attack (Highest First) -> Ascending Sort
    // 2. Health (Highest First) -> Ascending Sort
    // 3. Team (Player First)    -> Player > Enemy
    // 4. Position (Front First) -> Descending Sort (Index 1 < Index 0 so 0 ends up at back)
    // 5. Ability Order          -> Descending Sort (First ability ends up at back)
    // Pop takes from the end.
    queue.sort_by(|a, b| {
        a.priority
            .attack
            .cmp(&b.priority.attack)
            .then(a.priority.health.cmp(&b.priority.health))
            .then_with(|| match (a.team, b.team) {
                (Team::Enemy, Team::Player) => std::cmp::Ordering::Less,
                (Team::Player, Team::Enemy) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            })
            .then(b.priority.unit_position.cmp(&a.priority.unit_position))
            .then(b.priority.ability_order.cmp(&a.priority.ability_order))
    });

    // 2. Iterate
    while let Some(trigger) = queue.pop() {
        // A. Validation: Is source still alive?
        // (We allow dead units to trigger OnFaint, but not living units that died in queue)
        if !trigger.is_from_dead
            && find_unit(&trigger.source_id, player_units, enemy_units).is_none()
        {
            continue;
        }

        // B. Emit Trigger Event
        limits.record_trigger(trigger.team)?;
        events.push(CombatEvent::AbilityTrigger {
            source_instance_id: trigger.source_id.clone(),
            ability_name: trigger.ability_name,
        });

        // C. Apply Effect
        let damaged_ids = apply_ability_effect(
            &trigger.source_id,
            trigger.team,
            &trigger.effect,
            player_units,
            enemy_units,
            events,
            rng,
            limits,
            trigger.spawn_index_override, // Pass the index where the parent died
        )?;

        let mut reaction_queue = Vec::new();

        // Helper to queue OnDamageTaken
        // We process this BEFORE death checks so we can catch units that took fatal damage.
        for unit_id in damaged_ids {
            if let Some(unit) = find_unit(&unit_id, player_units, enemy_units) {
                let is_fatal = unit.health <= 0;
                for (sub_idx, ability) in unit.abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnDamageTaken {
                        // Find index of unit
                        let (idx_in_team, team) = if let Some(pos) =
                            player_units.iter().position(|u| u.instance_id == unit_id)
                        {
                            (pos, Team::Player)
                        } else if let Some(pos) =
                            enemy_units.iter().position(|u| u.instance_id == unit_id)
                        {
                            (pos, Team::Enemy)
                        } else {
                            continue;
                        };

                        reaction_queue.push(PendingTrigger {
                            source_id: unit_id.clone(),
                            team,
                            effect: ability.effect.clone(),
                            ability_name: ability.name.clone(),
                            priority: TriggerPriority {
                                attack: unit.effective_attack(),
                                health: unit.effective_health(),
                                unit_position: idx_in_team,
                                ability_order: sub_idx,
                            },
                            is_from_dead: is_fatal, // ALLOW execution if it died from this damage
                            spawn_index_override: if is_fatal { Some(idx_in_team) } else { None },
                        });
                    }
                }
            }
        }

        // D. INTERRUPT CHECK: Did anyone die?
        let (dead_player, dead_enemy) =
            execute_death_check_phase(player_units, enemy_units, events);

        // Helper to queue OnFaint
        let queue_on_faint =
            |dead_unit: CombatUnit, index: usize, team: Team, q: &mut Vec<PendingTrigger>| {
                for (sub_idx, ability) in dead_unit.abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnFaint {
                        q.push(PendingTrigger {
                            source_id: dead_unit.instance_id.clone(),
                            team,
                            effect: ability.effect.clone(),
                            ability_name: ability.name.clone(),
                            priority: TriggerPriority {
                                attack: dead_unit.effective_attack(),
                                health: dead_unit.effective_health(),
                                unit_position: index,
                                ability_order: sub_idx,
                            },
                            is_from_dead: true,
                            spawn_index_override: Some(index), // Remember where it died!
                        });
                    }
                }
            };

        // Collect Player Deaths
        for (idx, dead_unit) in dead_player {
            queue_on_faint(dead_unit, idx, Team::Player, &mut reaction_queue);
            // Trigger OnAllyFaint for survivors
            for (s_idx, survivor) in player_units.iter().enumerate() {
                for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnAllyFaint {
                        reaction_queue.push(PendingTrigger {
                            source_id: survivor.instance_id.clone(),
                            team: Team::Player,
                            effect: ability.effect.clone(),
                            ability_name: ability.name.clone(),
                            priority: TriggerPriority {
                                attack: survivor.effective_attack(),
                                health: survivor.effective_health(),
                                unit_position: s_idx,
                                ability_order: sub_idx,
                            },
                            is_from_dead: false,
                            spawn_index_override: None,
                        });
                    }
                }
            }
        }
        // Collect Enemy Deaths
        for (idx, dead_unit) in dead_enemy {
            queue_on_faint(dead_unit, idx, Team::Enemy, &mut reaction_queue);
            // Trigger OnAllyFaint for survivors
            for (s_idx, survivor) in enemy_units.iter().enumerate() {
                for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnAllyFaint {
                        reaction_queue.push(PendingTrigger {
                            source_id: survivor.instance_id.clone(),
                            team: Team::Enemy,
                            effect: ability.effect.clone(),
                            ability_name: ability.name.clone(),
                            priority: TriggerPriority {
                                attack: survivor.effective_attack(),
                                health: survivor.effective_health(),
                                unit_position: s_idx,
                                ability_order: sub_idx,
                            },
                            is_from_dead: false,
                            spawn_index_override: None,
                        });
                    }
                }
            }
        }

        // E. RECURSION (Depth-First)
        // If we have reactions, resolve them NOW before continuing the main loop.
        if !reaction_queue.is_empty() {
            limits.enter_trigger_depth(trigger.team)?;
            resolve_trigger_queue(
                &mut reaction_queue,
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
            limits.exit_trigger_depth();
        }
    }

    Ok(())
}

// ==========================================
// EFFECT APPLICATION
// ==========================================

fn apply_ability_effect(
    source_instance_id: &str,
    source_team: Team,
    effect: &AbilityEffect,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
    spawn_index_override: Option<usize>, // New Param
) -> Result<Vec<String>, ()> {
    limits.enter_recursion(source_team)?;
    let mut damaged_units = Vec::new();

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
                if let Some(unit) = find_unit_mut(&target_id, player_units, enemy_units) {
                    let actual_damage = *amount;
                    if actual_damage > 0 {
                        unit.health -= actual_damage;
                        damaged_units.push(target_id.clone());
                        events.push(CombatEvent::AbilityDamage {
                            source_instance_id: source_instance_id.to_string(),
                            target_instance_id: target_id,
                            damage: actual_damage,
                            remaining_hp: unit.health,
                        });
                    }
                }
            }
            Ok(damaged_units)
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
                    unit.attack_buff += attack;
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
            Ok(damaged_units)
        }
        AbilityEffect::SpawnUnit { template_id } => {
            limits.record_spawn(source_team)?;

            // Check Cap
            let (my_board, team_name) = match source_team {
                Team::Player => (player_units, "PLAYER"),
                Team::Enemy => (enemy_units, "ENEMY"),
            };

            if my_board.len() >= BOARD_SIZE {
                return Ok(damaged_units);
            }

            // Create Unit Logic
            let templates = crate::units::get_starter_templates();
            let template = templates
                .into_iter()
                .find(|t| t.template_id == *template_id)
                .expect(&format!("Spawn template '{}' not found", template_id));

            let next_id = limits.generate_instance_id();
            let instance_id = format!(
                "spawn-{}-{}",
                match source_team {
                    Team::Player => "p",
                    _ => "e",
                },
                next_id
            );

            let mut card = crate::types::UnitCard::new(
                (next_id * 5000) as u32,
                &template.template_id,
                &template.name,
                template.attack,
                template.health,
                template.play_cost,
                template.pitch_value,
            );
            for ability in &template.abilities {
                card = card.with_ability(ability.clone());
            }

            let mut new_unit = CombatUnit::from_card(card);
            new_unit.instance_id = instance_id.clone();
            new_unit.team = source_team;

            // INSERTION LOGIC: Use override if provided (e.g. Zombie Cricket), otherwise Front (e.g. Spawner)
            let insert_idx = spawn_index_override.unwrap_or(0);
            let safe_idx = std::cmp::min(insert_idx, my_board.len());

            my_board.insert(safe_idx, new_unit);

            // Log Spawn
            events.push(CombatEvent::UnitSpawn {
                team: team_name.to_string(),
                spawned_unit: my_board[safe_idx].to_view(),
                new_board_state: my_board.iter().map(|u| u.to_view()).collect(),
            });

            Ok(damaged_units)
        }
        AbilityEffect::Destroy { target } => {
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
                    let fatal = unit.health + 999;
                    unit.health -= fatal;
                    // We don't add to damaged_units because Destroy usually implies death
                    // and we want to avoid redundant "Hurt" triggers if it's an absolute kill,
                    // but for consistency with "Hurt triggers on death", maybe we should?
                    // The prompt asked for "kills", so I'll treat it as massive damage.
                    events.push(CombatEvent::AbilityDamage {
                        source_instance_id: source_instance_id.to_string(),
                        target_instance_id: target_id,
                        damage: fatal,
                        remaining_hp: unit.health,
                    });
                }
            }
            Ok(damaged_units)
        }
    };

    limits.exit_recursion();
    result
}

// ==========================================
// HELPERS
// ==========================================

fn execute_phase(
    phase: BattlePhase,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    let phase_name = format!("{:?}", phase); // Quick debug name

    if phase != BattlePhase::End {
        events.push(CombatEvent::PhaseStart {
            phase: phase_name.clone(),
        });
    }

    match phase {
        BattlePhase::Start => {
            collect_and_resolve_triggers(
                &[AbilityTrigger::OnStart],
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
        }
        BattlePhase::BeforeAttack => {
            collect_and_resolve_triggers(
                &[
                    AbilityTrigger::BeforeAnyAttack,
                    AbilityTrigger::BeforeUnitAttack,
                ],
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
        }
        BattlePhase::Attack => {
            execute_attack_clash(player_units, enemy_units, events);
            // After clash, people might be dead or hurt. Resolve loop.
            resolve_hurt_and_faint_loop(player_units, enemy_units, events, rng, limits)?;
        }
        BattlePhase::AfterAttack => {
            collect_and_resolve_triggers(
                &[
                    AbilityTrigger::AfterAnyAttack,
                    AbilityTrigger::AfterUnitAttack,
                ],
                player_units,
                enemy_units,
                events,
                rng,
                limits,
            )?;
        }
        BattlePhase::End => {
            let result = match (player_units.is_empty(), enemy_units.is_empty()) {
                (false, true) => "VICTORY",
                (true, false) => "DEFEAT",
                _ => "DRAW",
            }
            .to_string();
            events.push(CombatEvent::BattleEnd { result });
        }
    }

    if phase != BattlePhase::End {
        events.push(CombatEvent::PhaseEnd { phase: phase_name });
    }
    Ok(())
}

fn collect_and_resolve_triggers(
    trigger_types: &[AbilityTrigger],
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    let mut queue = Vec::new();
    // Helper to scan board
    let mut scan_board = |units: &Vec<CombatUnit>, team: Team| {
        for (i, u) in units.iter().enumerate() {
            for (sub_idx, ability) in u.abilities.iter().enumerate() {
                if trigger_types.contains(&ability.trigger) {
                    // Logic: UnitAttack triggers ONLY for the front unit (index 0).
                    // AnyAttack triggers for everyone on the board.
                    let is_front = i == 0;
                    let is_unit_trigger = ability.trigger == AbilityTrigger::BeforeUnitAttack
                        || ability.trigger == AbilityTrigger::AfterUnitAttack;

                    if is_unit_trigger && !is_front {
                        continue;
                    }

                    queue.push(PendingTrigger {
                        source_id: u.instance_id.clone(),
                        team,
                        effect: ability.effect.clone(),
                        ability_name: ability.name.clone(),
                        priority: TriggerPriority {
                            attack: u.effective_attack(),
                            health: u.effective_health(),
                            unit_position: i,
                            ability_order: sub_idx,
                        },
                        is_from_dead: false,
                        spawn_index_override: None,
                    });
                }
            }
        }
    };

    scan_board(player_units, Team::Player);
    scan_board(enemy_units, Team::Enemy);

    resolve_trigger_queue(&mut queue, player_units, enemy_units, events, rng, limits)
}

fn execute_attack_clash(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
) {
    if player_units.is_empty() || enemy_units.is_empty() {
        return;
    }

    let p = &player_units[0];
    let e = &enemy_units[0];
    let p_dmg = p.effective_attack();
    let e_dmg = e.effective_attack();

    events.push(CombatEvent::Clash { p_dmg, e_dmg });

    let p_id = p.instance_id.clone();
    let e_id = e.instance_id.clone();

    // Apply Dmg
    player_units[0].health -= e_dmg;
    enemy_units[0].health -= p_dmg;

    events.push(CombatEvent::DamageTaken {
        target_instance_id: p_id,
        team: "PLAYER".to_string(),
        remaining_hp: player_units[0].health,
    });
    events.push(CombatEvent::DamageTaken {
        target_instance_id: e_id,
        team: "ENEMY".to_string(),
        remaining_hp: enemy_units[0].health,
    });
}

/// Returns a tuple of (Index, Unit) for dead units
fn execute_death_check_phase(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
) -> (Vec<(usize, CombatUnit)>, Vec<(usize, CombatUnit)>) {
    let mut player_dead = Vec::new();
    let mut i = 0;
    while i < player_units.len() {
        if player_units[i].health <= 0 {
            let u = player_units.remove(i);
            player_dead.push((i, u)); // Keep 'i' as spawn location
                                      // Do NOT increment i, next unit slid into this slot
        } else {
            i += 1;
        }
    }

    let mut enemy_dead = Vec::new();
    let mut j = 0;
    while j < enemy_units.len() {
        if enemy_units[j].health <= 0 {
            let u = enemy_units.remove(j);
            enemy_dead.push((j, u));
        } else {
            j += 1;
        }
    }

    // Emit Events if needed (Frontend State Sync)
    if !player_dead.is_empty() {
        events.push(CombatEvent::UnitDeath {
            team: "PLAYER".to_string(),
            new_board_state: player_units.iter().map(|u| u.to_view()).collect(),
        });
    }
    if !enemy_dead.is_empty() {
        events.push(CombatEvent::UnitDeath {
            team: "ENEMY".to_string(),
            new_board_state: enemy_units.iter().map(|u| u.to_view()).collect(),
        });
    }

    (player_dead, enemy_dead)
}

fn resolve_hurt_and_faint_loop(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut StdRng,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    // CAPTURE clashing unit IDs before they potentially die or board slides
    let clashing_p_id = player_units.first().map(|u| u.instance_id.clone());
    let clashing_e_id = enemy_units.first().map(|u| u.instance_id.clone());

    let (dead_player, dead_enemy) = execute_death_check_phase(player_units, enemy_units, events);

    // Build the initial reaction queue from the Clash deaths AND DAMAGE
    let mut queue = Vec::new();

    // Check for OnDamageTaken for the clashing units
    let mut check_clash_damage =
        |id: Option<String>, team: Team, units: &[CombatUnit], dead: &[(usize, CombatUnit)]| {
            if let Some(target_id) = id {
                // Find unit in survivors OR dead
                let unit_opt = units
                    .iter()
                    .find(|u| u.instance_id == target_id)
                    .or_else(|| {
                        dead.iter()
                            .find(|(_, u)| u.instance_id == target_id)
                            .map(|(_, u)| u)
                    });

                if let Some(u) = unit_opt {
                    let is_dead = u.health <= 0;
                    for (sub_idx, a) in u.abilities.iter().enumerate() {
                        if a.trigger == AbilityTrigger::OnDamageTaken {
                            // Find current index if survivor, otherwise 0
                            let current_idx = units
                                .iter()
                                .position(|survivor| survivor.instance_id == target_id)
                                .unwrap_or(0);

                            queue.push(PendingTrigger {
                                source_id: target_id.clone(),
                                team,
                                effect: a.effect.clone(),
                                ability_name: a.name.clone(),
                                priority: TriggerPriority {
                                    attack: u.effective_attack(),
                                    health: u.effective_health(),
                                    unit_position: current_idx,
                                    ability_order: sub_idx,
                                },
                                is_from_dead: is_dead,
                                spawn_index_override: if is_dead { Some(0) } else { None },
                            });
                        }
                    }
                }
            }
        };

    check_clash_damage(clashing_p_id, Team::Player, player_units, &dead_player);
    check_clash_damage(clashing_e_id, Team::Enemy, enemy_units, &dead_enemy);

    if dead_player.is_empty() && dead_enemy.is_empty() && queue.is_empty() {
        return Ok(());
    }

    for (idx, u) in dead_player {
        for (sub_idx, a) in u.abilities.iter().enumerate() {
            if a.trigger == AbilityTrigger::OnFaint {
                queue.push(PendingTrigger {
                    source_id: u.instance_id.clone(),
                    team: Team::Player,
                    effect: a.effect.clone(),
                    ability_name: a.name.clone(),
                    priority: TriggerPriority {
                        attack: u.effective_attack(),
                        health: u.effective_health(),
                        unit_position: idx,
                        ability_order: sub_idx,
                    },
                    is_from_dead: true,
                    spawn_index_override: Some(idx),
                });
            }
        }
        // Scan Survivors for OnAllyFaint
        for (s_idx, survivor) in player_units.iter().enumerate() {
            for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                if ability.trigger == AbilityTrigger::OnAllyFaint {
                    queue.push(PendingTrigger {
                        source_id: survivor.instance_id.clone(),
                        team: Team::Player,
                        effect: ability.effect.clone(),
                        ability_name: ability.name.clone(),
                        priority: TriggerPriority {
                            attack: survivor.effective_attack(),
                            health: survivor.effective_health(),
                            unit_position: s_idx,
                            ability_order: sub_idx,
                        },
                        is_from_dead: false,
                        spawn_index_override: None,
                    });
                }
            }
        }
    }
    for (idx, u) in dead_enemy {
        for (sub_idx, a) in u.abilities.iter().enumerate() {
            if a.trigger == AbilityTrigger::OnFaint {
                queue.push(PendingTrigger {
                    source_id: u.instance_id.clone(),
                    team: Team::Enemy,
                    effect: a.effect.clone(),
                    ability_name: a.name.clone(),
                    priority: TriggerPriority {
                        attack: u.effective_attack(),
                        health: u.effective_health(),
                        unit_position: idx,
                        ability_order: sub_idx,
                    },
                    is_from_dead: true,
                    spawn_index_override: Some(idx),
                });
            }
        }
        // Scan Survivors for OnAllyFaint
        for (s_idx, survivor) in enemy_units.iter().enumerate() {
            for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                if ability.trigger == AbilityTrigger::OnAllyFaint {
                    queue.push(PendingTrigger {
                        source_id: survivor.instance_id.clone(),
                        team: Team::Enemy,
                        effect: ability.effect.clone(),
                        ability_name: ability.name.clone(),
                        priority: TriggerPriority {
                            attack: survivor.effective_attack(),
                            health: survivor.effective_health(),
                            unit_position: s_idx,
                            ability_order: sub_idx,
                        },
                        is_from_dead: false,
                        spawn_index_override: None,
                    });
                }
            }
        }
    }

    resolve_trigger_queue(&mut queue, player_units, enemy_units, events, rng, limits)
}

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
            if !allies.is_empty() {
                vec![allies[0].instance_id.clone()]
            } else {
                vec![]
            }
        }
        AbilityTarget::FrontEnemy => {
            if !enemies.is_empty() {
                vec![enemies[0].instance_id.clone()]
            } else {
                vec![]
            }
        }
        AbilityTarget::BackAlly => {
            if !allies.is_empty() {
                vec![allies.last().unwrap().instance_id.clone()]
            } else {
                vec![]
            }
        }
        AbilityTarget::BackEnemy => {
            if !enemies.is_empty() {
                vec![enemies.last().unwrap().instance_id.clone()]
            } else {
                vec![]
            }
        }
        AbilityTarget::AllyAhead => {
            if let Some(pos) = allies
                .iter()
                .position(|u| u.instance_id == *source_instance_id)
            {
                if pos > 0 {
                    vec![allies[pos - 1].instance_id.clone()]
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        }
        AbilityTarget::LowestHealthEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                let mut target = &enemies[0];
                for e in enemies.iter().skip(1) {
                    if e.health < target.health {
                        target = e;
                    }
                }
                vec![target.instance_id.clone()]
            }
        }
        AbilityTarget::HighestAttackEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                let mut target = &enemies[0];
                for e in enemies.iter().skip(1) {
                    if e.effective_attack() > target.effective_attack() {
                        target = e;
                    }
                }
                vec![target.instance_id.clone()]
            }
        }
        AbilityTarget::HighestHealthEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                let mut target = &enemies[0];
                for e in enemies.iter().skip(1) {
                    if e.health > target.health {
                        target = e;
                    }
                }
                vec![target.instance_id.clone()]
            }
        }
        AbilityTarget::LowestAttackEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                let mut target = &enemies[0];
                for e in enemies.iter().skip(1) {
                    if e.effective_attack() < target.effective_attack() {
                        target = e;
                    }
                }
                vec![target.instance_id.clone()]
            }
        }
        AbilityTarget::HighestManaEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                let mut target = &enemies[0];
                for e in enemies.iter().skip(1) {
                    if e.play_cost > target.play_cost {
                        target = e;
                    }
                }
                vec![target.instance_id.clone()]
            }
        }
        AbilityTarget::LowestManaEnemy => {
            if enemies.is_empty() {
                vec![]
            } else {
                let mut target = &enemies[0];
                for e in enemies.iter().skip(1) {
                    if e.play_cost < target.play_cost {
                        target = e;
                    }
                }
                vec![target.instance_id.clone()]
            }
        }
    }
}

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
