# Manalimit: Card Architecture & Schema (MVP)

## 1. Overview

In the **Manalimit** MVP, we focus exclusively on **Unit Cards**. Every card in the deck is a Unit that can be played on the board or pitched for mana.

## 2. The Data Model (Rust Structs)

The core structure is defined in `core/src/types.rs`. We use a flat `UnitCard` structure.

### A. The Unit Card

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnitCard {
    pub id: CardId,             // Unique runtime ID (u32)
    pub template_id: String,    // "static_id" (e.g., "goblin_looter")
    pub name: String,           // Display name
    pub stats: UnitStats,       // Attack/Health
    pub economy: EconomyStats,  // Cost/Pitch
    pub abilities: Vec<Ability>,// Logic
}
```

### B. Stats

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnitStats {
    pub attack: i32,
    pub health: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EconomyStats {
    pub play_cost: i32,    // Blue Gem: Cost to play
    pub pitch_value: i32,  // Red Flame: Mana gained when burned
}
```

## 3. The Ability System

The ability system is robust and supports triggers, conditions, targets, and effects.

### A. The Ability Struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ability {
    pub name: String,
    pub description: String,
    pub trigger: AbilityTrigger,
    pub effect: AbilityEffect,
    
    // Optional Logic
    #[serde(default)]
    pub condition: AbilityCondition, // Default: None (Always runs)
    #[serde(default)]
    pub max_triggers: Option<u32>,   // Default: None (Unlimited)
}
```

### B. Ability Triggers (`AbilityTrigger`)

Defines *when* the ability activates.

```rust
pub enum AbilityTrigger {
    OnStart,            // Start of Battle
    OnFaint,            // When THIS unit dies
    OnAllyFaint,        // When another ally dies
    OnDamageTaken,      // When THIS unit takes damage
    OnSpawn,            // When THIS unit is summoned
    BeforeUnitAttack,   // Before THIS unit attacks
    AfterUnitAttack,    // After THIS unit attacks
    BeforeAnyAttack,    // Before ANY unit attacks
    AfterAnyAttack,     // After ANY unit attacks
}
```

### C. Ability Targets (`AbilityTarget`)

Defines *who* is affected.

```rust
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
```

### D. Ability Effects (`AbilityEffect`)

Defines *what* happens.

```rust
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AbilityEffect {
    Damage { amount: i32, target: AbilityTarget },
    ModifyStats { health: i32, attack: i32, target: AbilityTarget },
    SpawnUnit { template_id: String },
    Destroy { target: AbilityTarget },
}
```

### E. Conditions (`AbilityCondition`)

Logic gates that must be true for the ability to fire.

```rust
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AbilityCondition {
    None,

    // Target Checks
    TargetHealthLessThanOrEqual { value: i32 },
    TargetHealthGreaterThan { value: i32 },
    TargetAttackLessThanOrEqual { value: i32 },
    TargetAttackGreaterThan { value: i32 },

    // Source Checks
    SourceHealthLessThanOrEqual { value: i32 },
    SourceHealthGreaterThan { value: i32 },
    SourceAttackLessThanOrEqual { value: i32 },
    SourceAttackGreaterThan { value: i32 },
    SourceIsFront,
    SourceIsBack,

    // Board Checks
    AllyCountAtLeast { count: usize },
    AllyCountAtMost { count: usize },

    // Logic
    And { left: Box<AbilityCondition>, right: Box<AbilityCondition> },
    Or { left: Box<AbilityCondition>, right: Box<AbilityCondition> },
    Not { inner: Box<AbilityCondition> },
}
```

## 4. JSON Examples (Runtime View)

This is what the React Frontend receives in `view.shop[i].card`.

### Example 1: Basic Unit (Goblin Looter)

```json
{
  "id": 101,
  "templateId": "goblin_looter",
  "name": "Goblin Looter",
  "stats": { "attack": 2, "health": 1 },
  "economy": { "playCost": 1, "pitchValue": 3 },
  "abilities": [
    {
      "name": "Loot",
      "description": "On Faint: Deal 1 damage to a random enemy.",
      "trigger": "OnFaint",
      "effect": {
        "type": "Damage",
        "amount": 1,
        "target": "RandomEnemy"
      },
      "condition": { "type": "None" }
    }
  ]
}
```

### Example 2: Complex Conditional (Pack Leader)

```json
{
  "id": 205,
  "templateId": "pack_leader",
  "name": "Pack Leader",
  "stats": { "attack": 4, "health": 4 },
  "economy": { "playCost": 5, "pitchValue": 1 },
  "abilities": [
    {
      "name": "Command",
      "description": "Start of Battle: If you have 4+ allies, give everyone +2/+2.",
      "trigger": "OnStart",
      "effect": {
        "type": "ModifyStats",
        "attack": 2,
        "health": 2,
        "target": "AllAllies"
      },
      "condition": {
        "type": "AllyCountAtLeast",
        "count": 4
      }
    }
  ]
}
```