use serde::{Deserialize, Serialize};

/// Unique identifier for cards
pub type CardId = u32;

/// Conditions that must be met for an ability to activate
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AbilityCondition {
    /// No condition, always triggers (default)
    None,

    // ==========================================
    // TARGET STAT CHECKS
    // ==========================================
    /// Target's health is <= threshold (e.g., "Execute: if target HP <= 5")
    TargetHealthLessThanOrEqual { value: i32 },
    /// Target's health is > threshold (e.g., "Tank Buster: if target HP > 10")
    TargetHealthGreaterThan { value: i32 },
    /// Target's attack is <= threshold (e.g., "Bully: if target ATK <= 2")
    TargetAttackLessThanOrEqual { value: i32 },
    /// Target's attack is > threshold (e.g., "Giant Slayer: if target ATK > 5")
    TargetAttackGreaterThan { value: i32 },

    // ==========================================
    // SOURCE STAT CHECKS
    // ==========================================
    /// Source's health is <= threshold (e.g., "Desperate: if my HP <= 3")
    SourceHealthLessThanOrEqual { value: i32 },
    /// Source's health is > threshold (e.g., "Healthy: if my HP > 5")
    SourceHealthGreaterThan { value: i32 },
    /// Source's attack is <= threshold
    SourceAttackLessThanOrEqual { value: i32 },
    /// Source's attack is > threshold (e.g., "Powered Up: if my ATK > 5")
    SourceAttackGreaterThan { value: i32 },

    // ==========================================
    // COMPARATIVE CHECKS
    // ==========================================
    /// Source has more attack than the target (e.g., "Dominate")
    SourceAttackGreaterThanTarget,
    /// Source has less health than the target (e.g., "Underdog")
    SourceHealthLessThanTarget,
    /// Source has more health than the target (e.g., "Tank")
    SourceHealthGreaterThanTarget,
    /// Source has less attack than the target (e.g., "Outmatched")
    SourceAttackLessThanTarget,

    // ==========================================
    // BOARD STATE
    // ==========================================
    /// Ally count (including self) is >= threshold (e.g., "Swarm: if 3+ allies")
    AllyCountAtLeast { count: usize },
    /// Ally count (including self) is <= threshold (e.g., "Last Stand: if <= 2 allies")
    AllyCountAtMost { count: usize },
    /// Source is in the front position (index 0)
    SourceIsFront,
    /// Source is in the back position (last index)
    SourceIsBack,

    // ==========================================
    // LOGIC GATES
    // ==========================================
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
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AbilityTrigger {
    OnStart,
    OnFaint,
    OnAllyFaint,
    OnDamageTaken,
    OnSpawn,
    BeforeUnitAttack,
    AfterUnitAttack,
    BeforeAnyAttack,
    AfterAnyAttack,
    // Future: OnAttack, OnDamage, etc.
}

/// Ability effect types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
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
    // Future: RedirectDamage, etc.
}

/// Ability target specifications
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AbilityTarget {
    SelfUnit,
    AllAllies,
    AllEnemies,
    RandomAlly,
    RandomEnemy,
    FrontAlly,
    FrontEnemy,
    BackAlly,
    BackEnemy,
    AllyAhead,
    LowestHealthEnemy,
    HighestAttackEnemy,
    HighestHealthEnemy,
    LowestAttackEnemy,
    HighestManaEnemy,
    LowestManaEnemy,
}

/// A unit ability
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ability {
    pub trigger: AbilityTrigger,
    pub effect: AbilityEffect,
    pub name: String,
    pub description: String,
    /// Optional condition that must be met for this ability to activate.
    /// If None or AbilityCondition::None, the ability always triggers.
    #[serde(default, skip_serializing_if = "is_condition_none")]
    pub condition: AbilityCondition,
}

fn is_condition_none(c: &AbilityCondition) -> bool {
    matches!(c, AbilityCondition::None)
}

/// Combat stats for a unit
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnitStats {
    pub attack: i32,
    pub health: i32,
}

/// Economy stats shared by all cards
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EconomyStats {
    pub play_cost: i32,
    pub pitch_value: i32,
}

/// A unit card in the game (MVP: units only)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UnitCard {
    pub id: CardId,
    pub template_id: String,
    pub name: String,
    pub stats: UnitStats,
    pub economy: EconomyStats,
    pub abilities: Vec<Ability>,
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
    ) -> Self {
        Self {
            id,
            template_id: template_id.to_string(),
            name: name.to_string(),
            stats: UnitStats { attack, health },
            economy: EconomyStats {
                play_cost,
                pitch_value,
            },
            abilities: vec![],
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
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BoardUnit {
    pub card: UnitCard,
    pub current_health: i32,
}

impl BoardUnit {
    pub fn from_card(card: UnitCard) -> Self {
        let current_health = card.stats.health;
        Self {
            card,
            current_health,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.current_health > 0
    }

    pub fn take_damage(&mut self, amount: i32) {
        self.current_health -= amount;
    }
}

/// Shop slot that can hold a card or be empty
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShopSlot {
    pub card: Option<UnitCard>,
    pub frozen: bool,
}

impl ShopSlot {
    pub fn empty() -> Self {
        Self {
            card: None,
            frozen: false,
        }
    }

    pub fn with_card(card: UnitCard) -> Self {
        Self {
            card: Some(card),
            frozen: false,
        }
    }
}
