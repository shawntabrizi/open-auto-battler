//! Battle resolution system
//!
//! This module handles combat resolution between player and enemy units.

use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
use scale_info::TypeInfo;

use crate::limits::{BattleLimits, LimitReason};
use crate::rng::BattleRng;
use crate::state::BOARD_SIZE;
use alloc::collections::BTreeMap;

use crate::types::{
    Ability, AbilityEffect, AbilityTarget, AbilityTrigger, CardId, CompareOp, Condition, Matcher,
    SortOrder, SpawnLocation, StatType, TargetScope, UnitCard,
};

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

// Re-export Team for battle module consumers
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
    PartialOrd,
    Ord,
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
    pub card_id: crate::types::CardId,
    pub name: String,
    pub attack: i32,
    pub health: i32,
    pub battle_abilities: Vec<Ability>,
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
#[cfg_attr(feature = "std", serde(tag = "type", content = "payload"))]
pub enum CombatEvent {
    PhaseStart {
        phase: BattlePhase,
    },
    PhaseEnd {
        phase: BattlePhase,
    },
    AbilityTrigger {
        source_instance_id: UnitInstanceId,
        ability_index: u32,
    },
    Clash {
        p_dmg: i32,
        e_dmg: i32,
    },
    DamageTaken {
        target_instance_id: UnitInstanceId,
        team: Team,
        remaining_hp: i32,
    },
    UnitDeath {
        team: Team,
        new_board_state: Vec<UnitView>,
    },
    BattleEnd {
        result: BattleResult,
    },
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
    AbilityModifyStatsPermanent {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
        health_change: i32,
        attack_change: i32,
        new_attack: i32,
        new_health: i32,
    },
    AbilityDestroy {
        source_instance_id: UnitInstanceId,
        target_instance_id: UnitInstanceId,
    },
    AbilityGainMana {
        source_instance_id: UnitInstanceId,
        team: Team,
        amount: i32,
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

#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Encode,
    Decode,
    DecodeWithMemTracking,
    TypeInfo,
    MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum BattlePhase {
    Start,
    BeforeAttack,
    Attack,
    End,
}

/// Priority data used for sorting triggers
#[derive(Debug)]
struct TriggerPriority {
    attack: i32,
    health: i32,
    unit_position: usize,
    ability_order: usize,
    /// Random value assigned per-trigger for fair tiebreaking (from seed)
    tiebreaker: u32,
}

/// Trigger struct with support for location-based spawning.
/// All captured triggers fire regardless of source liveness (stack semantics).
#[derive(Debug)]
struct PendingTrigger {
    source_id: UnitInstanceId,
    team: Team,
    effect: AbilityEffect,
    priority: TriggerPriority,
    spawn_index_override: Option<usize>,
    trigger_target_id: Option<UnitInstanceId>,
    conditions: Vec<Condition>,
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
    pub card_id: crate::types::CardId,
    pub attack_buff: i32,
    pub health_buff: i32,
    pub play_cost: i32,
    /// Tracks how many times each ability has triggered this battle (indexed by ability position)
    pub ability_trigger_counts: Vec<u32>,
}

impl CombatUnit {
    pub fn from_card(card: crate::types::UnitCard) -> Self {
        let ability_count = card.battle_abilities.len();
        Self {
            instance_id: UnitId::player(0), // Placeholder
            team: Team::Player,             // This will be overridden when spawning
            attack: card.stats.attack,
            health: card.stats.health,
            abilities: card.battle_abilities,
            card_id: card.id,
            attack_buff: 0,
            health_buff: 0,
            play_cost: card.economy.play_cost,
            ability_trigger_counts: vec![0; ability_count],
        }
    }

    fn to_view(&self, card_pool: &BTreeMap<CardId, UnitCard>) -> UnitView {
        let name = card_pool
            .get(&self.card_id)
            .map(|c| c.name.clone())
            .unwrap_or_default();
        UnitView {
            instance_id: self.instance_id,
            card_id: self.card_id,
            name,
            attack: self.effective_attack(),
            health: self.effective_health(),
            battle_abilities: self.abilities.clone(),
        }
    }

    fn effective_attack(&self) -> i32 {
        self.attack.saturating_add(self.attack_buff).max(0)
    }

    pub fn effective_health(&self) -> i32 {
        self.health.max(0)
    }

    pub fn is_alive(&self) -> bool {
        self.health > 0
    }

    pub fn take_damage(&mut self, amount: i32) {
        let actual_damage = amount.max(0);
        self.health = self.health.saturating_sub(actual_damage);
    }
}

// ==========================================
// TRIGGER REGISTRY (Observer/Pub-Sub)
// ==========================================

/// Maps trigger types to subscribed units for O(1) trigger relevance checks.
/// Unused triggers cost zero — no iteration over non-subscribing units.
struct TriggerRegistry {
    buckets: [Vec<UnitInstanceId>; crate::types::TRIGGER_VARIANT_COUNT],
}

impl TriggerRegistry {
    fn new() -> Self {
        Self {
            buckets: core::array::from_fn(|_| Vec::new()),
        }
    }

    fn register_unit(&mut self, unit: &CombatUnit) {
        for ability in &unit.abilities {
            self.buckets[ability.trigger.index()].push(unit.instance_id);
        }
    }

    fn unregister_unit(&mut self, instance_id: UnitInstanceId) {
        for bucket in &mut self.buckets {
            bucket.retain(|id| *id != instance_id);
        }
    }

    fn has_subscribers(&self, trigger: AbilityTrigger) -> bool {
        !self.buckets[trigger.index()].is_empty()
    }
}

// ==========================================
// TRIGGER CAPTURE HELPERS
// ==========================================

/// Build PendingTrigger entries for all abilities on `unit` that match `trigger_type`.
/// Checks `max_triggers` before queuing. Replaces all manual trigger-collection loops.
fn capture_triggers_for_unit(
    unit: &CombatUnit,
    unit_position: usize,
    team: Team,
    trigger_type: AbilityTrigger,
    trigger_target_id: Option<UnitInstanceId>,
    spawn_index_override: Option<usize>,
) -> Vec<PendingTrigger> {
    let mut triggers = Vec::new();
    for (sub_idx, ability) in unit.abilities.iter().enumerate() {
        if ability.trigger != trigger_type {
            continue;
        }
        if let Some(max) = ability.max_triggers {
            if unit
                .ability_trigger_counts
                .get(sub_idx)
                .copied()
                .unwrap_or(0)
                >= max
            {
                continue;
            }
        }
        triggers.push(PendingTrigger {
            source_id: unit.instance_id,
            team,
            effect: ability.effect.clone(),
            priority: TriggerPriority {
                attack: unit.effective_attack(),
                health: unit.effective_health(),
                unit_position,
                ability_order: sub_idx,
                tiebreaker: 0,
            },
            spawn_index_override,
            trigger_target_id,
            conditions: ability.conditions.clone(),
            ability_index: sub_idx,
            max_triggers: ability.max_triggers,
        });
    }
    triggers
}

/// Find a unit by instance ID and return its position and a reference.
fn find_unit_with_position(
    id: UnitInstanceId,
    units: &[CombatUnit],
) -> Option<(usize, &CombatUnit)> {
    units.iter().enumerate().find(|(_, u)| u.instance_id == id)
}

// ==========================================
// MAIN BATTLE RESOLVER
// ==========================================

pub fn resolve_battle<R: BattleRng>(
    mut player_units: Vec<CombatUnit>,
    mut enemy_units: Vec<CombatUnit>,
    rng: &mut R,
    card_pool: &BTreeMap<CardId, UnitCard>,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut limits = BattleLimits::new();

    // Assign stable instance IDs and teams if not already set
    // Note: This assumes the input units might have placeholder IDs/teams.
    for unit in &mut player_units {
        unit.instance_id = limits.generate_instance_id(Team::Player);
        unit.team = Team::Player;
    }
    for unit in &mut enemy_units {
        unit.instance_id = limits.generate_instance_id(Team::Enemy);
        unit.team = Team::Enemy;
    }

    // Build trigger registry from initial boards
    let mut registry = TriggerRegistry::new();
    for unit in player_units.iter() {
        registry.register_unit(unit);
    }
    for unit in enemy_units.iter() {
        registry.register_unit(unit);
    }

    // 1. Start of Battle Phase
    limits.reset_phase_counters();
    if execute_phase(
        BattlePhase::Start,
        &mut player_units,
        &mut enemy_units,
        &mut events,
        rng,
        &mut limits,
        card_pool,
        None,
        &mut registry,
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

        // Capture front unit IDs before any triggers fire this round
        let pre_clash = ClashContext::capture(&player_units, &enemy_units);

        // Before Attack — clash context = who is about to clash
        limits.reset_phase_counters();
        if execute_phase(
            BattlePhase::BeforeAttack,
            &mut player_units,
            &mut enemy_units,
            &mut events,
            rng,
            &mut limits,
            card_pool,
            Some(pre_clash),
            &mut registry,
        )
        .is_err()
            || limits.is_exceeded()
        {
            return finalize_with_limit_exceeded(&mut events, &limits);
        }

        // The Clash (Attack) — all after-attack triggers are captured eagerly
        // inside resolve_hurt_and_faint_loop before the death check.
        limits.reset_phase_counters();
        if execute_phase(
            BattlePhase::Attack,
            &mut player_units,
            &mut enemy_units,
            &mut events,
            rng,
            &mut limits,
            card_pool,
            None,
            &mut registry,
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
        card_pool,
        None,
        &mut registry,
    );
    events
}

/// Extract total next-shop mana delta for a team from battle events.
pub fn shop_mana_delta_from_events(events: &[CombatEvent], team: Team) -> i32 {
    let mut total = 0_i32;
    for event in events {
        if let CombatEvent::AbilityGainMana {
            team: event_team,
            amount,
            ..
        } = event
        {
            if *event_team == team {
                total = total.saturating_add(*amount);
            }
        }
    }
    total
}

/// Convenience helper for the local player's next-shop mana delta.
pub fn player_shop_mana_delta_from_events(events: &[CombatEvent]) -> i32 {
    shop_mana_delta_from_events(events, Team::Player)
}

/// Extract total permanent stat deltas for a team's units from battle events.
pub fn permanent_stat_deltas_from_events(
    events: &[CombatEvent],
    team: Team,
) -> BTreeMap<UnitId, (i32, i32)> {
    let mut deltas: BTreeMap<UnitId, (i32, i32)> = BTreeMap::new();
    for event in events {
        let CombatEvent::AbilityModifyStatsPermanent {
            target_instance_id,
            health_change,
            attack_change,
            ..
        } = event
        else {
            continue;
        };

        if target_instance_id.is_player() != (team == Team::Player) {
            continue;
        }

        let entry = deltas.entry(*target_instance_id).or_insert((0, 0));
        entry.0 = entry.0.saturating_add(*attack_change);
        entry.1 = entry.1.saturating_add(*health_change);
    }
    deltas
}

/// Convenience helper for permanent deltas applied to the local player's board.
pub fn player_permanent_stat_deltas_from_events(
    events: &[CombatEvent],
) -> BTreeMap<UnitId, (i32, i32)> {
    permanent_stat_deltas_from_events(events, Team::Player)
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
    graveyard: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
    limits: &mut BattleLimits,
    card_pool: &BTreeMap<CardId, UnitCard>,
    registry: &mut TriggerRegistry,
) -> Result<(), ()> {
    // Trigger Priority:
    // 1. Attack (Highest First) -> Ascending Sort
    // 2. Health (Highest First) -> Ascending Sort
    // 3. Position (Front First) -> Descending Sort (Index 1 < Index 0 so 0 ends up at back)
    // 4. Random Tiebreaker      -> Per-unit value based on seed + unit ID (fair cross-team tiebreaker)
    // 5. Ability Order          -> Descending Sort (First ability ends up at back)
    // Pop takes from the end.
    //
    // IMPORTANT: Tiebreaker comes BEFORE ability_order so that once a unit "wins" priority,
    // ALL of its abilities resolve before moving to the next unit. This prevents interleaving
    // abilities from different units with the same stats/position.

    // Assign tiebreaker to each trigger based on seed + unit identity.
    // We rotate the ID before XORing to ensure the team bit (bit 31) mixes with
    // different bits of the random base, preventing consistent team bias.
    let random_base = rng.next_u32();
    for trigger in queue.iter_mut() {
        // Rotate ID by 16 bits so team bit (31) moves to bit 15, mixing fairly with random_base
        trigger.priority.tiebreaker = random_base ^ trigger.source_id.raw().rotate_left(16);
    }

    queue.sort_by(|a, b| {
        a.priority
            .attack
            .cmp(&b.priority.attack)
            .then(a.priority.health.cmp(&b.priority.health))
            .then(b.priority.unit_position.cmp(&a.priority.unit_position))
            .then(a.priority.tiebreaker.cmp(&b.priority.tiebreaker))
            .then(b.priority.ability_order.cmp(&a.priority.ability_order))
    });

    // 2. Iterate — all captured triggers fire (stack semantics).
    while let Some(trigger) = queue.pop() {
        // A. Trigger Count Check + B. Condition Check (single lookup scope)
        {
            // Look up source on the board, or in the graveyard if dead.
            let source = find_unit(trigger.source_id, player_units, enemy_units).or_else(|| {
                graveyard
                    .iter()
                    .find(|u| u.instance_id == trigger.source_id)
            });

            // Check max_triggers (if source is found; dead/gone units are allowed)
            if let Some(max) = trigger.max_triggers {
                if let Some(unit) = source {
                    if unit
                        .ability_trigger_counts
                        .get(trigger.ability_index)
                        .copied()
                        .unwrap_or(0)
                        >= max
                    {
                        continue;
                    }
                }
            }

            // Check conditions
            if !trigger.conditions.is_empty() {
                let Some(source) = source else {
                    continue; // Source gone entirely — skip
                };

                if !evaluate_condition(
                    &trigger.conditions,
                    source,
                    player_units,
                    enemy_units,
                    rng,
                    trigger.trigger_target_id,
                ) {
                    continue;
                }
            }
        }

        // C. Emit Trigger Event
        limits.record_trigger(trigger.team)?;
        events.push(CombatEvent::AbilityTrigger {
            source_instance_id: trigger.source_id,
            ability_index: trigger.ability_index as u32,
        });

        // D. Increment trigger count for this ability (if unit is still alive)
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
            graveyard,
            events,
            rng,
            limits,
            trigger.spawn_index_override,
            trigger.trigger_target_id,
            card_pool,
            registry,
        )?;

        let mut reaction_queue = Vec::new();

        // Capture OnHurt BEFORE death check so fatally-damaged units still fire.
        if registry.has_subscribers(AbilityTrigger::OnHurt) {
            for unit_id in damaged_ids {
                let (idx, team, unit) =
                    if let Some((i, u)) = find_unit_with_position(unit_id, player_units) {
                        (i, Team::Player, u)
                    } else if let Some((i, u)) = find_unit_with_position(unit_id, enemy_units) {
                        (i, Team::Enemy, u)
                    } else {
                        continue;
                    };

                let is_fatal = unit.health <= 0;
                reaction_queue.extend(capture_triggers_for_unit(
                    unit,
                    idx,
                    team,
                    AbilityTrigger::OnHurt,
                    Some(trigger.source_id),
                    if is_fatal { Some(idx) } else { None },
                ));
            }
        }

        // Death check — dead units move to graveyard
        let (dead_player, dead_enemy) =
            execute_death_check_phase(player_units, enemy_units, events, card_pool);

        // OnFaint and OnAllyFaint from dead lists
        for (idx, dead_unit) in dead_player {
            let dead_id = dead_unit.instance_id;
            if registry.has_subscribers(AbilityTrigger::OnFaint) {
                reaction_queue.extend(capture_triggers_for_unit(
                    &dead_unit,
                    idx,
                    Team::Player,
                    AbilityTrigger::OnFaint,
                    Some(dead_id),
                    Some(idx),
                ));
            }
            registry.unregister_unit(dead_id);
            if registry.has_subscribers(AbilityTrigger::OnAllyFaint) {
                for (s_idx, survivor) in player_units.iter().enumerate() {
                    reaction_queue.extend(capture_triggers_for_unit(
                        survivor,
                        s_idx,
                        Team::Player,
                        AbilityTrigger::OnAllyFaint,
                        Some(dead_id),
                        Some(idx),
                    ));
                }
            }
            graveyard.push(dead_unit);
        }
        for (idx, dead_unit) in dead_enemy {
            let dead_id = dead_unit.instance_id;
            if registry.has_subscribers(AbilityTrigger::OnFaint) {
                reaction_queue.extend(capture_triggers_for_unit(
                    &dead_unit,
                    idx,
                    Team::Enemy,
                    AbilityTrigger::OnFaint,
                    Some(dead_id),
                    Some(idx),
                ));
            }
            registry.unregister_unit(dead_id);
            if registry.has_subscribers(AbilityTrigger::OnAllyFaint) {
                for (s_idx, survivor) in enemy_units.iter().enumerate() {
                    reaction_queue.extend(capture_triggers_for_unit(
                        survivor,
                        s_idx,
                        Team::Enemy,
                        AbilityTrigger::OnAllyFaint,
                        Some(dead_id),
                        Some(idx),
                    ));
                }
            }
            graveyard.push(dead_unit);
        }

        // E. RECURSION (Depth-First)
        if !reaction_queue.is_empty() {
            limits.enter_trigger_depth(trigger.team)?;
            resolve_trigger_queue(
                &mut reaction_queue,
                player_units,
                enemy_units,
                graveyard,
                events,
                rng,
                limits,
                card_pool,
                registry,
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
    graveyard: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
    limits: &mut BattleLimits,
    spawn_index_override: Option<usize>,
    trigger_target_id: Option<UnitInstanceId>,
    card_pool: &BTreeMap<CardId, UnitCard>,
    registry: &mut TriggerRegistry,
) -> Result<Vec<UnitInstanceId>, ()> {
    limits.enter_recursion(source_team)?;
    let result = (|| -> Result<Vec<UnitInstanceId>, ()> {
        let mut damaged_units = Vec::new();

        match effect {
            AbilityEffect::Damage { amount, target } => {
                let targets = resolve_targets(
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
                let targets = resolve_targets(
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
            AbilityEffect::ModifyStatsPermanent {
                health,
                attack,
                target,
            } => {
                let targets = resolve_targets(
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
                        events.push(CombatEvent::AbilityModifyStatsPermanent {
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
            AbilityEffect::SpawnUnit {
                card_id: spawn_card_id,
                spawn_location,
            } => {
                limits.record_spawn(source_team)?;

                // 1. Create the unit and insert into the board
                let (spawned_id, safe_idx) = {
                    let my_board = match source_team {
                        Team::Player => &mut *player_units,
                        Team::Enemy => &mut *enemy_units,
                    };

                    if my_board.len() >= BOARD_SIZE {
                        return Ok(damaged_units);
                    }

                    let Some(spawn_card) = card_pool.get(spawn_card_id) else {
                        // Invalid card refs should safely fizzle instead of panicking.
                        return Ok(damaged_units);
                    };

                    let instance_id = limits.generate_instance_id(source_team);

                    let mut new_unit = CombatUnit::from_card(spawn_card.clone());
                    new_unit.instance_id = instance_id;
                    new_unit.team = source_team;

                    // INSERTION LOGIC: Use the effect's spawn_location preference.
                    // DeathPosition uses the override from the death context, falling back to Front.
                    let insert_idx = match spawn_location {
                        SpawnLocation::Front => 0,
                        SpawnLocation::Back => my_board.len(),
                        SpawnLocation::DeathPosition => spawn_index_override.unwrap_or(0),
                    };
                    let safe_idx = core::cmp::min(insert_idx, my_board.len());

                    my_board.insert(safe_idx, new_unit);

                    // Log Spawn
                    events.push(CombatEvent::UnitSpawn {
                        team: source_team,
                        spawned_unit: my_board[safe_idx].to_view(card_pool),
                        new_board_state: my_board.iter().map(|u| u.to_view(card_pool)).collect(),
                    });

                    registry.register_unit(&my_board[safe_idx]);

                    (instance_id, safe_idx)
                };

                // 2. TRIGGER REACTIONS: OnSpawn for the spawned unit, OnAllySpawn for others
                let mut reactions = Vec::new();

                {
                    let my_board = match source_team {
                        Team::Player => &mut *player_units,
                        Team::Enemy => &mut *enemy_units,
                    };

                    if registry.has_subscribers(AbilityTrigger::OnSpawn) {
                        reactions.extend(capture_triggers_for_unit(
                            &my_board[safe_idx],
                            safe_idx,
                            source_team,
                            AbilityTrigger::OnSpawn,
                            Some(spawned_id),
                            None,
                        ));
                    }

                    if registry.has_subscribers(AbilityTrigger::OnAllySpawn) {
                        for (i, unit) in my_board.iter().enumerate() {
                            if unit.instance_id == spawned_id {
                                continue;
                            }
                            reactions.extend(capture_triggers_for_unit(
                                unit,
                                i,
                                source_team,
                                AbilityTrigger::OnAllySpawn,
                                Some(spawned_id),
                                None,
                            ));
                        }
                    }

                    // OnEnemySpawn for units on the opposite team
                    let opposing_board = match source_team {
                        Team::Player => &mut *enemy_units,
                        Team::Enemy => &mut *player_units,
                    };
                    let opposing_team = match source_team {
                        Team::Player => Team::Enemy,
                        Team::Enemy => Team::Player,
                    };

                    if registry.has_subscribers(AbilityTrigger::OnEnemySpawn) {
                        for (i, unit) in opposing_board.iter().enumerate() {
                            reactions.extend(capture_triggers_for_unit(
                                unit,
                                i,
                                opposing_team,
                                AbilityTrigger::OnEnemySpawn,
                                Some(spawned_id),
                                None,
                            ));
                        }
                    }
                }

                if !reactions.is_empty() {
                    limits.enter_trigger_depth(source_team)?;
                    resolve_trigger_queue(
                        &mut reactions,
                        player_units,
                        enemy_units,
                        graveyard,
                        events,
                        rng,
                        limits,
                        card_pool,
                        registry,
                    )?;
                    limits.exit_trigger_depth();
                }

                Ok(damaged_units)
            }
            AbilityEffect::Destroy { target } => {
                let targets = resolve_targets(
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
                        unit.health = 0;
                        damaged_units.push(target_id);
                        events.push(CombatEvent::AbilityDestroy {
                            source_instance_id,
                            target_instance_id: target_id,
                        });
                    }
                }
                Ok(damaged_units)
            }
            AbilityEffect::GainMana { amount } => {
                events.push(CombatEvent::AbilityGainMana {
                    source_instance_id,
                    team: source_team,
                    amount: *amount,
                });
                Ok(damaged_units)
            }
        }
    })();

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
    card_pool: &BTreeMap<CardId, UnitCard>,
    clash_context: Option<ClashContext>,
    registry: &mut TriggerRegistry,
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
                card_pool,
                None,
                registry,
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
                card_pool,
                clash_context,
                registry,
            )?;
        }
        BattlePhase::Attack => {
            let clash_outcome = execute_attack_clash(player_units, enemy_units, events);
            // After clash, all triggers (OnHurt, AfterUnitAttack, AfterAnyAttack, OnFaint, etc.)
            // are captured eagerly before the death check.
            resolve_hurt_and_faint_loop(
                player_units,
                enemy_units,
                clash_outcome,
                events,
                rng,
                limits,
                card_pool,
                registry,
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
    card_pool: &BTreeMap<CardId, UnitCard>,
    clash_context: Option<ClashContext>,
    registry: &mut TriggerRegistry,
) -> Result<(), ()> {
    let mut queue = Vec::new();

    {
        let reg = &*registry;
        let mut scan_board = |units: &[CombatUnit], team: Team| {
            let target_id = clash_context.and_then(|ctx| match team {
                Team::Player => ctx.enemy_id,
                Team::Enemy => ctx.player_id,
            });

            for (i, u) in units.iter().enumerate() {
                for trigger_type in trigger_types {
                    if !reg.has_subscribers(*trigger_type) {
                        continue;
                    }
                    if *trigger_type == AbilityTrigger::BeforeUnitAttack && i != 0 {
                        continue;
                    }
                    queue.extend(capture_triggers_for_unit(
                        u,
                        i,
                        team,
                        *trigger_type,
                        target_id,
                        None,
                    ));
                }
            }
        };

        scan_board(player_units, Team::Player);
        scan_board(enemy_units, Team::Enemy);
    }

    let mut graveyard = Vec::new();
    resolve_trigger_queue(
        &mut queue,
        player_units,
        enemy_units,
        &mut graveyard,
        events,
        rng,
        limits,
        card_pool,
        registry,
    )
}

/// Captures the instance IDs of the two front units involved in a clash.
/// Used to populate `trigger_target_id` for BeforeAttack triggers.
#[derive(Debug, Clone, Copy)]
struct ClashContext {
    player_id: Option<UnitInstanceId>,
    enemy_id: Option<UnitInstanceId>,
}

impl ClashContext {
    fn capture(player_units: &[CombatUnit], enemy_units: &[CombatUnit]) -> Self {
        Self {
            player_id: player_units.first().map(|u| u.instance_id),
            enemy_id: enemy_units.first().map(|u| u.instance_id),
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct ClashOutcome {
    player_id: Option<UnitInstanceId>,
    enemy_id: Option<UnitInstanceId>,
    player_hurt: bool,
    enemy_hurt: bool,
}

fn execute_attack_clash(
    player_units: &mut [CombatUnit],
    enemy_units: &mut [CombatUnit],
    events: &mut Vec<CombatEvent>,
) -> ClashOutcome {
    let mut outcome = ClashOutcome {
        player_id: None,
        enemy_id: None,
        player_hurt: false,
        enemy_hurt: false,
    };

    if player_units.is_empty() || enemy_units.is_empty() {
        return outcome;
    }

    let p = &player_units[0];
    let e = &enemy_units[0];
    let p_dmg = p.effective_attack();
    let e_dmg = e.effective_attack();

    events.push(CombatEvent::Clash { p_dmg, e_dmg });

    let p_id = p.instance_id;
    let e_id = e.instance_id;
    outcome.player_id = Some(p_id);
    outcome.enemy_id = Some(e_id);

    // Enemy hits player front.
    if e_dmg > 0 {
        player_units[0].health = player_units[0].health.saturating_sub(e_dmg);
        outcome.player_hurt = true;
    }

    // Player hits enemy front.
    if p_dmg > 0 {
        enemy_units[0].health = enemy_units[0].health.saturating_sub(p_dmg);
        outcome.enemy_hurt = true;
    }

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

    outcome
}

/// Returns a tuple of (Index, Unit) for dead units
fn execute_death_check_phase(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    events: &mut Vec<CombatEvent>,
    card_pool: &BTreeMap<CardId, UnitCard>,
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
            new_board_state: player_units.iter().map(|u| u.to_view(card_pool)).collect(),
        });
    }
    if !enemy_dead.is_empty() {
        events.push(CombatEvent::UnitDeath {
            team: Team::Enemy,
            new_board_state: enemy_units.iter().map(|u| u.to_view(card_pool)).collect(),
        });
    }

    (player_dead, enemy_dead)
}

fn resolve_hurt_and_faint_loop<R: BattleRng>(
    player_units: &mut Vec<CombatUnit>,
    enemy_units: &mut Vec<CombatUnit>,
    clash_outcome: ClashOutcome,
    events: &mut Vec<CombatEvent>,
    rng: &mut R,
    limits: &mut BattleLimits,
    card_pool: &BTreeMap<CardId, UnitCard>,
    registry: &mut TriggerRegistry,
) -> Result<(), ()> {
    let clashing_p_id = clash_outcome.player_id;
    let clashing_e_id = clash_outcome.enemy_id;

    // ── EAGER CAPTURE: all triggers collected BEFORE death check ──

    let mut queue = Vec::new();

    {
        let reg = &*registry;
        let mut capture_clash_triggers = |units: &[CombatUnit],
                                          clash_id: Option<UnitInstanceId>,
                                          opponent_id: Option<UnitInstanceId>,
                                          was_hurt: bool,
                                          team: Team| {
            let Some(cid) = clash_id else { return };
            let Some((idx, unit)) = find_unit_with_position(cid, units) else {
                return;
            };

            let spawn_override = if unit.health <= 0 { Some(idx) } else { None };

            if was_hurt && reg.has_subscribers(AbilityTrigger::OnHurt) {
                queue.extend(capture_triggers_for_unit(
                    unit,
                    idx,
                    team,
                    AbilityTrigger::OnHurt,
                    opponent_id,
                    spawn_override,
                ));
            }

            if reg.has_subscribers(AbilityTrigger::AfterUnitAttack) {
                queue.extend(capture_triggers_for_unit(
                    unit,
                    idx,
                    team,
                    AbilityTrigger::AfterUnitAttack,
                    opponent_id,
                    spawn_override,
                ));
            }
        };

        capture_clash_triggers(
            player_units,
            clashing_p_id,
            clashing_e_id,
            clash_outcome.player_hurt,
            Team::Player,
        );
        capture_clash_triggers(
            enemy_units,
            clashing_e_id,
            clashing_p_id,
            clash_outcome.enemy_hurt,
            Team::Enemy,
        );
    }

    // AfterAnyAttack for ALL units (not just front) — captured before death check.

    if registry.has_subscribers(AbilityTrigger::AfterAnyAttack) {
        for (i, u) in player_units.iter().enumerate() {
            queue.extend(capture_triggers_for_unit(
                u,
                i,
                Team::Player,
                AbilityTrigger::AfterAnyAttack,
                clashing_e_id,
                if u.health <= 0 { Some(i) } else { None },
            ));
        }
        for (i, u) in enemy_units.iter().enumerate() {
            queue.extend(capture_triggers_for_unit(
                u,
                i,
                Team::Enemy,
                AbilityTrigger::AfterAnyAttack,
                clashing_p_id,
                if u.health <= 0 { Some(i) } else { None },
            ));
        }
    }

    // AfterAllyAttack — fires for units on the SAME team as the attacker.
    // AfterEnemyAttack — fires for units on the OPPOSING team of the attacker.

    if registry.has_subscribers(AbilityTrigger::AfterAllyAttack)
        || registry.has_subscribers(AbilityTrigger::AfterEnemyAttack)
    {
        for (i, u) in player_units.iter().enumerate() {
            let spawn_override = if u.health <= 0 { Some(i) } else { None };
            if registry.has_subscribers(AbilityTrigger::AfterAllyAttack) {
                queue.extend(capture_triggers_for_unit(
                    u,
                    i,
                    Team::Player,
                    AbilityTrigger::AfterAllyAttack,
                    clashing_p_id,
                    spawn_override,
                ));
            }
            if registry.has_subscribers(AbilityTrigger::AfterEnemyAttack) {
                queue.extend(capture_triggers_for_unit(
                    u,
                    i,
                    Team::Player,
                    AbilityTrigger::AfterEnemyAttack,
                    clashing_e_id,
                    spawn_override,
                ));
            }
        }
        for (i, u) in enemy_units.iter().enumerate() {
            let spawn_override = if u.health <= 0 { Some(i) } else { None };
            if registry.has_subscribers(AbilityTrigger::AfterAllyAttack) {
                queue.extend(capture_triggers_for_unit(
                    u,
                    i,
                    Team::Enemy,
                    AbilityTrigger::AfterAllyAttack,
                    clashing_e_id,
                    spawn_override,
                ));
            }
            if registry.has_subscribers(AbilityTrigger::AfterEnemyAttack) {
                queue.extend(capture_triggers_for_unit(
                    u,
                    i,
                    Team::Enemy,
                    AbilityTrigger::AfterEnemyAttack,
                    clashing_p_id,
                    spawn_override,
                ));
            }
        }
    }

    // ── Death check (removes dead units from boards) ──

    let (dead_player, dead_enemy) =
        execute_death_check_phase(player_units, enemy_units, events, card_pool);

    if dead_player.is_empty() && dead_enemy.is_empty() && queue.is_empty() {
        return Ok(());
    }

    // ── OnFaint and OnAllyFaint from dead lists, then move to graveyard ──

    let mut graveyard = Vec::new();

    for (idx, dead_unit) in dead_player {
        if registry.has_subscribers(AbilityTrigger::OnFaint) {
            queue.extend(capture_triggers_for_unit(
                &dead_unit,
                idx,
                Team::Player,
                AbilityTrigger::OnFaint,
                Some(dead_unit.instance_id),
                Some(idx),
            ));
        }
        registry.unregister_unit(dead_unit.instance_id);
        if registry.has_subscribers(AbilityTrigger::OnAllyFaint) {
            for (s_idx, survivor) in player_units.iter().enumerate() {
                queue.extend(capture_triggers_for_unit(
                    survivor,
                    s_idx,
                    Team::Player,
                    AbilityTrigger::OnAllyFaint,
                    Some(dead_unit.instance_id),
                    None,
                ));
            }
        }
        graveyard.push(dead_unit);
    }
    for (idx, dead_unit) in dead_enemy {
        if registry.has_subscribers(AbilityTrigger::OnFaint) {
            queue.extend(capture_triggers_for_unit(
                &dead_unit,
                idx,
                Team::Enemy,
                AbilityTrigger::OnFaint,
                Some(dead_unit.instance_id),
                Some(idx),
            ));
        }
        registry.unregister_unit(dead_unit.instance_id);
        if registry.has_subscribers(AbilityTrigger::OnAllyFaint) {
            for (s_idx, survivor) in enemy_units.iter().enumerate() {
                queue.extend(capture_triggers_for_unit(
                    survivor,
                    s_idx,
                    Team::Enemy,
                    AbilityTrigger::OnAllyFaint,
                    Some(dead_unit.instance_id),
                    None,
                ));
            }
        }
        graveyard.push(dead_unit);
    }

    resolve_trigger_queue(
        &mut queue,
        player_units,
        enemy_units,
        &mut graveyard,
        events,
        rng,
        limits,
        card_pool,
        registry,
    )
}

/// Resolve target unit IDs for an ability target.
fn resolve_targets<R: BattleRng>(
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
        AbilityTarget::Adjacent { scope } => resolve_adjacent(
            source_instance_id,
            source_team,
            *scope,
            player_units,
            enemy_units,
            source_position_override,
        ),
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

/// Resolve adjacent units for a source unit.
/// The battle line is: [P5][P4][P3][P2][P1] <clash> [E1][E2][E3][E4][E5]
/// Adjacent allies: same-team units at position ± 1.
/// Adjacent enemies: enemy front (position 0) if source is at front (position 0).
/// Scope controls which neighbors are included (Allies, Enemies, All, etc.).
fn resolve_adjacent(
    source_id: UnitInstanceId,
    source_team: Team,
    scope: TargetScope,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    source_position_override: Option<usize>,
) -> Vec<UnitInstanceId> {
    let (allies, enemies) = match source_team {
        Team::Player => (player_units, enemy_units),
        Team::Enemy => (enemy_units, player_units),
    };

    // Find source position (alive on board, or override for dead units)
    let pos = allies
        .iter()
        .position(|u| u.instance_id == source_id)
        .or(source_position_override);

    let Some(pos) = pos else {
        return vec![];
    };

    let mut result = Vec::new();
    let include_allies = matches!(
        scope,
        TargetScope::Allies | TargetScope::AlliesOther | TargetScope::All | TargetScope::SelfUnit
    );
    let include_enemies = matches!(scope, TargetScope::Enemies | TargetScope::All);

    // Same-team neighbors at position ± 1
    if include_allies {
        if pos > 0 {
            result.push(allies[pos - 1].instance_id);
        }
        if pos + 1 < allies.len() {
            result.push(allies[pos + 1].instance_id);
        }
    }

    // Cross-team: enemy front unit is adjacent to our front unit
    if include_enemies && pos == 0 {
        if let Some(enemy_front) = enemies.first() {
            result.push(enemy_front.instance_id);
        }
    }

    result
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

    // If unit is on the board, position() finds it (alive). Otherwise use override (dead).
    let found_pos = allies.iter().position(|u| u.instance_id == source_id);
    let is_alive = found_pos.is_some();
    let pos = found_pos.or(source_position_override);

    if let Some(pos) = pos {
        let target_idx = if index == -1 {
            // Ahead — same logic alive or dead (pos-1)
            if pos > 0 {
                Some(pos - 1)
            } else {
                None
            }
        } else if index == 1 {
            // Behind — if alive, pos+1; if dead (removed), pos (next unit slid in)
            if is_alive {
                if pos + 1 < allies.len() {
                    Some(pos + 1)
                } else {
                    None
                }
            } else if pos < allies.len() {
                Some(pos)
            } else {
                None
            }
        } else if index == 0 {
            // Self — only if alive
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

/// Evaluates a list of conditions (implicit AND).
fn evaluate_condition<R: BattleRng>(
    conditions: &[Condition],
    source: &CombatUnit,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    rng: &mut R,
    trigger_target_id: Option<UnitInstanceId>,
) -> bool {
    for condition in conditions {
        match condition {
            Condition::Is(matcher) => {
                if !evaluate_matcher(
                    matcher,
                    source,
                    player_units,
                    enemy_units,
                    rng,
                    trigger_target_id,
                ) {
                    return false;
                }
            }
            Condition::AnyOf(matchers) => {
                let mut any_passed = false;
                for matcher in matchers {
                    if evaluate_matcher(
                        matcher,
                        source,
                        player_units,
                        enemy_units,
                        rng,
                        trigger_target_id,
                    ) {
                        any_passed = true;
                        break;
                    }
                }
                if !any_passed {
                    return false;
                }
            }
        }
    }
    true
}

/// Evaluates a single matcher.
fn evaluate_matcher<R: BattleRng>(
    matcher: &Matcher,
    source: &CombatUnit,
    player_units: &[CombatUnit],
    enemy_units: &[CombatUnit],
    rng: &mut R,
    trigger_target_id: Option<UnitInstanceId>,
) -> bool {
    match matcher {
        Matcher::StatValueCompare {
            scope,
            stat,
            op,
            value,
        } => {
            let scoped_targets: Vec<&CombatUnit> = if *scope == TargetScope::SelfUnit {
                vec![source]
            } else {
                resolve_scope_units(
                    *scope,
                    source.instance_id,
                    source.team,
                    player_units,
                    enemy_units,
                    trigger_target_id,
                )
            };

            if scoped_targets.is_empty() {
                return false;
            }

            scoped_targets
                .iter()
                .any(|unit| compare_i32(get_stat_value(unit, *stat), *op, *value))
        }
        Matcher::TargetStatValueCompare {
            target,
            stat,
            op,
            value,
        } => {
            let target_ids = resolve_targets(
                source.instance_id,
                source.team,
                target,
                player_units,
                enemy_units,
                rng,
                trigger_target_id,
                None,
            );
            if target_ids.is_empty() {
                return false;
            }

            target_ids.iter().any(|target_id| {
                find_unit_in_slices(*target_id, player_units, enemy_units)
                    .map(|unit| compare_i32(get_stat_value(unit, *stat), *op, *value))
                    .unwrap_or(false)
            })
        }
        Matcher::StatStatCompare {
            source_stat,
            op,
            target_scope,
            target_stat,
        } => {
            let scoped_targets: Vec<&CombatUnit> = if *target_scope == TargetScope::SelfUnit {
                vec![source]
            } else {
                resolve_scope_units(
                    *target_scope,
                    source.instance_id,
                    source.team,
                    player_units,
                    enemy_units,
                    trigger_target_id,
                )
            };

            if scoped_targets.is_empty() {
                return false;
            }

            let source_val = get_stat_value(source, *source_stat);
            scoped_targets.iter().any(|target_unit| {
                compare_i32(source_val, *op, get_stat_value(target_unit, *target_stat))
            })
        }
        Matcher::UnitCount { scope, op, value } => {
            let count = resolve_scope_ids(
                *scope,
                source.instance_id,
                source.team,
                player_units,
                enemy_units,
                trigger_target_id,
            )
            .len() as u32;
            compare_u32(count, *op, *value)
        }
        Matcher::IsPosition { scope, index } => {
            let scoped_targets: Vec<&CombatUnit> = if *scope == TargetScope::SelfUnit {
                vec![source]
            } else {
                resolve_scope_units(
                    *scope,
                    source.instance_id,
                    source.team,
                    player_units,
                    enemy_units,
                    trigger_target_id,
                )
            };

            if scoped_targets.is_empty() {
                return false;
            }

            let actual_idx = if *index == -1 {
                scoped_targets.len().saturating_sub(1)
            } else if *index >= 0 {
                *index as usize
            } else {
                return false;
            };

            scoped_targets
                .get(actual_idx)
                .map(|unit| unit.instance_id == source.instance_id)
                .unwrap_or(false)
        }
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

fn find_unit<'a>(
    instance_id: UnitInstanceId,
    player_units: &'a [CombatUnit],
    enemy_units: &'a [CombatUnit],
) -> Option<&'a CombatUnit> {
    player_units
        .iter()
        .chain(enemy_units.iter())
        .find(|u| u.instance_id == instance_id)
}

fn find_unit_mut<'a>(
    instance_id: UnitInstanceId,
    player_units: &'a mut [CombatUnit],
    enemy_units: &'a mut [CombatUnit],
) -> Option<&'a mut CombatUnit> {
    player_units
        .iter_mut()
        .chain(enemy_units.iter_mut())
        .find(|u| u.instance_id == instance_id)
}
