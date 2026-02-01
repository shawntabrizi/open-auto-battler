# Manalimit: Card Architecture & Schema (Composable System)

## 1. Overview

In the **Manalimit** MVP, we focus exclusively on **Unit Cards**. Every card in the deck is a Unit that can be played on the board or pitched for mana. The ability system has been refactored from a flat enum structure into a **composable building block** system for greater flexibility.

## 2. The Data Model (Rust Structs)

The core structure is defined in `core/src/types.rs`. We use a flat `UnitCard` structure.

### A. The Unit Card

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
pub struct UnitStats {
    pub attack: i32,
    pub health: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EconomyStats {
    pub play_cost: i32,    // Blue Gem: Cost to play
    pub pitch_value: i32,  // Red Flame: Mana gained when burned
}
```

## 3. The Composable Ability System

The system uses several building block enums to construct complex logic.

### A. Building Blocks

```rust
pub enum TargetScope {
    SelfUnit,       // The unit with the ability
    Allies,         // All units on same team
    Enemies,        // All units on opposing team
    All,             // Every unit on board
    AlliesOther,    // Allies excluding self
    TriggerSource,  // The unit that caused the trigger (e.g., the unit that died)
    Aggressor,      // Alias for TriggerSource initially
}

pub enum StatType {
    Health,
    Attack,
    Mana,           // Maps to play_cost
}

pub enum SortOrder {
    Ascending,      // Lowest to Highest
    Descending,     // Highest to Lowest
}

pub enum CompareOp {
    GreaterThan,
    LessThan,
    Equal,
    GreaterThanOrEqual,
    LessThanOrEqual,
}
```

### B. The Ability Struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Ability {
    pub name: String,
    pub description: String,
    pub trigger: AbilityTrigger,
    pub effect: AbilityEffect,
    
    /// The list of conditions implies "AND".
    /// If empty, it always triggers.
    #[serde(default)]
    pub conditions: Vec<Condition>,
    
    #[serde(default)]
    pub max_triggers: Option<u32>,   // Default: None (Unlimited)
}
```

### C. Ability Triggers (`AbilityTrigger`)

Defines *when* the ability activates.

```rust
pub enum AbilityTrigger {
    OnStart,            // Start of Battle
    OnFaint,            // When THIS unit dies
    OnAllyFaint,        // When another ally dies
    OnHurt,             // When THIS unit takes damage (formerly OnDamageTaken)
    OnSpawn,            // When THIS unit is summoned
    OnAllySpawn,        // When an ally is summoned
    OnEnemySpawn,       // When an enemy is summoned
    BeforeUnitAttack,   // Before THIS unit attacks (must be in front)
    AfterUnitAttack,    // After THIS unit attacks (must be in front)
    BeforeAnyAttack,    // Before ANY unit clash occurs
    AfterAnyAttack,     // After ANY unit clash occurs
}
```

### D. Ability Targets (`AbilityTarget`)

Defines *who* is affected using composable logic.

```rust
#[serde(tag = "type", content = "data")]
pub enum AbilityTarget {
    /// Specific position (0=front, -1=back). scope=SelfUnit means relative (-1 ahead, 1 behind).
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
```

### E. Conditions (`Matcher` and `Condition`)

A two-tier architecture to prevent stack overflows while allowing logical "OR" operations.

```rust
/// Pure logic variants (Leaf nodes). Strictly NO recursion and NO containers.
pub enum Matcher {
    StatValueCompare { scope: TargetScope, stat: StatType, op: CompareOp, value: i32 },
    StatStatCompare { source_stat: StatType, op: CompareOp, target_scope: TargetScope, target_stat: StatType },
    UnitCount { scope: TargetScope, op: CompareOp, value: u32 },
    IsPosition { scope: TargetScope, index: i32 },
}

/// Structural variants. Controls flow. Can hold Matchers, but CANNOT hold itself.
pub enum Condition {
    /// A single mandatory requirement.
    Is(Matcher),
    /// A "Shallow OR" list. Returns true if ANY of the internal Matchers are true.
    AnyOf(Vec<Matcher>),
}
```

## 4. JSON Examples (Refactored View)

### Example 1: Stat-based Targeting (Headhunter)

```json
{
  "template_id": "headhunter",
  "name": "Headhunter",
  "abilities": [
    {
      "name": "Assassinate",
      "trigger": "OnStart",
      "effect": {
        "type": "Damage",
        "amount": 5,
        "target": {
          "type": "Standard",
          "data": {
            "scope": "Enemies",
            "stat": "Health",
            "order": "Ascending",
            "count": 1
          }
        }
      },
      "conditions": []
    }
  ]
}
```

### Example 2: Positional & Conditional (Nurse Goblin)

```json
{
  "template_id": "nurse_goblin",
  "name": "Nurse Goblin",
  "abilities": [
    {
      "name": "Emergency Heal",
      "trigger": "BeforeAnyAttack",
      "effect": {
        "type": "ModifyStats",
        "health": 2,
        "attack": 0,
        "target": {
          "type": "Position",
          "data": { "scope": "Allies", "index": 0 }
        }
      },
      "conditions": [
        {
          "type": "Is",
          "data": {
            "type": "StatValueCompare",
            "data": {
              "scope": "Allies",
              "stat": "Health",
              "op": "LessThanOrEqual",
              "value": 6
            }
          }
        }
      ]
    }
  ]
}
```
