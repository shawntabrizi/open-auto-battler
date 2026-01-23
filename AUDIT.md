# Core Engine Audit: Blockchain & Performance

## 1. Overview
This document outlines the safety measures, computational bounds, and deterministic guarantees of the **Manalimit Core Engine**. The engine is designed to be "Gas Safe," meaning it prevents infinite loops, stack overflows, and memory exhaustion during battle simulation.

## 2. Determinism
The engine is **strictly deterministic**. Given the same seed and initial board states, the combat simulation will always produce identical results.

- **Seeded RNG:** Uses `rand::rngs::StdRng` with a seed derived from the Round Number.
- **Tie-Breaker Hierarchy:** Trigger resolution uses a 5-level strict hierarchy to eliminate ambiguity:
  1. **Attack Power** (Highest First)
  2. **Current Health** (Highest First)
  3. **Team Priority** (Player > Enemy)
  4. **Board Position** (Front > Back)
  5. **Ability Order** (First > Last)

## 3. Computational Limits (`limits.rs`)
To prevent malicious or accidental "Infinite Loops" (which would stall a blockchain validator), the engine enforces the following hard caps:

| Limit | Value | Purpose |
| :--- | :--- | :--- |
| `MAX_BATTLE_ROUNDS` | 100 | Prevents "Stall Units" (e.g., infinite healing) from running forever. |
| `MAX_RECURSION_DEPTH` | 50 | Prevents stack overflow from deeply nested effects. |
| `MAX_TRIGGER_DEPTH` | 10 | Caps reactive "chains" (A triggers B triggers C...). |
| `MAX_TRIGGERS_PER_PHASE` | 200 | Prevents "Infinite Combo" logic within a single attack step. |
| `MAX_SPAWNS_PER_BATTLE` | 100 | Prevents memory exhaustion from spawning infinite tokens. |

**Failure State:** If any limit is reached, the engine immediately halts and returns a `LimitExceeded` event.

## 4. Resource Complexity (Big O)
The engine is optimized for small-scale board states (Max 5 units per side).

- **Board Scans:** $O(N)$ where $N \le 10$. Linear scans of vectors are used instead of HashMaps to avoid hashing overhead and ensure consistent iteration order.
- **Trigger Sorting:** $O(T \log T)$ where $T \le 200$ (Max Triggers per phase).
- **Target Selection:** $O(N)$. Most targets (Random, Front, Lowest Health) require a single pass over the board.
- **Memory Footprint:** The engine operates primarily on the stack and pre-allocated vectors. Total memory usage per battle is bounded and predictable.

## 5. Potential Optimizations (Backlog)
For ultra-high-performance environments (e.g., Solana, Polkadot, or ZK-Provers), the following optimizations are identified:

1. **Zero-Copy Serialization:** Move from `serde_json` to `Bincode` or `Borsh` for faster WASM/Host boundary crossing.
2. **Instance ID Interning:** Use `u32` indices for target resolution rather than `String` instance IDs to eliminate heap allocations.
3. **Delta-Only Events:** Modify `UnitDeath` and `UnitSpawn` events to only send the affected unit's ID rather than the entire board state.
