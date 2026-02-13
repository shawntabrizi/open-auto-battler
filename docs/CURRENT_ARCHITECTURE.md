# Open Auto Battler: Current Architecture (January 30, 2026)

This document describes the current architecture of Open Auto Battler, an auto-battler game where the battle engine runs identically in the browser (via WASM) and on a blockchain (via Substrate pallet).

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         React Frontend                               │   │
│  │                        (web/src/components)                          │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│                    ┌────────────┴────────────┐                             │
│                    ▼                         ▼                             │
│  ┌─────────────────────────┐   ┌─────────────────────────────────────┐    │
│  │      gameStore.ts       │   │       blockchainStore.ts            │    │
│  │   (Local Game State)    │   │   (Chain Sync & Transactions)       │    │
│  └───────────┬─────────────┘   └─────────────────┬───────────────────┘    │
│              │ Serde/JSON                        │ SCALE                   │
│              ▼                                   │                         │
│  ┌─────────────────────────┐                    │                         │
│  │    WASM Game Engine     │◄───────────────────┘                         │
│  │     (client crate)      │                                               │
│  │                         │                                               │
│  │  ┌───────────────────┐  │                                               │
│  │  │   oab-core  │  │                                               │
│  │  │  (shared logic)   │  │                                               │
│  │  └───────────────────┘  │                                               │
│  └─────────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ SCALE-encoded actions
                                      │ (via polkadot-api)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUBSTRATE BLOCKCHAIN                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      auto-battle pallet                              │   │
│  │                                                                      │   │
│  │  ┌───────────────────┐    ┌────────────────────────────────────┐   │   │
│  │  │   oab-core  │    │  Storage:                          │   │   │
│  │  │  (shared logic)   │    │  - ActiveGame<AccountId>           │   │   │
│  │  │                   │    │  - CardSets<SetId>                 │   │   │
│  │  └───────────────────┘    └────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Principle: Shared Battle Engine

The key architectural decision is that **the same Rust code** (`oab-core`) executes in both environments:

```
┌─────────────────────────────────────────────────────────────────┐
│                      oab-core                             │
│                      (core/ crate)                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   battle.rs  │  │   state.rs   │  │      commit.rs        │ │
│  │              │  │              │  │                       │ │
│  │ - Combat     │  │ - GameState  │  │ - verify_and_apply_   │ │
│  │ - Abilities  │  │ - CardSet    │  │   turn()              │ │
│  │ - Events     │  │ - Phases     │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   units.rs   │  │  bounded.rs  │  │      types.rs         │ │
│  │              │  │              │  │                       │ │
│  │ - Card defs  │  │ - Bounded    │  │ - CommitTurnAction    │ │
│  │ - Card sets  │  │   types for  │  │ - TurnAction          │ │
│  │ - Genesis    │  │   on-chain   │  │ - BoardUnit           │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
          │                                      │
          │ compiled to                          │ linked as
          ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────────┐
│   WASM (browser)    │              │   Native (blockchain)   │
│   via client crate  │              │   via auto-battle pallet│
└─────────────────────┘              └─────────────────────────┘
```

## Two Serialization Strategies

The system uses **two different serialization approaches** depending on the context:

### Browser ↔ WASM: Serde/JSON

For local gameplay (no blockchain), the React frontend communicates with the WASM engine using **Serde JSON serialization** via `serde-wasm-bindgen`:

```
┌──────────────────┐     JSON (via serde)     ┌──────────────────┐
│  React Frontend  │ ◄──────────────────────► │   WASM Engine    │
│                  │                          │                  │
│  gameStore.ts    │  engine.get_view()       │  GameEngine      │
│                  │  engine.play_hand_card() │                  │
└──────────────────┘                          └──────────────────┘
```

This is fast and convenient for local iteration - no blockchain needed.

### Browser ↔ Chain: SCALE

For blockchain communication, we use **SCALE encoding** to ensure byte-perfect compatibility:

```
┌──────────────────┐    SCALE bytes     ┌──────────────────┐
│  Browser (WASM)  │ ──────────────────►│  Chain (Pallet)  │
│                  │                    │                  │
│  Same Rust types │◄──────────────────│  Same Rust types │
└──────────────────┘    SCALE bytes     └──────────────────┘
```

Why SCALE for chain communication?
- **Byte-perfect**: Same Rust types encode identically in WASM and native
- **No translation layer**: Actions encoded in browser decode exactly on-chain
- **Type safety**: SCALE codec is derived from the same Rust structs

### SCALE Flow in Practice

```
                        SHOP PHASE (Browser)
                              │
    User plays cards, pitches, rearranges board
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  WASM Engine tracks actions in action_log: Vec<TurnAction>  │
│                                                             │
│  TurnAction::PitchFromHand { hand_index: 2 }               │
│  TurnAction::PlayFromHand { hand_index: 0, board_slot: 1 } │
│  TurnAction::SwapBoard { slot_a: 0, slot_b: 1 }            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ get_commit_action_scale()
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  CommitTurnAction.encode() -> Vec<u8>                       │
│                                                             │
│  Raw SCALE bytes: [0x0c, 0x00, 0x02, 0x01, 0x00, 0x01, ...] │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ polkadot-api codec decode
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend decodes to JavaScript object for tx submission    │
│                                                             │
│  const action = codecs.tx.AutoBattle.submit_turn.dec(raw);  │
│  api.tx.AutoBattle.submit_turn(action).signAndSubmit(...);  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Extrinsic submitted
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Pallet receives BoundedCommitTurnAction<T>                 │
│                                                             │
│  verify_and_apply_turn(&mut core_state, &action)           │
│    - Same function as browser!                              │
│    - Validates all moves                                    │
│    - Updates state identically                              │
└─────────────────────────────────────────────────────────────┘
```

### State Synchronization (Chain → Browser)

```
                    AFTER CHAIN PROCESSES TURN
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Browser fetches raw storage via polkadot-api               │
│                                                             │
│  const gameKey = api.query.AutoBattle.ActiveGame.getKey(); │
│  const rawHex = await client.rawQuery(gameKey);            │
│  const gameRaw = Binary.fromHex(rawHex).asBytes();         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Raw SCALE bytes
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  WASM Engine decodes directly                               │
│                                                             │
│  engine.init_from_scale(gameRaw, cardSetRaw);              │
│                                                             │
│  Internally:                                                │
│    BoundedLocalGameState::decode(&mut session_slice)       │
│    BoundedCardSet::decode(&mut card_set_slice)             │
│    GameState::reconstruct(card_pool, set_id, local_state)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
            Browser state is now identical to chain state
```

## Bounded vs Unbounded Types

The `oab-core` engine uses **unbounded types** (standard `Vec`, `BTreeMap`, etc.) for maximum flexibility. This allows the engine to support any configuration without compile-time limits.

For **on-chain storage**, the pallet wraps these in **bounded types** with configurable limits:

```rust
// Core engine uses unbounded types
pub struct GameState {
    pub bag: Vec<CardId>,              // Any size
    pub board: Vec<Option<BoardUnit>>, // Any size
    pub hand: Vec<CardId>,             // Any size
}

// Pallet uses bounded versions with runtime-configurable limits
pub type BoundedGameState<T> = CoreBoundedGameState<
    <T as Config>::MaxBagSize,      // e.g., 100 cards
    <T as Config>::MaxBoardSize,    // e.g., 5 slots
    <T as Config>::MaxAbilities,    // e.g., 4 abilities per card
    <T as Config>::MaxStringLen,    // e.g., 64 chars
    <T as Config>::MaxHandActions,  // e.g., 14 actions per turn
>;
```

This separation means:
- **WASM engine**: Can run games with any configuration (testing, custom modes)
- **On-chain**: Has guaranteed bounds for storage and computation limits
- **Conversion**: `bounded.rs` provides `From` implementations between bounded/unbounded

## Battle Execution Limits

The `oab-core` engine has **internal safeguards** to prevent infinite loops and stack overflows during battle resolution:

```rust
// From core/src/limits.rs
pub const MAX_RECURSION_DEPTH: u32 = 50;    // Nested ability triggers
pub const MAX_SPAWNS_PER_BATTLE: u32 = 100; // Total units spawned
pub const MAX_TRIGGERS_PER_PHASE: u32 = 200; // Ability activations per phase
pub const MAX_TRIGGER_DEPTH: u32 = 10;      // Chained trigger depth
pub const MAX_BATTLE_ROUNDS: u32 = 100;     // Combat rounds before draw
```

If any limit is exceeded, the offending team **loses the battle**. This prevents:
- Infinite spawn loops (unit spawns unit spawns unit...)
- Infinite trigger chains (ability triggers ability triggers...)
- Battles that never resolve

## Ability System

The engine features a composable ability system where complex card behaviors emerge from simple building blocks.

### Ability Structure

```rust
pub struct Ability {
    pub trigger: AbilityTrigger,    // When does it fire?
    pub effect: AbilityEffect,      // What does it do?
    pub conditions: Vec<Condition>, // Optional requirements (AND logic)
    pub max_triggers: Option<u32>,  // Limit activations per battle
}
```

### Building Blocks

**Triggers** - When abilities activate:
```
OnStart          - Battle begins
OnFaint          - This unit dies
OnAllyFaint      - An ally dies
OnHurt           - This unit takes damage
OnSpawn          - This unit enters play
OnAllySpawn      - An ally enters play
OnEnemySpawn     - An enemy enters play
BeforeUnitAttack - Before this unit attacks
AfterUnitAttack  - After this unit attacks
BeforeAnyAttack  - Before any unit attacks
AfterAnyAttack   - After any unit attacks
```

**Effects** - What abilities do:
```
Damage { amount, target }           - Deal damage
ModifyStats { health, attack, target } - Buff/debuff stats
SpawnUnit { template_id }           - Create a new unit
Destroy { target }                  - Instantly kill target
```

**Targets** - Who is affected:
```
Position { scope, index }  - Specific slot (0=front, -1=back)
Random { scope, count }    - Random units from scope
All { scope }              - All units in scope
```

**Scopes** - Which units to consider:
```
SelfUnit    - The ability owner
Allies      - All friendly units
AlliesOther - All allies except self
Enemies     - All enemy units
All         - Everyone
```

**Conditions** - Optional requirements:
```
StatValueCompare { scope, stat, op, value }  - Compare stat to number
StatStatCompare { source, op, target, stat } - Compare two stats
UnitCount { scope, op, value }               - Count units in scope
```

### Example Cards

**Simple: Goblin Grunt** (no abilities)
```rust
CardTemplate {
    template_id: "goblin_grunt",
    name: "Goblin Grunt",
    attack: 2, health: 2,
    play_cost: 2, pitch_value: 1,
    abilities: vec![],  // Pure stats, no tricks
}
```

**Basic Ability: Rat Swarm** (spawn on death)
```rust
CardTemplate {
    template_id: "rat_swarm",
    name: "Rat Swarm",
    attack: 1, health: 1,
    play_cost: 1, pitch_value: 1,
    abilities: vec![Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::SpawnUnit {
            template_id: String::from("rat_token"),
        },
        conditions: vec![],
        max_triggers: Some(1),  // Only once per battle
    }],
}
```

**Positional: Scaredy Cat** (buffs ally behind)
```rust
CardTemplate {
    template_id: "scaredy_cat",
    name: "Scaredy Cat",
    attack: 1, health: 3,
    play_cost: 1, pitch_value: 2,
    abilities: vec![Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::ModifyStats {
            health: 2, attack: 0,
            target: AbilityTarget::Position {
                scope: TargetScope::SelfUnit,
                index: 1,  // One slot behind self
            },
        },
        conditions: vec![],
        max_triggers: None,
    }],
}
```

**Conditional: Nurse Goblin** (heals low-health allies)
```rust
CardTemplate {
    template_id: "nurse_goblin",
    name: "Nurse Goblin",
    attack: 1, health: 3,
    play_cost: 2, pitch_value: 2,
    abilities: vec![Ability {
        trigger: AbilityTrigger::BeforeAnyAttack,
        effect: AbilityEffect::ModifyStats {
            health: 2, attack: 0,
            target: AbilityTarget::Position {
                scope: TargetScope::Allies,
                index: 0,  // Front ally
            },
        },
        conditions: vec![Condition::Is(Matcher::StatValueCompare {
            scope: TargetScope::Allies,
            stat: StatType::Health,
            op: CompareOp::LessThanOrEqual,
            value: 6,  // Only heals if health <= 6
        })],
        max_triggers: None,
    }],
}
```

**AOE: Abyssal Bomber** (damages everyone on death)
```rust
CardTemplate {
    template_id: "abyssal_bomber",
    name: "Abyssal Bomber",
    attack: 2, health: 2,
    play_cost: 4, pitch_value: 2,
    abilities: vec![Ability {
        trigger: AbilityTrigger::OnFaint,
        effect: AbilityEffect::Damage {
            amount: 3,
            target: AbilityTarget::All {
                scope: TargetScope::All,  // Hits EVERYONE
            },
        },
        conditions: vec![],
        max_triggers: None,
    }],
}
```

**Sniper: Archer** (hits back line)
```rust
CardTemplate {
    template_id: "archer",
    name: "Archer",
    attack: 1, health: 3,
    play_cost: 3, pitch_value: 2,
    abilities: vec![Ability {
        trigger: AbilityTrigger::OnStart,
        effect: AbilityEffect::Damage {
            amount: 1,
            target: AbilityTarget::Position {
                scope: TargetScope::Enemies,
                index: -1,  // Back enemy
            },
        },
        conditions: vec![],
        max_triggers: None,
    }],
}
```

## Directory Structure

```
auto-battle/
├── core/                    # Shared battle engine (oab-core)
│   └── src/
│       ├── battle.rs        # Combat resolution, abilities, events
│       ├── bounded.rs       # Bounded types for on-chain storage
│       ├── commit.rs        # Turn verification: verify_and_apply_turn()
│       ├── limits.rs        # Battle execution safeguards
│       ├── state.rs         # GameState, CardSet, phases
│       ├── types.rs         # CommitTurnAction, TurnAction, Ability, etc.
│       ├── units.rs         # Card definitions, sets, genesis bags
│       └── tests/           # Comprehensive test suite
│
├── client/                  # WASM bindings for browser
│   └── src/
│       ├── engine.rs        # GameEngine with wasm_bindgen exports
│       ├── lib.rs           # WASM entry point
│       └── sandbox.rs       # Fuzz testing utilities
│
├── blockchain/              # Substrate blockchain
│   ├── pallets/
│   │   └── auto-battle/     # Game pallet
│   │       └── src/lib.rs   # Extrinsics: start_game, submit_turn
│   ├── runtime/             # Runtime configuration
│   └── node/                # Node implementation
│
├── web/                     # React frontend
│   └── src/
│       ├── store/
│       │   ├── gameStore.ts      # Local WASM game state (Serde/JSON)
│       │   └── blockchainStore.ts # Chain sync & transactions (SCALE)
│       ├── components/
│       │   ├── BlockchainPage.tsx # On-chain gameplay UI
│       │   └── SandboxPage.tsx    # Local-only testing
│       └── wasm/            # Built WASM artifacts
│
└── docs/                    # Documentation
    └── CURRENT_ARCHITECTURE.md
```

## Gameplay Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE TURN CYCLE                             │
└─────────────────────────────────────────────────────────────────────────┘

1. START GAME (Chain)
   ┌─────────────────┐
   │  User clicks    │
   │  "Start Game"   │
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐     ┌─────────────────┐
   │ api.tx.AutoBattle│────►│ Pallet creates  │
   │ .start_game()   │     │ GameSession     │
   └─────────────────┘     │ - Random seed   │
                           │ - Genesis bag   │
                           │ - Initial hand  │
                           └────────┬────────┘
                                    │
                                    ▼
   ┌─────────────────┐     ┌─────────────────┐
   │ Browser syncs   │◄────│ SCALE bytes     │
   │ via SCALE       │     │ from storage    │
   └────────┬────────┘     └─────────────────┘
            │
            ▼
2. SHOP PHASE (Browser - Local)
   ┌─────────────────────────────────────────┐
   │  User interacts with WASM engine:       │
   │  - Pitch cards for mana                 │
   │  - Play units to board                  │
   │  - Rearrange board positions            │
   │                                         │
   │  Engine records each action in log      │
   └────────────────────┬────────────────────┘
                        │
                        ▼
3. COMMIT TO CHAIN
   ┌─────────────────┐     ┌─────────────────┐
   │ endTurn() runs  │     │ Action log      │
   │ battle locally  │────►│ encoded as      │
   │ (preview)       │     │ SCALE bytes     │
   └─────────────────┘     └────────┬────────┘
                                    │
                                    ▼
   ┌─────────────────┐     ┌─────────────────┐
   │ submitTurnOn-   │────►│ api.tx.AutoBattle│
   │ Chain()         │     │ .submit_turn()   │
   └─────────────────┘     └────────┬────────┘
                                    │
                                    ▼
4. CHAIN EXECUTION
   ┌─────────────────────────────────────────┐
   │  Pallet executes (same code as WASM):   │
   │                                         │
   │  verify_and_apply_turn(&mut state, &act)│
   │    ↓                                    │
   │  resolve_battle(player, enemy, &mut rng)│
   │    ↓                                    │
   │  Apply result: wins++/lives--           │
   │    ↓                                    │
   │  Prepare next round: draw_hand()        │
   └────────────────────┬────────────────────┘
                        │
                        ▼
5. SYNC & CONTINUE
   ┌─────────────────┐     ┌─────────────────┐
   │ refreshGameState│◄────│ Updated state   │
   │ ()              │     │ via SCALE       │
   └────────┬────────┘     └─────────────────┘
            │
            ▼
   ┌─────────────────┐
   │ User sees new   │
   │ round, new hand │
   │                 │
   │ Go to step 2    │
   └─────────────────┘
```

## Current Limitations & Future Work

### Immediate TODOs

1. **Optimistic Proving**
   - Currently: Browser runs battle locally, then chain re-executes
   - Future: Submit proof that battle was executed correctly, chain verifies
   - Benefit: Reduced on-chain computation, faster finality

2. **Save User Boards**
   - Currently: Players only fight AI opponents
   - Future: Store player boards on-chain after each turn
   - Storage: `SavedBoards<AccountId, Round> -> Board`

3. **PvP Matchmaking**
   - Currently: AI opponents generated from round number
   - Future: Battle against other players' saved boards
   - Could be async (fight ghost) or sync (real-time matching)

4. **Card Creation & Set Management**
   - Currently: Card sets hardcoded in `units.rs`
   - Future: On-chain card set creation via governance
   - Custom sets, seasonal rotations, community cards

### Technical Debt

5. **Error Recovery**
   - Currently: Some edge cases can leave UI in inconsistent state
   - Need: Better error boundaries, transaction retry logic

6. **Weights & Benchmarks**
   - Currently: `Weight::default()` used everywhere
   - Need: Proper benchmarking for accurate fee estimation

### Infrastructure

7. **Multiplayer Signaling**
   - For real-time PvP: WebRTC or similar for board exchange
   - Chain as fallback/verification layer

8. **Indexer/History**
   - Currently: No game history persisted
   - Future: Index completed games, leaderboards, replays

## Quick Start for New Contributors

```bash
# All-in-one: builds WASM, starts chain, starts web UI
./start.sh

# Or manually:

# 1. Build the WASM client
./build-wasm.sh

# 2. Start the blockchain (in one terminal)
cd blockchain && ./start_chain.sh

# 3. Start the web UI (in another terminal)
cd web && pnpm dev

# 4. Open browser to http://localhost:5173
#    - Sandbox Mode: Pure local play, no chain
#    - Blockchain Mode: Full on-chain gameplay
```

### Key Files to Understand

| File | Purpose |
|------|---------|
| `core/src/battle.rs` | Combat resolution - how battles work |
| `core/src/commit.rs` | Turn verification - how actions are validated |
| `core/src/types.rs` | Core types including Ability system |
| `core/src/limits.rs` | Battle execution safeguards |
| `core/src/state.rs` | Game state structure |
| `client/src/engine.rs` | WASM bindings - browser ↔ core bridge |
| `blockchain/pallets/auto-battle/src/lib.rs` | On-chain logic |
| `web/src/store/blockchainStore.ts` | SCALE sync & transactions |
| `web/src/store/gameStore.ts` | Local state management (Serde/JSON) |

### Running Tests

```bash
# Core engine tests (from project root)
cargo test -p oab-core

# Pallet tests (from project root)
cargo test -p pallet-auto-battle
```
