//! Core game types
//!
//! This module defines the fundamental types used throughout the game engine.

use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, DecodeWithMemTracking, Encode, MaxEncodedLen};
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
    MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(transparent))]
pub struct CardId(pub u32);

impl From<u32> for CardId {
    fn from(id: u32) -> Self {
        Self(id)
    }
}

/// Battle scope for targeting and condition evaluation
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
pub enum TargetScope {
    SelfUnit,
    Allies,
    Enemies,
    All,
    AlliesOther,
    TriggerSource,
    Aggressor,
}

/// Shop scope for targeting and condition evaluation.
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
pub enum ShopScope {
    SelfUnit,
    Allies,
    All,
    AlliesOther,
    TriggerSource,
}

/// Stat types for targeting and comparison
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
pub enum StatType {
    Health,
    Attack,
    Mana,
}

/// Sort order for stat-based targeting
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
pub enum SortOrder {
    Ascending,
    Descending,
}

/// Comparison operators for conditions
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
pub enum CompareOp {
    GreaterThan,
    LessThan,
    Equal,
    GreaterThanOrEqual,
    LessThanOrEqual,
}

/// Unit status/status flags.
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
#[repr(u8)]
pub enum Status {
    Shield,
    Poison,
    Guard,
}

/// Compact bitmask for status storage.
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
    Default,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(transparent))]
pub struct StatusMask(pub [u8; 32]);

impl Status {
    pub const fn index(self) -> u8 {
        self as u8
    }
}

impl StatusMask {
    pub const fn empty() -> Self {
        Self([0; 32])
    }

    pub fn from_statuses(statuses: &[Status]) -> Self {
        let mut mask = Self::empty();
        for status in statuses {
            mask.insert(*status);
        }
        mask
    }

    pub fn contains(self, status: Status) -> bool {
        let idx = status.index() as usize;
        let byte = idx / 8;
        let bit = idx % 8;
        (self.0[byte] & (1u8 << bit)) != 0
    }

    pub fn insert(&mut self, status: Status) {
        let idx = status.index() as usize;
        let byte = idx / 8;
        let bit = idx % 8;
        self.0[byte] |= 1u8 << bit;
    }

    pub fn remove(&mut self, status: Status) {
        let idx = status.index() as usize;
        let byte = idx / 8;
        let bit = idx % 8;
        self.0[byte] &= !(1u8 << bit);
    }

    pub fn union(self, rhs: Self) -> Self {
        let mut out = [0u8; 32];
        let mut i = 0usize;
        while i < 32 {
            out[i] = self.0[i] | rhs.0[i];
            i += 1;
        }
        Self(out)
    }

    pub fn difference(self, rhs: Self) -> Self {
        let mut out = [0u8; 32];
        let mut i = 0usize;
        while i < 32 {
            out[i] = self.0[i] & !rhs.0[i];
            i += 1;
        }
        Self(out)
    }
}

impl core::ops::BitOr for StatusMask {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self::Output {
        self.union(rhs)
    }
}

impl core::ops::BitOrAssign for StatusMask {
    fn bitor_assign(&mut self, rhs: Self) {
        let mut i = 0usize;
        while i < 32 {
            self.0[i] |= rhs.0[i];
            i += 1;
        }
    }
}

/// Battle matchers that must be met for an ability to activate.
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "data"))]
pub enum Matcher {
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
}

/// Shop matchers that must be met for an ability to activate.
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "data"))]
pub enum ShopMatcher {
    /// Compare a unit's stat to a constant value.
    StatValueCompare {
        scope: ShopScope,
        stat: StatType,
        op: CompareOp,
        value: i32,
    },
    /// Count units in a scope and compare to a value.
    UnitCount {
        scope: ShopScope,
        op: CompareOp,
        value: u32,
    },
    /// Check if unit is at a specific position.
    IsPosition { scope: ShopScope, index: i32 },
}

/// Structural battle conditions that control the flow of evaluation.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "data"))]
pub enum Condition {
    /// A single mandatory requirement.
    Is(Matcher),

    /// A "Shallow OR" list.
    /// Returns true if ANY of the internal Matchers are true.
    /// Stack Safe: Cannot contain nested AnyOfs.
    AnyOf(Vec<Matcher>),
}

/// Structural shop conditions that control the flow of evaluation.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "data"))]
pub enum ShopCondition {
    /// A single mandatory requirement.
    Is(ShopMatcher),
    /// A "Shallow OR" list. Stack-safe (cannot contain nested AnyOf).
    AnyOf(Vec<ShopMatcher>),
}

/// Battle ability trigger conditions.
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
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

/// Shop ability trigger conditions.
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub enum ShopTrigger {
    OnBuy,
    OnSell,
    OnShopStart,
    AfterLoss,
    AfterWin,
    AfterDraw,
}

/// Battle ability effect types.
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
    /// Permanently modify health and/or attack stats on board units (until sold)
    ModifyStatsPermanent {
        health: i32,
        attack: i32,
        target: AbilityTarget,
    },
    /// Spawn a new unit on the board
    SpawnUnit { card_id: CardId },
    /// Destroy a target directly
    Destroy { target: AbilityTarget },
    /// Add mana for next shop via battle event processing.
    GainMana { amount: i32 },
    /// Grant a status for this battle only.
    GrantStatusThisBattle {
        status: Status,
        target: AbilityTarget,
    },
    /// Permanently grant a status to board units (until sold/removed).
    GrantStatusPermanent {
        status: Status,
        target: AbilityTarget,
    },
    /// Permanently remove a status from board units.
    RemoveStatusPermanent {
        status: Status,
        target: AbilityTarget,
    },
}

/// Shop ability effect types.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type"))]
pub enum ShopEffect {
    /// Permanently modify health and/or attack stats on board units (until sold).
    ModifyStatsPermanent {
        health: i32,
        attack: i32,
        target: ShopTarget,
    },
    /// Spawn a new unit on the board.
    SpawnUnit { card_id: CardId },
    /// Destroy a target directly.
    Destroy { target: ShopTarget },
    /// Modify current shop mana.
    GainMana { amount: i32 },
    /// Permanently grant a status to board units (until sold/removed).
    GrantStatusPermanent { status: Status, target: ShopTarget },
    /// Permanently remove a status from board units.
    RemoveStatusPermanent { status: Status, target: ShopTarget },
}

/// Battle ability target specifications.
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
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

/// Shop ability target specifications.
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type", content = "data"))]
pub enum ShopTarget {
    /// Specific position (0=front, -1=back). scope=SelfUnit means relative.
    Position { scope: ShopScope, index: i32 },
    /// Random units from scope.
    Random { scope: ShopScope, count: u32 },
    /// Selection based on stats (e.g., Highest Attack).
    Standard {
        scope: ShopScope,
        stat: StatType,
        order: SortOrder,
        count: u32,
    },
    /// Everyone in scope.
    All { scope: ShopScope },
}

/// A battle ability.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct Ability {
    pub trigger: AbilityTrigger,
    pub effect: AbilityEffect,
    pub name: String,
    pub description: String,
    /// The list of conditions implies "AND".
    /// If empty, it always triggers.
    #[cfg_attr(feature = "std", serde(default))]
    pub conditions: Vec<Condition>,
    /// Optional limit on how many times this ability can trigger per battle.
    /// If None, the ability can trigger unlimited times.
    #[cfg_attr(feature = "std", serde(default))]
    pub max_triggers: Option<u32>,
}

/// A shop ability.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct ShopAbility {
    pub trigger: ShopTrigger,
    pub effect: ShopEffect,
    pub name: String,
    pub description: String,
    /// The list of conditions implies "AND".
    /// If empty, it always triggers.
    #[cfg_attr(feature = "std", serde(default))]
    pub conditions: Vec<ShopCondition>,
    /// Optional limit on how many times this ability can trigger per shop phase.
    /// If None, the ability can trigger unlimited times.
    #[cfg_attr(feature = "std", serde(default))]
    pub max_triggers: Option<u32>,
}

/// Combat stats for a unit
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct UnitStats {
    pub attack: i32,
    pub health: i32,
}

/// Economy stats shared by all cards
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
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
    pub name: String,
    pub stats: UnitStats,
    pub economy: EconomyStats,
    #[cfg_attr(feature = "std", serde(default))]
    pub base_statuses: StatusMask,
    #[cfg_attr(feature = "std", serde(default))]
    pub shop_abilities: Vec<ShopAbility>,
    #[cfg_attr(feature = "std", serde(default))]
    pub battle_abilities: Vec<Ability>,
}

impl UnitCard {
    pub fn new(
        id: CardId,
        name: &str,
        attack: i32,
        health: i32,
        play_cost: i32,
        pitch_value: i32,
    ) -> Self {
        Self {
            id,
            name: String::from(name),
            stats: UnitStats { attack, health },
            economy: EconomyStats {
                play_cost,
                pitch_value,
            },
            base_statuses: StatusMask::empty(),
            shop_abilities: vec![],
            battle_abilities: vec![],
        }
    }

    pub fn with_base_statuses(mut self, statuses: StatusMask) -> Self {
        self.base_statuses = statuses;
        self
    }

    pub fn with_shop_abilities(mut self, abilities: Vec<ShopAbility>) -> Self {
        self.shop_abilities = abilities;
        self
    }

    pub fn with_shop_ability(self, ability: ShopAbility) -> Self {
        self.with_shop_abilities(vec![ability])
    }

    pub fn with_battle_abilities(mut self, abilities: Vec<Ability>) -> Self {
        self.battle_abilities = abilities;
        self
    }

    pub fn with_battle_ability(self, ability: Ability) -> Self {
        self.with_battle_abilities(vec![ability])
    }
}

/// A unit instance on the board (tracks permanent stat deltas)
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct BoardUnit {
    pub card_id: CardId,
    /// Permanent attack change applied to this unit while on board
    pub perm_attack: i32,
    /// Permanent health change applied to this unit while on board
    pub perm_health: i32,
    /// Permanent statuses applied while on board
    pub perm_statuses: StatusMask,
}

impl BoardUnit {
    pub fn new(card_id: CardId) -> Self {
        Self {
            card_id,
            perm_attack: 0,
            perm_health: 0,
            perm_statuses: StatusMask::empty(),
        }
    }
}

/// Individual turn actions (executed in order)
#[derive(
    Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo, MaxEncodedLen,
)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "std", serde(tag = "type"))]
pub enum TurnAction {
    /// Pitch a card from hand for mana
    PitchFromHand { hand_index: u32 },
    /// Play a card from hand to a board slot
    PlayFromHand { hand_index: u32, board_slot: u32 },
    /// Pitch a unit from the board for mana
    PitchFromBoard { board_slot: u32 },
    /// Swap two board positions
    SwapBoard { slot_a: u32, slot_b: u32 },
}

/// A committed turn as an ordered list of actions
///
/// Contains the sequence of actions the player performed during their planning phase.
/// Actions are executed in order by `verify_and_apply_turn`.
#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode, DecodeWithMemTracking, TypeInfo)]
#[cfg_attr(feature = "std", derive(Serialize, Deserialize))]
pub struct CommitTurnAction {
    /// Ordered list of actions to execute
    pub actions: Vec<TurnAction>,
}
