use serde::{Deserialize, Serialize};

/// Unique identifier for cards
pub type CardId = u32;

/// Ability trigger conditions
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AbilityTrigger {
    OnStart,
    OnFaint,
    OnSpawn,
    // Future: OnAttack, OnDamage, etc.
}

/// Ability effect types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
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
    SpawnUnit {
        attack: i32,
        health: i32,
        name: String,
    },
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
}

/// A unit ability
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ability {
    pub trigger: AbilityTrigger,
    pub effect: AbilityEffect,
    pub name: String,
    pub description: String,
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
#[serde(rename_all = "camelCase")]
pub struct UnitCard {
    pub id: CardId,
    pub template_id: String,
    pub name: String,
    pub stats: UnitStats,
    pub economy: EconomyStats,
    pub ability: Option<Ability>,
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
            ability: None,
        }
    }

    pub fn with_ability(mut self, ability: Ability) -> Self {
        self.ability = Some(ability);
        self
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
