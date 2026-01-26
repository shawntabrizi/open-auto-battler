//! Battle limits to prevent infinite loops and stack overflows
//!
//! This module provides safeguards against runaway battle computations.

use crate::battle::UnitId;
use parity_scale_codec::{Decode, Encode};
use scale_info::TypeInfo;

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

pub const MAX_RECURSION_DEPTH: u32 = 50;
pub const MAX_SPAWNS_PER_BATTLE: u32 = 100;
pub const MAX_TRIGGERS_PER_PHASE: u32 = 200;
pub const MAX_TRIGGER_DEPTH: u32 = 10;
pub const MAX_BATTLE_ROUNDS: u32 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(rename_all = "SCREAMING_SNAKE_CASE"))]
pub enum Team {
    Player,
    Enemy,
}

#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE"))]
pub enum LimitReason {
    RoundLimit { current: u32, max: u32 },
    RecursionLimit { current: u32, max: u32 },
    SpawnLimit { current: u32, max: u32 },
    TriggerLimit { current: u32, max: u32 },
    TriggerDepthLimit { current: u32, max: u32 },
}

/// Tracks execution limits to prevent infinite loops and stack overflows
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct BattleLimits {
    pub recursion_depth: u32,
    pub trigger_depth: u32,
    pub total_spawns: u32,
    pub phase_triggers: u32,
    pub total_rounds: u32,
    pub current_executing_team: Option<Team>,
    pub limit_exceeded_by: Option<Team>,
    pub limit_exceeded_reason: Option<LimitReason>,
    pub next_player_index: u32,
    pub next_enemy_index: u32,
}

impl BattleLimits {
    pub fn new() -> Self {
        Self {
            recursion_depth: 0,
            trigger_depth: 0,
            total_spawns: 0,
            phase_triggers: 0,
            total_rounds: 0,
            current_executing_team: None,
            limit_exceeded_by: None,
            limit_exceeded_reason: None,
            next_player_index: 1,
            next_enemy_index: 1,
        }
    }

    pub fn record_round(&mut self) -> Result<(), ()> {
        self.total_rounds += 1;
        if self.total_rounds > MAX_BATTLE_ROUNDS {
            // Draws don't attribute to a specific team
            self.limit_exceeded_by = None;
            self.limit_exceeded_reason = Some(LimitReason::RoundLimit {
                current: self.total_rounds,
                max: MAX_BATTLE_ROUNDS,
            });
            return Err(());
        }
        Ok(())
    }

    pub fn generate_instance_id(&mut self, team: Team) -> UnitId {
        match team {
            Team::Player => {
                let id = self.next_player_index;
                self.next_player_index += 1;
                UnitId::player(id)
            }
            Team::Enemy => {
                let id = self.next_enemy_index;
                self.next_enemy_index += 1;
                UnitId::enemy(id)
            }
        }
    }

    pub fn reset_phase_counters(&mut self) {
        self.phase_triggers = 0;
    }

    pub fn is_exceeded(&self) -> bool {
        self.limit_exceeded_by.is_some()
    }

    pub fn enter_recursion(&mut self, team: Team) -> Result<(), ()> {
        self.current_executing_team = Some(team);
        self.recursion_depth += 1;
        if self.recursion_depth > MAX_RECURSION_DEPTH {
            self.limit_exceeded_by = Some(team);
            self.limit_exceeded_reason = Some(LimitReason::RecursionLimit {
                current: self.recursion_depth,
                max: MAX_RECURSION_DEPTH,
            });
            return Err(());
        }
        Ok(())
    }

    pub fn exit_recursion(&mut self) {
        if self.recursion_depth > 0 {
            self.recursion_depth -= 1;
        }
    }

    pub fn record_spawn(&mut self, team: Team) -> Result<(), ()> {
        self.current_executing_team = Some(team);
        self.total_spawns += 1;
        if self.total_spawns > MAX_SPAWNS_PER_BATTLE {
            self.limit_exceeded_by = Some(team);
            self.limit_exceeded_reason = Some(LimitReason::SpawnLimit {
                current: self.total_spawns,
                max: MAX_SPAWNS_PER_BATTLE,
            });
            return Err(());
        }
        Ok(())
    }

    pub fn record_trigger(&mut self, team: Team) -> Result<(), ()> {
        self.current_executing_team = Some(team);
        self.phase_triggers += 1;
        if self.phase_triggers > MAX_TRIGGERS_PER_PHASE {
            self.limit_exceeded_by = Some(team);
            self.limit_exceeded_reason = Some(LimitReason::TriggerLimit {
                current: self.phase_triggers,
                max: MAX_TRIGGERS_PER_PHASE,
            });
            return Err(());
        }
        Ok(())
    }

    pub fn enter_trigger_depth(&mut self, team: Team) -> Result<(), ()> {
        self.current_executing_team = Some(team);
        self.trigger_depth += 1;
        if self.trigger_depth > MAX_TRIGGER_DEPTH {
            self.limit_exceeded_by = Some(team);
            self.limit_exceeded_reason = Some(LimitReason::TriggerDepthLimit {
                current: self.trigger_depth,
                max: MAX_TRIGGER_DEPTH,
            });
            return Err(());
        }
        Ok(())
    }

    pub fn exit_trigger_depth(&mut self) {
        if self.trigger_depth > 0 {
            self.trigger_depth -= 1;
        }
    }
}

impl Default for BattleLimits {
    fn default() -> Self {
        Self::new()
    }
}
