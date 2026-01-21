### Context 4: The "State Bridge" (The WASM Hook)

*Feed this when Claude starts writing the `App.tsx` or `store.ts` file. This solves the "How do I update the UI?" problem.*

```markdown
## State Management Pattern (Rust -> React)
We strictly follow the "Unidirectional Data Flow" pattern using `zustand` and the Rust `GameEngine`.

### 1. The Rust View Struct
In Rust, define a `GameView` struct that contains *everything* the UI needs to render.
- `player_board`: Vec<UnitView>
- `shop_cards`: Vec<CardView>
- `mana`: i32
- `mana_limit`: i32
- `ash_pile_hover_value`: i32 (Optional, for UI feedback)

### 2. The React Store (Zustand)
Create a store that holds the `WasmEngine` instance and the current `GameView`.

```typescript
interface GameStore {
  // The Raw WASM Instance (Hidden from UI components)
  engine: GameEngine | null;

  // The Renderable Data (Used by UI)
  view: GameView | null;

  // Actions
  init: () => Promise<void>;
  burnCard: (index: number) => void;
  buyCard: (index: number) => void;
  endTurn: () => void;
}

// The Action Pattern
burnCard: (index) => {
  const { engine } = get();
  if (!engine) return;

  // 1. Mutate Rust State
  engine.burn_card(index);

  // 2. Sync View
  // Rust returns the ENTIRE new state tree. We simply replace it.
  set({ view: engine.get_view() });
}

```

**Crucial Rule:** React components never modify state locally. They call an action, which calls Rust, which returns the new Truth.

---

### Context 5: The Battle Engine (Simulation Loop)
*Feed this when asking Claude to implement `engine.rs`. This ensures the specific "Manalimit" rules (Initiative, Simultaneous Damage) are respected.*

```markdown
## Combat Simulation Spec (Rust)
The combat engine must be **Deterministic**. It takes two `BoardState` structs (Player and Enemy) and returns a `CombatLog` (a list of events for React to replay).

### The Loop Logic
While both teams have units > 0:

1.  **Phase: Trigger Check (Start of Battle)**
    - Collect all "On Start" triggers from both teams.
    - **Sort:**
      1. Highest Attack Stat (Descending).
      2. Deterministic RNG (Tie-breaker).
    - Execute triggers in order.

2.  **Phase: Attack Step**
    - Identify Front Unit (Index 0) of Team A and Team B.
    - **Simultaneous Strike:**
      - Calculate Damage A -> B.
      - Calculate Damage B -> A.
    - Apply Damage to both units *at the same time*.

3.  **Phase: Death Check**
    - Remove units with HP <= 0.
    - Trigger "On Faint" effects (Sort by Attack if simultaneous).
    - **Slide:** Remaining units slide forward to fill Index 0.

4.  **Repeat** until one or both teams are empty.

### Output Format
Return a `Vec<CombatEvent>` so the UI can play it like a movie.

```rust
enum CombatEvent {
    Attack { attacker_idx: usize, target_idx: usize, damage: i32 },
    AbilityTrigger { unit_idx: usize, ability_name: String },
    UnitDeath { unit_idx: usize },
    Wait { ms: u64 }, // Pacing for animation
}

```
