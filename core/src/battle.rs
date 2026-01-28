//! Battle resolution system
//!
//! This module handles combat resolution between player and enemy units.

use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use core::cmp::Ordering;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
use scale_info::TypeInfo;

use crate::limits::{BattleLimits, LimitReason};
use crate::rng::BattleRng;
use crate::state::BOARD_SIZE;
use crate::types::{
    Ability, AbilityCondition, AbilityEffect, AbilityTarget, AbilityTrigger, BoardUnit, CompareOp,
    SortOrder, StatType, TargetScope,
};

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

// Re-export Team for backward compatibility
pub use crate::limits::Team;

// A unique ID for a unit instance in a battle
// High bit (31) determines team: 0 = Player, 1 = Enemy.
// This ensures IDs are unique and stable per team.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    Encode,
    Decode,
    DecodeWithMemTracking,
    TypeInfo,
    MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(transparent))]
pub struct UnitId(pub u32);

impl UnitId {
    const ENEMY_MASK: u32 = 0x8000_0000;

    pub fn player(index: u32) -> Self {
        Self(index)
    }

    pub fn enemy(index: u32) -> Self {
        Self(index | Self::ENEMY_MASK)
    }

    pub fn is_player(&self) -> bool {
        (self.0 & Self::ENEMY_MASK) == 0
    }

    pub fn is_enemy(&self) -> bool {
        !self.is_player()
    }

    pub fn raw(&self) -> u32 {
        self.0
    }
}

pub type UnitInstanceId = UnitId;

/// Simplified view of a unit for battle replay.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct UnitView {
    pub instance_id: UnitInstanceId,
    pub template_id: String,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub abilities: Vec<Ability>,
    pub is_token: bool,
}

#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum BattleResult {
    Victory,
    Defeat,
    Draw,
}

/// Events generated during combat for UI playback.
#[derive(Debug, Clone, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(
    feature = "std",
    serde(tag = "type", content = "payload")
)]
pub enum CombatEvent {
    PhaseStart { phase: BattlePhase },
    PhaseEnd { phase: BattlePhase },
    AbilityTrigger {
        source_instance_id: UnitInstanceId,
        ability_name: String,
    },
    Clash { p_dmg: i32, e_dmg: i32 },
    DamageTaken {
        target_instance_id: UnitInstanceId,
        team: Team,
        remaining_hp: i32,
    },
    UnitDeath {
        team: Team,
        new_board_state: Vec<UnitView>,
    },
    BattleEnd { result: BattleResult },
    AbilityDamage {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
        damage: i32,
        remaining_hp: i32,
    },
    AbilityModifyStats {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
        health_change: i32,
        attack_change: i32,
        new_attack: i32,
        new_health: i32,
    },
    UnitSpawn {
        team: Team,
        spawned_unit: UnitView,
        new_board_state: Vec<UnitView>,
    },
    LimitExceeded {
        losing_team: Option<Team>,
        reason: LimitReason,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
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
    source_id: UnitInstanceId,
    team: Team,
    effect: AbilityEffect,
    ability_name: String,
    priority: TriggerPriority,
    is_from_dead: bool,
    spawn_index_override: Option<usize>,
    trigger_target_id: Option<UnitInstanceId>,
    condition: AbilityCondition,
    /// Index of this ability in the source unit's abilities vec (for tracking trigger counts)
    ability_index: usize,
    /// Max triggers allowed for this ability (None = unlimited)
    max_triggers: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct CombatUnit {
    pub instance_id: UnitInstanceId,
    pub team: Team,
    pub attack: i32,
    pub health: i32,
    pub abilities: Vec<Ability>,
    pub template_id: String,
    pub name: String,
    pub attack_buff: i32,
    pub health_buff: i32,
    pub play_cost: i32,
    /// Tracks how many times each ability has triggered this battle (indexed by ability position)
    pub ability_trigger_counts: Vec<u32>,
    pub is_token: bool,
}

impl CombatUnit {
    fn from_card(card: crate::types::UnitCard) -> Self {
        let ability_count = card.abilities.len();
        Self {
            instance_id: UnitId::player(0), // Placeholder
            team: Team::Player,             // This will be overridden when spawning
            attack: card.stats.attack,
            health: card.stats.health,
            abilities: card.abilities,
            template_id: card.template_id,
            name: card.name,
            attack_buff: 0,
            health_buff: 0,
            play_cost: card.economy.play_cost,
            ability_trigger_counts: vec![0; ability_count],
            is_token: card.is_token,
        }
    }

    fn to_view(&self) -> UnitView {
        UnitView {
            instance_id: self.instance_id,
            template_id: self.template_id.clone(),
            name: self.name.clone(),
            attack: self.effective_attack(),
            health: self.effective_health(),
            abilities: self.abilities.clone(),
            is_token: self.is_token,
        }
    }

    fn effective_attack(&self) -> i32 {
        self.attack.saturating_add(self.attack_buff).max(0)
    }

    fn effective_health(&self) -> i32 {
        self.health.max(0)
    }
}

// ==========================================
// MAIN BATTLE RESOLVER
// ==========================================

pub fn resolve_battle<R: BattleRng>(
    player_board: &[BoardUnit],
    enemy_board: &[BoardUnit],
    rng: &mut R,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut limits = BattleLimits::new();

    // Initialize Units
    let mut player_units: Vec<CombatUnit> = player_board
        .iter()
        .map(|u| {
            let mut cu = CombatUnit::from_card(u.card.clone());
            cu.instance_id = limits.generate_instance_id(Team::Player);
            cu.team = Team::Player;
            cu.health = u.current_health.max(0);
            cu
        })
        .collect();

    let mut enemy_units: Vec<CombatUnit> = enemy_board
        .iter()
        .map(|u| {
            let mut cu = CombatUnit::from_card(u.card.clone());
            cu.instance_id = limits.generate_instance_id(Team::Enemy);
            cu.team = Team::Enemy;
            cu.health = u.current_health.max(0);
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
        rng,
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
            rng,
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
            rng,
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
            rng,
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
        rng,
        &mut limits,
    );
    events
}

fn finalize_with_limit_exceeded(
    events: &mut Vec<CombatEvent>,
    limits: &BattleLimits,
) -> Vec<CombatEvent> {
    let losing_team = limits.limit_exceeded_by;

    if let Some(reason) = &limits.limit_exceeded_reason {
        events.push(CombatEvent::LimitExceeded {
            losing_team,
            reason: reason.clone(),
        });
    }

    events.push(CombatEvent::BattleEnd {
        result: match losing_team {
            Some(Team::Player) => BattleResult::Defeat,
            Some(Team::Enemy) => BattleResult::Victory,
            None => BattleResult::Draw,
        },
    });
    events.drain(..).collect()
}

// ==========================================
// CORE LOGIC: RECURSIVE TRIGGER RESOLUTION
// ==========================================

/// Resolves triggers depth-first.
/// If a trigger causes a state change (Death), we resolve reactions IMMEDIATELY.
fn resolve_trigger_queue<R: BattleRng>(
    queue: &mut Vec<PendingTrigger>,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
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
                (Team::Enemy, Team::Player) => Ordering::Less,
                (Team::Player, Team::Enemy) => Ordering::Greater,
                _ => Ordering::Equal,
            })
            .then(b.priority.unit_position.cmp(&a.priority.unit_position))
            .then(b.priority.ability_order.cmp(&a.priority.ability_order))
    });

    // 2. Iterate
    while let Some(trigger) = queue.pop() {
        // A. Validation: Is source still alive?
        // (We allow dead units to trigger OnFaint, but not living units that died in queue)
        if !trigger.is_from_dead
            && find_unit(trigger.source_id, player_units, enemy_units).is_none()
        {
            continue;
        }

        // B. Trigger Count Check: Has this ability reached its max triggers?
        if let Some(max) = trigger.max_triggers {
            // For living units, check current count
            if let Some(unit) = find_unit_mut(trigger.source_id, player_units, enemy_units) {
                if unit
                    .ability_trigger_counts
                    .get(trigger.ability_index)
                    .copied()
                    .unwrap_or(0)
                    >= max
                {
                    continue; // Already triggered max times
                }
            }
            // For dead units, we can't track (they're removed), so we allow it
            // The count was captured before death if needed
        }

        // C. Condition Check: Does the condition pass?
        if !matches!(trigger.condition, AbilityCondition::None) {
            // Get source unit info for condition evaluation
            let source_opt = find_unit(trigger.source_id, player_units, enemy_units).cloned();

            // For dead units triggering OnFaint, we need to construct a temporary context
            // In this case, source stats are from the trigger priority (captured at death)
            let (allies, enemies): (&[CombatUnit], &[CombatUnit]) = match trigger.team {
                Team::Player => (player_units.as_slice(), enemy_units.as_slice()),
                Team::Enemy => (enemy_units.as_slice(), player_units.as_slice()),
            };

            // Create a temporary source for dead units
            let temp_source;
            let source = if let Some(ref s) = source_opt {
                s
            } else if trigger.is_from_dead {
                // For dead units, create a minimal CombatUnit with captured stats
                temp_source = CombatUnit {
                    instance_id: trigger.source_id,
                    team: trigger.team,
                    attack: trigger.priority.attack,
                    health: trigger.priority.health,
                    abilities: vec![],
                    template_id: String::new(),
                    name: String::new(),
                    attack_buff: 0,
                    health_buff: 0,
                    play_cost: 0,
                    ability_trigger_counts: vec![],
                    is_token: false,
                };
                &temp_source
            } else {
                continue; // Source not found and not from dead, skip
            };

            let ctx = ConditionContext {
                source,
                source_position: trigger.priority.unit_position,
                allies,
                enemies,
            };

            let effect_target = get_effect_target(&trigger.effect);

            if !evaluate_condition(
                &trigger.condition,
                &ctx,
                &effect_target,
                player_units,
                enemy_units,
                rng,
                trigger.trigger_target_id,
                trigger.spawn_index_override,
            ) {
                continue; // Condition not met, skip this trigger
            }
        }

        // D. Emit Trigger Event
        limits.record_trigger(trigger.team)?;
        events.push(CombatEvent::AbilityTrigger {
            source_instance_id: trigger.source_id,
            ability_name: trigger.ability_name,
        });

        // E. Increment trigger count for this ability (if unit is still alive)
        if let Some(unit) = find_unit_mut(trigger.source_id, player_units, enemy_units) {
            if let Some(count) = unit.ability_trigger_counts.get_mut(trigger.ability_index) {
                *count += 1;
            }
        }

        // F. Apply Effect
        let damaged_ids = apply_ability_effect(
            trigger.source_id,
            trigger.team,
            &trigger.effect,
            player_units,
            enemy_units,
            events,
            rng,
            limits,
            trigger.spawn_index_override, // Pass the index where the parent died
            trigger.trigger_target_id,
        )?;

        let mut reaction_queue = Vec::new();

        // Helper to queue OnDamageTaken
        // We process this BEFORE death checks so we can catch units that took fatal damage.
        for unit_id in damaged_ids {
            if let Some(unit) = find_unit(unit_id, player_units, enemy_units) {
                let is_fatal = unit.health <= 0;
                for (sub_idx, ability) in unit.abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnHurt {
                        // Check max_triggers before queuing
                        if let Some(max) = ability.max_triggers {
                            if unit
                                .ability_trigger_counts
                                .get(sub_idx)
                                .copied()
                                .unwrap_or(0)
                                >= max
                            {
                                continue; // Already triggered max times
                            }
                        }
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
                            source_id: unit_id,
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
                            trigger_target_id: Some(trigger.source_id),
                            condition: ability.condition.clone(),
                            ability_index: sub_idx,
                            max_triggers: ability.max_triggers,
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
                        // Check if max triggers already reached before death
                        if let Some(max) = ability.max_triggers {
                            if dead_unit
                                .ability_trigger_counts
                                .get(sub_idx)
                                .copied()
                                .unwrap_or(0)
                                >= max
                            {
                                continue; // Already triggered max times
                            }
                        }
                        q.push(PendingTrigger {
                            source_id: dead_unit.instance_id,
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
                            trigger_target_id: Some(dead_unit.instance_id),
                            condition: ability.condition.clone(),
                            ability_index: sub_idx,
                            max_triggers: ability.max_triggers,
                        });
                    }
                }
            };

        // Collect Player Deaths
        for (idx, dead_unit) in dead_player {
            let dead_id = dead_unit.instance_id;
            queue_on_faint(dead_unit, idx, Team::Player, &mut reaction_queue);
            // Trigger OnAllyFaint for survivors
            for (s_idx, survivor) in player_units.iter().enumerate() {
                for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnAllyFaint {
                        reaction_queue.push(PendingTrigger {
                            source_id: survivor.instance_id,
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
                            trigger_target_id: Some(dead_id),
                            condition: ability.condition.clone(),
                            ability_index: sub_idx,
                            max_triggers: ability.max_triggers,
                        });
                    }
                }
            }
        }
        // Collect Enemy Deaths
        for (idx, dead_unit) in dead_enemy {
            let dead_id = dead_unit.instance_id;
            queue_on_faint(dead_unit, idx, Team::Enemy, &mut reaction_queue);
            // Trigger OnAllyFaint for survivors
            for (s_idx, survivor) in enemy_units.iter().enumerate() {
                for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnAllyFaint {
                        reaction_queue.push(PendingTrigger {
                            source_id: survivor.instance_id,
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
                            trigger_target_id: Some(dead_id),
                            condition: ability.condition.clone(),
                            ability_index: sub_idx,
                            max_triggers: ability.max_triggers,
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

fn apply_ability_effect<R: BattleRng>(
    source_instance_id: UnitInstanceId,
    source_team: Team,
    effect: &AbilityEffect,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
    limits: &mut BattleLimits,
    spawn_index_override: Option<usize>,
    trigger_target_id: Option<UnitInstanceId>,
) -> Result<Vec<UnitInstanceId>, ()> {
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
                trigger_target_id,
                spawn_index_override,
            );
            for target_id in targets {
                if let Some(unit) = find_unit_mut(target_id, player_units, enemy_units) {
                    let actual_damage = (*amount).max(0);
                    if actual_damage > 0 {
                        unit.health = unit.health.saturating_sub(actual_damage);
                        damaged_units.push(target_id);
                        events.push(CombatEvent::AbilityDamage {
                            source_instance_id,
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
                trigger_target_id,
                spawn_index_override,
            );
            for target_id in targets {
                if let Some(unit) = find_unit_mut(target_id, player_units, enemy_units) {
                    unit.attack_buff = unit.attack_buff.saturating_add(*attack);
                    unit.health = unit.health.saturating_add(*health);
                    unit.health_buff = unit.health_buff.saturating_add(*health);
                    events.push(CombatEvent::AbilityModifyStats {
                        source_instance_id,
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

            // 1. Create the unit and determine its insertion point
            let (new_unit, safe_idx) = {
                let my_board = match source_team {
                    Team::Player => &mut *player_units,
                    Team::Enemy => &mut *enemy_units,
                };

                if my_board.len() >= BOARD_SIZE {
                    return Ok(damaged_units);
                }

                // Create Unit Logic
                let templates = crate::units::get_starter_templates();
                let template = templates
                    .into_iter()
                    .find(|t| t.template_id == *template_id)
                    .expect("Spawn template not found");

                let next_id = limits.generate_instance_id(source_team);
                let instance_id = next_id;

                let mut card = crate::types::UnitCard::new(
                    instance_id.0.wrapping_mul(5000),
                    template.template_id,
                    template.name,
                    template.attack,
                    template.health,
                    template.play_cost,
                    template.pitch_value,
                    template.is_token,
                );
                for ability in &template.abilities {
                    card = card.with_ability(ability.clone());
                }

                let mut new_unit = CombatUnit::from_card(card);
                new_unit.instance_id = instance_id;
                new_unit.team = source_team;

                // INSERTION LOGIC: Use override if provided (e.g. Zombie Cricket), otherwise Front (e.g. Spawner)
                let insert_idx = spawn_index_override.unwrap_or(0);
                let safe_idx = core::cmp::min(insert_idx, my_board.len());

                my_board.insert(safe_idx, new_unit.clone());

                // Log Spawn
                events.push(CombatEvent::UnitSpawn {
                    team: source_team,
                    spawned_unit: new_unit.to_view(),
                    new_board_state: my_board.iter().map(|u| u.to_view()).collect(),
                });

                (new_unit, safe_idx)
            };

            // 2. TRIGGER REACTIONS: OnSpawn for the spawned unit, OnAllySpawn for others
            // We do this AFTER dropping the 'my_board' borrow
            let mut reactions = Vec::new();
            let spawned_id = new_unit.instance_id;

            {
                let my_board = match source_team {
                    Team::Player => &mut *player_units,
                    Team::Enemy => &mut *enemy_units,
                };

                // 1. OnSpawn for the new unit itself
                for (sub_idx, ability) in my_board[safe_idx].abilities.iter().enumerate() {
                    if ability.trigger == AbilityTrigger::OnSpawn {
                        reactions.push(PendingTrigger {
                            source_id: spawned_id,
                            team: source_team,
                            effect: ability.effect.clone(),
                            ability_name: ability.name.clone(),
                            priority: TriggerPriority {
                                attack: my_board[safe_idx].effective_attack(),
                                health: my_board[safe_idx].effective_health(),
                                unit_position: safe_idx,
                                ability_order: sub_idx,
                            },
                            is_from_dead: false,
                            spawn_index_override: None,
                            trigger_target_id: Some(spawned_id),
                            condition: ability.condition.clone(),
                            ability_index: sub_idx,
                            max_triggers: ability.max_triggers,
                        });
                    }
                }

                // 2. OnAllySpawn for existing units
                for (i, unit) in my_board.iter().enumerate() {
                    if unit.instance_id == spawned_id {
                        continue;
                    }
                    for (sub_idx, ability) in unit.abilities.iter().enumerate() {
                        if ability.trigger == AbilityTrigger::OnAllySpawn {
                            reactions.push(PendingTrigger {
                                source_id: unit.instance_id,
                                team: source_team,
                                effect: ability.effect.clone(),
                                ability_name: ability.name.clone(),
                                priority: TriggerPriority {
                                    attack: unit.effective_attack(),
                                    health: unit.effective_health(),
                                    unit_position: i,
                                    ability_order: sub_idx,
                                },
                                is_from_dead: false,
                                spawn_index_override: None,
                                trigger_target_id: Some(spawned_id),
                                condition: ability.condition.clone(),
                                ability_index: sub_idx,
                                max_triggers: ability.max_triggers,
                            });
                        }
                    }
                }

                // 3. OnEnemySpawn for units on the opposite team
                let opposing_board = match source_team {
                    Team::Player => &mut *enemy_units,
                    Team::Enemy => &mut *player_units,
                };
                let opposing_team = match source_team {
                    Team::Player => Team::Enemy,
                    Team::Enemy => Team::Player,
                };

                for (i, unit) in opposing_board.iter().enumerate() {
                    for (sub_idx, ability) in unit.abilities.iter().enumerate() {
                        if ability.trigger == AbilityTrigger::OnEnemySpawn {
                            reactions.push(PendingTrigger {
                                source_id: unit.instance_id,
                                team: opposing_team,
                                effect: ability.effect.clone(),
                                ability_name: ability.name.clone(),
                                priority: TriggerPriority {
                                    attack: unit.effective_attack(),
                                    health: unit.effective_health(),
                                    unit_position: i,
                                    ability_order: sub_idx,
                                },
                                is_from_dead: false,
                                spawn_index_override: None,
                                trigger_target_id: Some(spawned_id),
                                condition: ability.condition.clone(),
                                ability_index: sub_idx,
                                max_triggers: ability.max_triggers,
                            });
                        }
                    }
                }
            }

            if !reactions.is_empty() {
                limits.enter_trigger_depth(source_team)?;
                resolve_trigger_queue(
                    &mut reactions,
                    player_units,
                    enemy_units,
                    events,
                    rng,
                    limits,
                )?;
                limits.exit_trigger_depth();
            }

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
                trigger_target_id,
                spawn_index_override,
            );
            for target_id in targets {
                if let Some(unit) = find_unit_mut(target_id, player_units, enemy_units) {
                    let fatal = unit.health;
                    unit.health = unit.health.saturating_sub(fatal);
                    events.push(CombatEvent::AbilityDamage {
                        source_instance_id,
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

fn execute_phase<R: BattleRng>(
    phase: BattlePhase,
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    if phase != BattlePhase::End {
        events.push(CombatEvent::PhaseStart { phase });
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
                (false, true) => BattleResult::Victory,
                (true, false) => BattleResult::Defeat,
                _ => BattleResult::Draw,
            };
            events.push(CombatEvent::BattleEnd { result });
        }
    }

    if phase != BattlePhase::End {
        events.push(CombatEvent::PhaseEnd { phase });
    }
    Ok(())
}

fn collect_and_resolve_triggers<R: BattleRng>(
    trigger_types: &[AbilityTrigger],
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
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
                        source_id: u.instance_id,
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
                        trigger_target_id: None,
                        condition: ability.condition.clone(),
                        ability_index: sub_idx,
                        max_triggers: ability.max_triggers,
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

    let p_id = p.instance_id;
    let e_id = e.instance_id;

    // Apply Dmg
    player_units[0].health = player_units[0].health.saturating_sub(e_dmg);
    enemy_units[0].health = enemy_units[0].health.saturating_sub(p_dmg);

    events.push(CombatEvent::DamageTaken {
        target_instance_id: p_id,
        team: Team::Player,
        remaining_hp: player_units[0].health,
    });
    events.push(CombatEvent::DamageTaken {
        target_instance_id: e_id,
        team: Team::Enemy,
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
            team: Team::Player,
            new_board_state: player_units.iter().map(|u| u.to_view()).collect(),
        });
    }
    if !enemy_dead.is_empty() {
        events.push(CombatEvent::UnitDeath {
            team: Team::Enemy,
            new_board_state: enemy_units.iter().map(|u| u.to_view()).collect(),
        });
    }

    (player_dead, enemy_dead)
}

fn resolve_hurt_and_faint_loop<R: BattleRng>(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
    limits: &mut BattleLimits,
) -> Result<(), ()> {
    // CAPTURE clashing unit IDs before they potentially die or board slides
    let clashing_p_id = player_units.first().map(|u| u.instance_id);
    let clashing_e_id = enemy_units.first().map(|u| u.instance_id);

    let (dead_player, dead_enemy) = execute_death_check_phase(player_units, enemy_units, events);

    // Build the initial reaction queue from the Clash deaths AND DAMAGE
    let mut queue = Vec::new();

    // Check for OnHurt for the clashing units
    let mut check_clash_damage = |id: Option<UnitInstanceId>,
                                  dealer_id: Option<UnitInstanceId>,
                                  team: Team,
                                  units: &[CombatUnit],
                                  dead: &[(usize, CombatUnit)]| {
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
                    if a.trigger == AbilityTrigger::OnHurt {
                        // Check max_triggers before queuing
                        if let Some(max) = a.max_triggers {
                            if u.ability_trigger_counts.get(sub_idx).copied().unwrap_or(0) >= max {
                                continue; // Already triggered max times
                            }
                        }
                        // Find current index if survivor, otherwise 0
                        let current_idx = units
                            .iter()
                            .position(|survivor| survivor.instance_id == target_id)
                            .unwrap_or(0);

                        queue.push(PendingTrigger {
                            source_id: target_id,
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
                            spawn_index_override: if is_dead { Some(current_idx) } else { None },
                            trigger_target_id: dealer_id,
                            condition: a.condition.clone(),
                            ability_index: sub_idx,
                            max_triggers: a.max_triggers,
                        });
                    }
                }
            }
        }
    };

    check_clash_damage(
        clashing_p_id,
        clashing_e_id,
        Team::Player,
        player_units,
        &dead_player,
    );
    check_clash_damage(
        clashing_e_id,
        clashing_p_id,
        Team::Enemy,
        enemy_units,
        &dead_enemy,
    );

    if dead_player.is_empty() && dead_enemy.is_empty() && queue.is_empty() {
        return Ok(());
    }

    for (idx, u) in dead_player {
        for (sub_idx, a) in u.abilities.iter().enumerate() {
            if a.trigger == AbilityTrigger::OnFaint {
                // Check if max triggers already reached before death
                if let Some(max) = a.max_triggers {
                    if u.ability_trigger_counts.get(sub_idx).copied().unwrap_or(0) >= max {
                        continue; // Already triggered max times
                    }
                }
                queue.push(PendingTrigger {
                    source_id: u.instance_id,
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
                    trigger_target_id: Some(u.instance_id),
                    condition: a.condition.clone(),
                    ability_index: sub_idx,
                    max_triggers: a.max_triggers,
                });
            }
        }
        // Scan Survivors for OnAllyFaint
        for (s_idx, survivor) in player_units.iter().enumerate() {
            for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                if ability.trigger == AbilityTrigger::OnAllyFaint {
                    queue.push(PendingTrigger {
                        source_id: survivor.instance_id,
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
                        trigger_target_id: Some(u.instance_id), // u is the dead ally
                        condition: ability.condition.clone(),
                        ability_index: sub_idx,
                        max_triggers: ability.max_triggers,
                    });
                }
            }
        }
    }
    for (idx, u) in dead_enemy {
        for (sub_idx, a) in u.abilities.iter().enumerate() {
            if a.trigger == AbilityTrigger::OnFaint {
                // Check if max triggers already reached before death
                if let Some(max) = a.max_triggers {
                    if u.ability_trigger_counts.get(sub_idx).copied().unwrap_or(0) >= max {
                        continue; // Already triggered max times
                    }
                }
                queue.push(PendingTrigger {
                    source_id: u.instance_id,
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
                    trigger_target_id: Some(u.instance_id),
                    condition: a.condition.clone(),
                    ability_index: sub_idx,
                    max_triggers: a.max_triggers,
                });
            }
        }
        // Scan Survivors for OnAllyFaint
        for (s_idx, survivor) in enemy_units.iter().enumerate() {
            for (sub_idx, ability) in survivor.abilities.iter().enumerate() {
                if ability.trigger == AbilityTrigger::OnAllyFaint {
                    queue.push(PendingTrigger {
                        source_id: survivor.instance_id,
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
                        trigger_target_id: Some(u.instance_id), // u is the dead ally
                        condition: ability.condition.clone(),
                        ability_index: sub_idx,
                        max_triggers: ability.max_triggers,
                    });
                }
            }
        }
    }

    resolve_trigger_queue(&mut queue, player_units, enemy_units, events, rng, limits)
}

fn get_targets<R: BattleRng>(
    source_instance_id: UnitInstanceId,
    source_team: Team,
    target: &AbilityTarget,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    rng: &mut R,
    trigger_target_id: Option<UnitInstanceId>,
    source_position_override: Option<usize>,
) -> Vec<UnitInstanceId> {
    match target {
        AbilityTarget::Position { scope, index } => {
            if *scope == TargetScope::SelfUnit {
                resolve_relative_position(
                    source_instance_id,
                    source_team,
                    *index,
                    player_units,
                    enemy_units,
                    source_position_override,
                )
            } else {
                resolve_absolute_position(*scope, source_team, *index, player_units, enemy_units)
            }
        }
        AbilityTarget::Adjacent { scope: _ } => {
            // Stub implementation as per instructions
            vec![]
        }
        AbilityTarget::Random { scope, count } => {
            let candidates = resolve_scope_ids(
                *scope,
                source_instance_id,
                source_team,
                player_units,
                enemy_units,
                trigger_target_id,
            );
            if candidates.is_empty() {
                return vec![];
            }
            let actual_count = (*count as usize).min(candidates.len());
            let mut results = candidates;
            rng.shuffle(&mut results);
            results.truncate(actual_count);
            results
        }
        AbilityTarget::Standard {
            scope,
            stat,
            order,
            count,
        } => resolve_stat_based(
            *scope,
            source_instance_id,
            source_team,
            *stat,
            *order,
            *count,
            player_units,
            enemy_units,
            trigger_target_id,
        ),
        AbilityTarget::All { scope } => resolve_scope_ids(
            *scope,
            source_instance_id,
            source_team,
            player_units,
            enemy_units,
            trigger_target_id,
        ),
    }
}

// ==========================================
// TARGETING HELPERS
// ==========================================

fn resolve_scope_ids(
    scope: TargetScope,
    source_id: UnitInstanceId,
    source_team: Team,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    trigger_target_id: Option<UnitInstanceId>,
) -> Vec<UnitInstanceId> {
    resolve_scope_units(
        scope,
        source_id,
        source_team,
        player_units,
        enemy_units,
        trigger_target_id,
    )
    .iter()
    .map(|u| u.instance_id)
    .collect()
}

fn resolve_scope_units<'a>(
    scope: TargetScope,
    source_id: UnitInstanceId,
    source_team: Team,
    player_units: &'a [CombatUnit],
    enemy_units: &'a [CombatUnit],
    trigger_target_id: Option<UnitInstanceId>,
) -> Vec<&'a CombatUnit> {
    let (allies, enemies) = match source_team {
        Team::Player => (player_units, enemy_units),
        Team::Enemy => (enemy_units, player_units),
    };

    match scope {
        TargetScope::SelfUnit => {
            if let Some(u) = find_unit_in_slices(source_id, player_units, enemy_units) {
                vec![u]
            } else {
                vec![]
            }
        }
        TargetScope::Allies => allies.iter().collect(),
        TargetScope::Enemies => enemies.iter().collect(),
        TargetScope::All => player_units.iter().chain(enemy_units.iter()).collect(),
        TargetScope::AlliesOther => allies
            .iter()
            .filter(|u| u.instance_id != source_id)
            .collect(),
        TargetScope::TriggerSource | TargetScope::Aggressor => {
            if let Some(tid) = trigger_target_id {
                if let Some(u) = find_unit_in_slices(tid, player_units, enemy_units) {
                    vec![u]
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        }
    }
}

fn find_unit_in_slices<'a>(
    instance_id: UnitInstanceId,
    player_units: &'a [CombatUnit],
    enemy_units: &'a [CombatUnit],
) -> Option<&'a CombatUnit> {
    player_units
        .iter()
        .chain(enemy_units.iter())
        .find(|u| u.instance_id == instance_id)
}

fn resolve_relative_position(
    source_id: UnitInstanceId,
    source_team: Team,
    index: i32,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    source_position_override: Option<usize>,
) -> Vec<UnitInstanceId> {
    let allies = match source_team {
        Team::Player => player_units,
        Team::Enemy => enemy_units,
    };

    let pos = allies
        .iter()
        .position(|u| u.instance_id == source_id)
        .or(source_position_override);

    if let Some(pos) = pos {
        let is_alive = allies.iter().any(|u| u.instance_id == source_id);
        let target_idx = if index == -1 {
            // Ahead
            if is_alive {
                if pos > 0 {
                    Some(pos - 1)
                } else {
                    None
                }
            } else {
                // Dead unit removed, pos-1 is still pos-1
                if pos > 0 {
                    Some(pos - 1)
                } else {
                    None
                }
            }
        } else if index == 1 {
            // Behind
            if is_alive {
                if pos + 1 < allies.len() {
                    Some(pos + 1)
                } else {
                    None
                }
            } else {
                // Dead unit removed, pos+1 is now pos
                if pos < allies.len() {
                    Some(pos)
                } else {
                    None
                }
            }
        } else if index == 0 {
            if is_alive {
                Some(pos)
            } else {
                None
            }
        } else {
            None
        };

        if let Some(idx) = target_idx {
            if idx < allies.len() {
                return vec![allies[idx].instance_id];
            }
        }
    }
    vec![]
}

fn resolve_absolute_position(
    scope: TargetScope,
    source_team: Team,
    index: i32,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
) -> Vec<UnitInstanceId> {
    let targets = match (scope, source_team) {
        (TargetScope::Allies, Team::Player) | (TargetScope::Enemies, Team::Enemy) => player_units,
        (TargetScope::Allies, Team::Enemy) | (TargetScope::Enemies, Team::Player) => enemy_units,
        _ => return vec![],
    };

    if targets.is_empty() {
        return vec![];
    }

    let idx = if index == -1 {
        targets.len().saturating_sub(1)
    } else {
        index as usize
    };

    if idx < targets.len() {
        vec![targets[idx].instance_id]
    } else {
        vec![]
    }
}

fn resolve_stat_based(
    scope: TargetScope,
    source_id: UnitInstanceId,
    source_team: Team,
    stat: StatType,
    order: SortOrder,
    count: u32,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    trigger_target_id: Option<UnitInstanceId>,
) -> Vec<UnitInstanceId> {
    let mut units = resolve_scope_units(
        scope,
        source_id,
        source_team,
        player_units,
        enemy_units,
        trigger_target_id,
    );
    if units.is_empty() {
        return vec![];
    }

    units.sort_by(|a, b| {
        let val_a = get_stat_value(a, stat);
        let val_b = get_stat_value(b, stat);
        match order {
            SortOrder::Ascending => val_a.cmp(&val_b),
            SortOrder::Descending => val_b.cmp(&val_a),
        }
    });

    units
        .into_iter()
        .take(count as usize)
        .map(|u| u.instance_id)
        .collect()
}

fn get_stat_value(unit: &CombatUnit, stat: StatType) -> i32 {
    match stat {
        StatType::Health => unit.effective_health(),
        StatType::Attack => unit.effective_attack(),
        StatType::Mana => unit.play_cost,
    }
}

// ==========================================
// CONDITION EVALUATION
// ==========================================

/// Context for evaluating conditions
#[allow(dead_code)]
struct ConditionContext<'a> {
    source: &'a CombatUnit,
    source_position: usize,
    allies: &'a [CombatUnit],
    enemies: &'a [CombatUnit],
}

/// Evaluates a condition given the context.
fn evaluate_condition<R: BattleRng>(
    condition: &AbilityCondition,
    ctx: &ConditionContext,
    target: &AbilityTarget,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    rng: &mut R,
    trigger_target_id: Option<UnitInstanceId>,
    source_position_override: Option<usize>,
) -> bool {
    match condition {
        AbilityCondition::None => true,
        AbilityCondition::StatValueCompare {
            scope,
            stat,
            op,
            value,
        } => {
            if *scope == TargetScope::SelfUnit {
                compare_i32(get_stat_value(ctx.source, *stat), *op, *value)
            } else {
                let targets = get_targets(
                    ctx.source.instance_id,
                    ctx.source.team,
                    target,
                    player_units,
                    enemy_units,
                    rng,
                    trigger_target_id,
                    source_position_override,
                );
                if targets.is_empty() {
                    return false;
                }
                targets.iter().any(|tid| {
                    if let Some(u) = find_unit_in_slices(*tid, player_units, enemy_units) {
                        compare_i32(get_stat_value(u, *stat), *op, *value)
                    } else {
                        false
                    }
                })
            }
        }
        AbilityCondition::StatStatCompare {
            source_stat,
            op,
            target_scope: _,
            target_stat,
        } => {
            let targets = get_targets(
                ctx.source.instance_id,
                ctx.source.team,
                target,
                player_units,
                enemy_units,
                rng,
                trigger_target_id,
                source_position_override,
            );
            if let Some(tid) = targets.first() {
                if let Some(u) = find_unit_in_slices(*tid, player_units, enemy_units) {
                    compare_i32(
                        get_stat_value(ctx.source, *source_stat),
                        *op,
                        get_stat_value(u, *target_stat),
                    )
                } else {
                    false
                }
            } else {
                false
            }
        }
        AbilityCondition::UnitCount { scope, op, value } => {
            let count = resolve_scope_ids(
                *scope,
                ctx.source.instance_id,
                ctx.source.team,
                player_units,
                enemy_units,
                trigger_target_id,
            )
            .len() as u32;
            compare_u32(count, *op, *value)
        }
        AbilityCondition::IsPosition { scope: _, index } => {
            let allies = if ctx.source.team == Team::Player {
                ctx.allies
            } else {
                ctx.allies
            };
            let actual_idx = if *index == -1 {
                allies.len().saturating_sub(1)
            } else {
                *index as usize
            };
            ctx.source_position == actual_idx
        }
        AbilityCondition::And { left, right } => {
            evaluate_condition(
                left,
                ctx,
                target,
                player_units,
                enemy_units,
                rng,
                trigger_target_id,
                source_position_override,
            ) && evaluate_condition(
                right,
                ctx,
                target,
                player_units,
                enemy_units,
                rng,
                trigger_target_id,
                source_position_override,
            )
        }
        AbilityCondition::Or { left, right } => {
            evaluate_condition(
                left,
                ctx,
                target,
                player_units,
                enemy_units,
                rng,
                trigger_target_id,
                source_position_override,
            ) || evaluate_condition(
                right,
                ctx,
                target,
                player_units,
                enemy_units,
                rng,
                trigger_target_id,
                source_position_override,
            )
        }
        AbilityCondition::Not { inner } => !evaluate_condition(
            inner,
            ctx,
            target,
            player_units,
            enemy_units,
            rng,
            trigger_target_id,
            source_position_override,
        ),
    }
}

fn compare_i32(a: i32, op: CompareOp, b: i32) -> bool {
    match op {
        CompareOp::GreaterThan => a > b,
        CompareOp::LessThan => a < b,
        CompareOp::Equal => a == b,
        CompareOp::GreaterThanOrEqual => a >= b,
        CompareOp::LessThanOrEqual => a <= b,
    }
}

fn compare_u32(a: u32, op: CompareOp, b: u32) -> bool {
    match op {
        CompareOp::GreaterThan => a > b,
        CompareOp::LessThan => a < b,
        CompareOp::Equal => a == b,
        CompareOp::GreaterThanOrEqual => a >= b,
        CompareOp::LessThanOrEqual => a <= b,
    }
}

/// Helper to get the target from an effect
fn get_effect_target(effect: &AbilityEffect) -> AbilityTarget {
    match effect {
        AbilityEffect::Damage { target, .. } => target.clone(),
        AbilityEffect::ModifyStats { target, .. } => target.clone(),
        AbilityEffect::SpawnUnit { .. } => AbilityTarget::All {
            scope: TargetScope::SelfUnit,
        },
        AbilityEffect::Destroy { target } => target.clone(),
    }
}

fn find_unit<'a>(
    instance_id: UnitInstanceId,
    player_units: &'a Vec<CombatUnit>,
    enemy_units: &'a Vec<CombatUnit>,
) -> Option<&'a CombatUnit> {
    player_units
        .iter()
        .chain(enemy_units.iter())
        .find(|u| u.instance_id == instance_id)
}

fn find_unit_mut<'a>(
    instance_id: UnitInstanceId,
    player_units: &'a mut Vec<CombatUnit>,
    enemy_units: &'a mut Vec<CombatUnit>,
) -> Option<&'a mut CombatUnit> {
    player_units
        .iter_mut()
        .chain(enemy_units.iter_mut())
        .find(|u| u.instance_id == instance_id)
}
