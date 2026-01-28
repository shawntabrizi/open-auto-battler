//! Core game types
//!
//! This module defines the fundamental types used throughout the game engine.

use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode};
use scale_info::TypeInfo;

#[cfg(feature = "std")]
use serde::{Deserialize, Serialize};

/// Unique identifier for cards
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    Encode,
    Decode,
    DecodeWithMemTracking,
    TypeInfo,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(transparent))]
pub struct CardId(pub u32);

impl From<u32> for CardId {
    fn from(id: u32) -> Self {
        Self(id)
    }
}

/// Scope for targeting and condition evaluation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum TargetScope {
    SelfUnit,
    Allies,
    Enemies,
    All,
    AlliesOther,
    TriggerSource,
    Aggressor,
}

/// Stat types for targeting and comparison
#[derive(Debug, Clone, Copy, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum StatType {
    Health,
    Attack,
    Mana,
}

/// Sort order for stat-based targeting
#[derive(Debug, Clone, Copy, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum SortOrder {
    Ascending,
    Descending,
}

/// Comparison operators for conditions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum CompareOp {
    GreaterThan,
    LessThan,
    Equal,
    GreaterThanOrEqual,
    LessThanOrEqual,
}

/// Conditions that must be met for an ability to activate
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "data"))]
pub enum AbilityCondition {
    /// No condition, always triggers (default)
    None,

    /// Compare a unit's stat to a constant value
    StatValueCompare {
        scope: TargetScope,
        stat: StatType,
        op: CompareOp,
        value: i32,
    },

    /// Compare one unit's stat to another unit's stat
    StatStatCompare {
        source_stat: StatType,
        op: CompareOp,
        target_scope: TargetScope,
        target_stat: StatType,
    },

    /// Count units in a scope and compare to a value
    UnitCount {
        scope: TargetScope,
        op: CompareOp,
        value: u32,
    },

    /// Check if unit is at a specific position
    IsPosition { scope: TargetScope, index: i32 },

    /// Both conditions must be true
    And {
        left: Box<AbilityCondition>,
        right: Box<AbilityCondition>,
    },
    /// At least one condition must be true
    Or {
        left: Box<AbilityCondition>,
        right: Box<AbilityCondition>,
    },
    /// Inverts the condition result
    Not { inner: Box<AbilityCondition> },
}

impl Default for AbilityCondition {
    fn default() -> Self {
        AbilityCondition::None
    }
}

/// Ability trigger conditions
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum AbilityTrigger {
    OnStart,
    OnFaint,
    OnAllyFaint,
    OnHurt,
    OnSpawn,
    OnAllySpawn,
    OnEnemySpawn,
    BeforeUnitAttack,
    AfterUnitAttack,
    BeforeAnyAttack,
    AfterAnyAttack,
}

/// Ability effect types
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type"))]
pub enum AbilityEffect {
    /// Deal damage to target
    Damage { amount: i32, target: AbilityTarget },
    /// Modify health and/or attack stats (positive = buff/heal, negative = debuff/damage)
    ModifyStats {
        health: i32,
        attack: i32,
        target: AbilityTarget,
    },
    /// Spawn a new unit on the board
    SpawnUnit { template_id: String },
    /// Destroy a target directly
    Destroy { target: AbilityTarget },
}

/// Ability target specifications
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "data"))]
pub enum AbilityTarget {
    /// Specific position (0=front, -1=back). scope=SelfUnit means relative.
    Position { scope: TargetScope, index: i32 },
    /// Neighbors of the unit(s) in scope.
    Adjacent { scope: TargetScope },
    /// Random units from scope.
    Random { scope: TargetScope, count: u32 },
    /// Selection based on stats (e.g., Highest Attack).
    Standard {
        scope: TargetScope,
        stat: StatType,
        order: SortOrder,
        count: u32,
    },
    /// Everyone in scope.
    All { scope: TargetScope },
}

/// A unit ability
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct Ability {
    pub trigger: AbilityTrigger,
    pub effect: AbilityEffect,
    pub name: String,
    pub description: String,
    /// Optional condition that must be met for this ability to activate.
    /// If None or AbilityCondition::None, the ability always triggers.
    #[cfg_attr(feature = "std", serde(default))]
    pub condition: AbilityCondition,
    /// Optional limit on how many times this ability can trigger per battle.
    /// If None, the ability can trigger unlimited times.
    #[cfg_attr(feature = "std", serde(default))]
    pub max_triggers: Option<u32>,
}

/// Combat stats for a unit
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct UnitStats {
    pub attack: i32,
    pub health: i32,
}

/// Economy stats shared by all cards
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct EconomyStats {
    pub play_cost: i32,
    pub pitch_value: i32,
}

/// A unit card in the game (MVP: units only)
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct UnitCard {
    pub id: CardId,
    pub template_id: String,
    pub name: String,
    pub stats: UnitStats,
    pub economy: EconomyStats,
    pub abilities: Vec<Ability>,
    pub is_token: bool,
}

impl UnitCard {
    pub fn new(
        id: CardId,
        template_id: &str,
        name: &str,
        attack: i32,
        health: i32,
        play_cost: i32,
        pitch_value: i32,
        is_token: bool,
    ) -> Self {
        Self {
            id,
            template_id: String::from(template_id),
            name: String::from(name),
            stats: UnitStats { attack, health },
            economy: EconomyStats {
                play_cost,
                pitch_value,
            },
            abilities: vec![],
            is_token,
        }
    }

    pub fn with_abilities(mut self, abilities: Vec<Ability>) -> Self {
        self.abilities = abilities;
        self
    }

    pub fn with_ability(self, ability: Ability) -> Self {
        self.with_abilities(vec![ability])
    }
}

/// A unit instance on the board (tracks current health)
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct BoardUnit {
    pub card_id: CardId,
    pub current_health: i32,
}

impl BoardUnit {
    pub fn new(card_id: CardId, current_health: i32) -> Self {
        Self {
            card_id,
            current_health,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.current_health > 0
    }

    pub fn effective_health(&self) -> i32 {
        self.current_health.max(0)
    }

    pub fn take_damage(&mut self, amount: i32) {
        let actual_damage = amount.max(0);
        self.current_health = self.current_health.saturating_sub(actual_damage);
    }
}

/// A committed turn action submitted by the player
///
/// Contains the full description of what the player did during their planning phase.
/// This is verified deterministically by `verify_and_apply_turn`.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct CommitTurnAction {
    /// Final board state after the turn
    pub new_board: Vec<Option<BoardUnit>>,
    /// Hand indices pitched for mana
    pub pitched_from_hand: Vec<u32>,
    /// Hand indices played to board
    pub played_from_hand: Vec<u32>,
    /// Board slots removed for mana
    pub pitched_from_board: Vec<u32>,
}
