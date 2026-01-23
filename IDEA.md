# Project Specification: "Manalimit"

## 1. High-Level Concept

**Manalimit** is a single-player strategy auto-battler (similar to *Super Auto Pets*) with a unique "Pure Pitch" economy.

* **The Hook:** There is no automatic mana regeneration. Your Deck is your Economy. To play cards, you must destroy other cards from your supply ("Pitching").
* **The Constraint:** You cannot hoard infinite mana. Your "Manalimit" (Capacity) caps how much mana you can hold at once, forcing you to scale your ambition as the game progresses.

## 2. Gameplay Rules

### The Economy (Pitch & Limit)

* **Starting State:** Players start every turn with **0 Mana**.
* **Pitching:** Players drag a card from the Shop or Board to the **Ash Pile** to destroy it. This generates Mana equal to the card's `pitch_value`.
* **The Limit:** Players have a Mana Cap that increases by **+1 per Round** (Starts at 3, Max 10). Excess mana generated beyond this limit is lost immediately.
* **Starvation:** Pitching cards permanently removes them from the deck. If the deck reaches 0 cards, the shop stops refilling.

### The Progression (Liquidation)

* **No Leveling:** There is **NO** unit merging or leveling up (e.g., 3 Rats  1 Big Rat).
* **Scaling:** Players scale by "Liquidation." In the late game, they must Pitch their early-game units (removing them from the board) to generate the Mana needed to buy high-cost late-game units.

### The Combat (Deterministic)

* **Auto-Battle:** Combat is fully automated against a "Ghost" (snapshot) of an opponent with a similar Round/Win record.
* **Simultaneous Damage:** Units attack Front-to-Back. The two front units strike each other at the same time.
* **Initiative (Reaction Speed):** Triggers (like "Start of Battle") are resolved based on a deterministic hierarchy:
    1. **Highest Attack**
    2. **Highest Health**
    3. **Player Priority**
    4. **Front-to-Back Position**
    5. **Ability Order**


* **Draws:** If both teams die simultaneously, it is a "Wash." The player gains no Trophies but loses no Lives.

## 3. Technical Architecture

We are building a **WASM-First Hybrid Application**.

### The "Brain" (Rust Core)

* **Role:** The Source of Truth. Handles all logic, math, validation, and battle simulation.
* **Output:** Compiled to WebAssembly (`.wasm`) using `wasm-pack`.
* **State:** Exposes a `GameEngine` struct that holds the state.
* **API:**
* `engine.burn_card(index)` -> Returns Result.
* `engine.get_view()` -> Returns a JSON snapshot for React.



### The "Hands" (React UI)

* **Role:** The View Layer. Pure visualization of the Rust state.
* **Stack:** React, TypeScript, Vite, TailwindCSS.
* **State Management:** `zustand` stores the WASM instance and syncs the View JSON.
* **Drag & Drop:** `@dnd-kit/core` handles the complex interactions (Shop -> Board, Card -> Ash Pile).

## 4. Visual Layout (Mobile Landscape)

The UI is optimized for a horizontal (16:9) mobile experience, divided into three horizontal bands.

* **Zone 1: Top HUD (Information)**
* Lives (Hearts), Trophies (Wins), and Round Counter.


* **Zone 2: The Arena (Center Stage)**
* **The Board:** Two horizontal rows of 5 units facing each other in the center.
* *Player:* `[5][4][3][2][1] ->`
* *Enemy:* `<- [1][2][3][4][5]`


* **The Bench:** A row of 7 slots directly below the Player's units.


* **Zone 3: The Command Deck (Bottom Footer)**
* **Left Anchor:** The **Ash Pile**. Large "Incinerator" zone for the Left Thumb.
* **Right Anchor:** The **Mana Tank**. Liquid bar showing `Current / Limit` for the Right Thumb.
* **Center:** The **Conveyor Belt (Shop)**. A scrolling list of cards moving Left-to-Right between the anchors.



## 5. Data Schema (Simplified)

We use a single `CardTemplate` for all entities.

```json
{
  "id": "void_walker",
  "name": "Void Walker",
  "economy": {
    "playCost": 5,      // Blue Gem: Cost to Buy
    "pitchValue": 1     // Red Flame: Mana gained when Burned
  },
  "stats": {
    "attack": 6,
    "health": 6
  },
  "abilities": [
    {
      "trigger": "ON_START_BATTLE",
      "target": "RANDOM_ENEMY",
      "effect": {
        "type": "DEAL_DAMAGE",
        "params": { "amount": 3 }
      }
    }
  ]
}

```

## 6. Development Priorities (MVP)

1. **Skeleton:** Set up Monorepo (`/core` + `/web`) and get Rust compiling to WASM in Vite.
2. **Economy Loop:** Implement the Shop, Ash Pile, and Mana Tank logic. Ensure the "Manalimit" cap works.
3. **Battle Engine:** Implement the deterministic combat simulator with the "Highest Attack = First Action" rule.
