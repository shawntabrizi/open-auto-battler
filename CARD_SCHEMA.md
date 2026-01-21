# Manalimit: Card Architecture & Schema

## 1. Overview

In **Manalimit**, every card in the deck serves a dual purpose: it is a playable asset (Unit, Equipment, Action) and an economic resource (Pitch Value). This schema defines how cards are structured to support the "Brain (Rust) / Hands (React)" architecture.

## 2. Card Types

There are three distinct card types:

1. **Unit (Creature):** A permanent entity that sits on the Board and fights.
2. **Equipment (Buff):** A permanent attachment that targets a Unit on the Board/Bench and grants stats or new abilities.
3. **Action (Spell):** A one-time effect that resolves immediately and is then discarded (sent to Ash Pile).

## 3. The Data Model (Rust Structs)

### A. The Core Card Struct

Every card shares a common `CardTemplate` structure, which wraps the specific data for its type.

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardTemplate {
    pub id: String,
    pub name: String,
    pub description: String,

    // Visual / Meta
    pub metadata: CardMetadata,

    // Economy (Shared by all types)
    pub economy: EconomyStats,

    // The Specific Logic (Enum)
    pub data: CardTypeData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "params", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CardTypeData {
    Unit(UnitData),
    Equipment(EquipmentData),
    Action(ActionData),
}

```

### B. Economy Stats

Since *every* card can be Pitched, every card needs these stats.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EconomyStats {
    pub play_cost: i32,    // Blue Gem: Cost to play
    pub pitch_value: i32,  // Red Flame: Mana gained when burned
}

```

### C. Specific Data Structures

#### 1. Unit Data

Units are the only cards with Health/Attack and Board positioning.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitData {
    pub stats: UnitStats,
    pub abilities: Vec<Ability>,
    pub tags: Vec<String>, // e.g., "BEAST", "DRAGON"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitStats {
    pub attack: i32,
    pub health: i32,
}

```

#### 2. Equipment Data

Equipment must attach to a valid target. It modifies the host unit's stats or grants it new triggers.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquipmentData {
    pub stats_modifier: UnitStats, // e.g., +2 Attack, +0 Health
    pub granted_abilities: Vec<Ability>, // e.g., "Grant: On Attack, Draw 1"
    pub equip_restrictions: Vec<String>, // e.g., ["ONLY_BEASTS"]
}

```

#### 3. Action Data

Actions are simpler; they have a target and an immediate effect chain.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionData {
    pub target: Target, // e.g., "RANDOM_ENEMY" or "SELECT_FRIEND"
    pub effects: Vec<Effect>,
}

```

## 4. The Ability System (Triggers & Effects)

This is the engine that drives gameplay. Units have `Abilities` (Triggered Effects), while Actions are just raw `Effects`.

### A. The Ability Struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ability {
    pub name: String,
    pub description: String,
    pub trigger: Trigger,
    pub target: Target,
    pub effect: Effect,
}

```

### B. Enums (The Logic Blocks)

#### Triggers

When does this happen?

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "params", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Trigger {
    OnStartBattle,
    OnTurnStart, // Shop Phase start
    OnPitch,     // When THIS card is pitched
    OnSacrifice, // When THIS unit (on board) is pitched
    OnAttack,
    OnHurt,
    OnFaint,
    OnKill,
    OnEquip,     // Specific to Equipment: When attached
    Passive,     // Always active (e.g., Aura)
}

```

#### Targets

Who does this affect?

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Target {
    pub selector: TargetSelector,
    #[serde(default = "default_count")]
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TargetSelector {
    Self_,
    FriendAhead,
    FriendBehind,
    AllFriends,
    RandomEnemy,
    LowestHealthEnemy,
    HighestHealthEnemy,
    ShopSlot, // For actions like "Freeze Shop"
    Player,   // For actions like "Heal Player Life"
}

```

#### Effects

What happens?

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "params", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Effect {
    // Combat
    DealDamage { amount: i32, type_: String },
    Heal { amount: i32 },
    AddShield { amount: i32 }, // Temp HP
    Kill, // Instakill logic

    // Stat Modification
    ModifyStats { attack: i32, health: i32 }, // Permanent if Unit/Equip, Temp if Action?

    // Economy
    GainMana { amount: i32 },
    DiscountShop { amount: i32 },
    RefreshShop,

    // Spawning
    SummonToken { unit_id: String },

    // Keyword Application
    ApplyKeyword { keyword: String }, // "TAUNT", "POISON", etc.
}

```

## 5. JSON Examples (Data Entry)

### Example 1: The "Goblin Looter" (Unit)

*Archetype: Battery (Low Cost, High Pitch)*

```json
{
  "id": "goblin_looter",
  "name": "Goblin Looter",
  "description": "Cheap fodder. Burns brightly.",
  "metadata": { "rarity": "COMMON" },
  "economy": { "playCost": 1, "pitchValue": 3 },
  "data": {
    "type": "UNIT",
    "params": {
      "stats": { "attack": 1, "health": 1 },
      "tags": ["GOBLIN"],
      "abilities": []
    }
  }
}

```

### Example 2: "Heavy Plate" (Equipment)

*Archetype: Buff*

```json
{
  "id": "heavy_plate",
  "name": "Heavy Plate",
  "description": "Give a unit +0/+4 and Taunt.",
  "metadata": { "rarity": "RARE" },
  "economy": { "playCost": 3, "pitchValue": 1 },
  "data": {
    "type": "EQUIPMENT",
    "params": {
      "statsModifier": { "attack": 0, "health": 4 },
      "equipRestrictions": [],
      "grantedAbilities": [
        {
          "name": "Taunt",
          "description": "Enemies must attack me first.",
          "trigger": { "type": "PASSIVE" },
          "target": { "selector": "SELF" },
          "effect": { "type": "APPLY_KEYWORD", "params": { "keyword": "TAUNT" } }
        }
      ]
    }
  }
}

```

### Example 3: "Desperate Ritual" (Action)

*Archetype: Economy Spell*

```json
{
  "id": "desperate_ritual",
  "name": "Desperate Ritual",
  "description": "Destroy a friendly unit to gain 4 Mana.",
  "metadata": { "rarity": "COMMON" },
  "economy": { "playCost": 0, "pitchValue": 1 },
  "data": {
    "type": "ACTION",
    "params": {
      "target": { "selector": "SELECT_FRIEND", "count": 1 },
      "effects": [
        { "type": "KILL", "params": {} },
        { "type": "GAIN_MANA", "params": { "amount": 4 } }
      ]
    }
  }
}

```

## 6. Implementation Notes (React Integration)

When mapping this to React Props:

1. **Rendering Cards:**
* Check `card.data.type`.
* If `UNIT` -> Render Attack/Health badges in bottom corners.
* If `EQUIPMENT` -> Render "Hammer" icon + Stat Modifiers (+2/+2).
* If `ACTION` -> Render "Sparkle" icon + Description text centered.


2. **Drag & Drop Rules:**
* `UNIT` -> Can be dropped on **Bench** or **Empty Board Slot**.
* `EQUIPMENT` -> Can ONLY be dropped on **Existing Friendly Unit**.
* `ACTION` -> Drop behavior depends on target:
* If `SELECT_FRIEND`: Drop on Friend.
* If `GLOBAL` (e.g. Refresh Shop): Drop on Board Center.




3. **Pitching:**
* ALL types can be dropped on the **Ash Pile**. The `economy.pitchValue` is located in the top-right corner of the card frame (Red Flame Icon).
