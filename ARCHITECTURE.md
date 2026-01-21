You are an Expert Systems Architect and Senior Rust/React Developer. You are tasked with architecting the MVP for "Manalimit," a strategy auto-battler game.

## 1. Project Overview
"Manalimit" is a single-player auto-battler (like Super Auto Pets) but with a unique economy:
- **Core Loop:** Users draft units from a conveyor belt shop.
- **The Economy (Pitch):** Users start turns with 0 Mana. They must "Burn" (destroy) cards from their deck or board to generate Mana to buy new ones.
- **The Constraint (Manalimit):** Users have a "Mana Capacity" that grows each round. Excess mana is lost.
- **No Leveling:** There is no unit merging. Scaling happens by selling weak units to buy expensive ones ("Liquidation").
- **Combat:** Deterministic auto-battle. Initiative is determined by the highest Attack stat.

## 2. The Tech Stack (Strict Constraints)
We are using a **WASM-First Architecture**.
- **Core Logic:** Rust (compiled to WASM). This is the "Source of Truth."
- **Frontend:** React + TypeScript + Vite. This is the "View Layer."
- **Build Tool:** `wasm-pack` for Rust, `vite-plugin-wasm` for React.
- **State Management:** Rust holds the state; React syncs it via a `get_state()` JSON dump.
- **Styling:** TailwindCSS (for speed).
- **Drag & Drop:** `@dnd-kit/core` (React).

## 3. Architecture Rules

### A. The Monorepo Structure
Set up the project with two distinct directories:
```text
/manalimit
  ├── /core (Rust Crate) -> Handles all logic, math, validation, and simulation.
  └── /web  (React App)  -> Handles UI, animations, and inputs.

```

### B. The "Brain" (Rust)

* The Rust `GameState` struct is immutable from the outside.
* Expose a `GameEngine` struct via `#[wasm_bindgen]`.
* Input methods (e.g., `engine.burn_card(id)`) return `Result<(), String>`.
* Output methods (e.g., `engine.get_view()`) return a `JsValue` (serialized JSON).
* Use `serde` for all data structures.
* **Matchmaking:** Implement the "Ghost" system where the opponent is just a static struct `OpponentState`.

### C. The "Hands" (React)

* React **NEVER** calculates game logic (e.g., never do `mana + 2` in JS).
* React only:
1. Calls Rust function (e.g., `rust.pitch_card(index)`).
2. Gets new State.
3. Renders State.


* Use `zustand` to bridge the WASM instance to React components.

## 4. Coding Guidelines

### Rust Guidelines

* Use `ts-rs` (if possible) or ensure JSON keys are `camelCase` via `#[serde(rename_all = "camelCase")]` to match TypeScript standards.
* Combat logic must be deterministic (seeded RNG).
* Implement the "Attack Priority" sort: `triggers.sort_by(|a, b| b.attack.cmp(&a.attack))`.

### React Guidelines

* Create "Dumb" components for Cards (just render props).
* Use `dnd-kit` for the Conveyor Belt interaction.
* Visuals: The "Ash Pile" and "Mana Tank" must be distinct UI zones.

## 5. First Task

Please initialize the **Project Structure** and the **Rust Core Schema**.

1. Define the `Unit`, `Deck`, and `GameState` structs in Rust.
2. Implement the `Pitch` mechanic logic (checking `current_mana + value <= manalimit`).
3. Show the `lib.rs` file exposing these to WASM.
