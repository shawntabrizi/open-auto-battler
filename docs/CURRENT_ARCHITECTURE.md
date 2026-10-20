# Open Auto Battler: Current Architecture (October 20, 2026)

This document describes the current architecture of Open Auto Battler, an auto-battler game where the battle engine runs identically in the browser (via WASM) and on chain (via a PolkaVM smart contract on Polkadot Asset Hub).

The Substrate pallet runtime that earlier versions of this document described was removed on 2026-05-05.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     POLKADOT HOST (Desktop / Mobile / dot.li)               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         React Frontend                               │   │
│  │                        (web/src/components)                          │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                    ┌────────────┴────────────┐                             │
│                    ▼                         ▼                             │
│  ┌─────────────────────────┐   ┌─────────────────────────────────────┐    │
│  │      gameStore.ts       │   │        contractStore.ts             │    │
│  │   (Local Game State)    │   │  (web/src/contract: calls, signing, │    │
│  └───────────┬─────────────┘   │   sponsored play, personhood)       │    │
│              │ Serde/JSON      └─────────────────┬───────────────────┘    │
│              ▼                                   │ SCALE in ABI bytes      │
│  ┌─────────────────────────┐                    │                         │
│  │    WASM Game Engine     │◄───────────────────┘                         │
│  │     (client crate)      │                                               │
│  │  oab-battle + oab-game  │                                               │
│  └─────────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ host-routed chain client
                                      │ (@parity/product-sdk-*)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PASEO ASSET HUB NEXT (pallet-revive)                    │
│  ┌──────────────────────────────────┐   ┌──────────────────────────────┐   │
│  │  @oab/arena (contract/)          │   │  @oab/nft-minter             │   │
│  │  oab-battle + oab-game           │   │  (nft-minter/)               │   │
│  │  sessions, ghosts, leaderboard,  │   │  claim item selector for     │   │
│  │  badges                          │   │  collection 29               │   │
│  └──────────────────────────────────┘   └──────────────────────────────┘   │
│        │ precompiles: personhood, Scarcity collections                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Principle: Shared Battle Engine

The key architectural decision is that **the same Rust code** executes in both environments:

```
┌─────────────────────────────────────────────────────────────────┐
│              oab-battle (battle/)  +  oab-game (game/)          │
│                                                                 │
│  battle.rs   - combat, abilities, events                        │
│  commit.rs   - verify_and_apply_turn(), shop triggers           │
│  types.rs    - CommitTurnAction, TurnAction, Ability, ...       │
│  limits.rs   - battle execution safeguards                      │
│  bounded.rs  - bounded types for on-chain transport             │
│  game/state.rs, game/view.rs - game state, UI views             │
└─────────────────────────────────────────────────────────────────┘
          │                                      │
          │ compiled to                          │ linked into
          ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────────┐
│   WASM (browser)    │              │   PolkaVM (chain)       │
│   via client crate  │              │   via contract/         │
└─────────────────────┘              └─────────────────────────┘
```

Card and set data live in `assets/data/` (JSON, validated by `assets/build.rs`). On chain, the admin registers them with `registerCard` / `registerSet`.

## Two Serialization Strategies

### Browser ↔ WASM: Serde/JSON

The React frontend communicates with the WASM engine using **Serde JSON serialization** via `serde-wasm-bindgen` (`engine.get_view()`, `engine.play_hand_card()`, ...). The shop phase runs locally, with no chain calls.

### Browser ↔ Contract: SCALE in ABI bytes

The contract exposes a Solidity-style ABI (`web/cdm.json`). All game data travels as **SCALE bytes inside ABI `bytes` parameters**, so the same Rust types encode identically in WASM and in the contract.

```
                        SHOP PHASE (Browser)
                              │
    User plays cards, burns, rearranges board
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  WASM Engine tracks actions in action_log                   │
│  get_commit_action_scale() -> CommitTurnAction.encode()     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  web/src/contract/index.ts: submitTurn(bytes)               │
│  signed by a sponsored session key or the product account   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Contract submit_turn                                       │
│    verify_and_apply_turn(&mut shop_state, &action)          │
│      - Same function as browser!                            │
│    select_ghost(set, round, wins, lives) -> opponent        │
│    resolve_battle(player, ghost, rng(battle_seed))          │
│    wins++ / lives--, next round or Completed                │
│    emit BattleReported(result, wins, lives, round,          │
│                        battle_seed, opponent board)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Browser reads BattleReported from Revive.ContractEmitted   │
│  engine.resolve_battle_p2p(board, ghost, seed) -> replay    │
│  getGameState() + getSet() -> engine.init_from_scale(...)   │
└─────────────────────────────────────────────────────────────┘
```

The contract stores each player's session as a SCALE `ArenaSession`. The WASM engine decodes those bytes as `BoundedGameSession` (`game/src/bounded.rs`), so the two layouts must stay in step.

## Randomness

Game seeds come from block entropy (`block_entropy()` in `contract/src/main.rs`), never from caller input. Each new round derives a fresh seed from the previous one. The browser never chooses a seed for an on-chain game.

## Bounded vs Unbounded Types

The engine uses **unbounded types** (standard `Vec`, `BTreeMap`, etc.). `battle/src/bounded.rs` and `game/src/bounded.rs` (feature `bounded`) provide bounded wrappers and `From` conversions. The WASM bridge uses them to decode on-chain bytes with fixed limits.

## Battle Execution Limits

The engine has **internal safeguards** to prevent infinite loops during battle resolution:

```rust
// From battle/src/limits.rs
pub const MAX_RECURSION_DEPTH: LimitValue = 50;    // Nested ability triggers
pub const MAX_SPAWNS_PER_BATTLE: LimitValue = 100; // Total units spawned
pub const MAX_TRIGGERS_PER_PHASE: LimitValue = 200; // Ability activations per phase
pub const MAX_TRIGGER_DEPTH: LimitValue = 10;      // Chained trigger depth
pub const MAX_BATTLE_ROUNDS: LimitValue = 100;     // Combat rounds before draw
```

If any limit is exceeded, the offending team **loses the battle**.

## Ability System

Cards have two ability lanes: `shop_abilities` and `battle_abilities` (see [ABILITY_TWO_ENUM_SPEC.md](./ABILITY_TWO_ENUM_SPEC.md)). Triggers, effects, targets, scopes, and conditions are described in `agents/CORE_ENGINE.md` and defined in `battle/src/types.rs`. Card design rules are in [CARD_DESIGN.md](./CARD_DESIGN.md).

## Game Modes On Chain

| Mode | Entry | Who | Result |
| ---- | ----- | --- | ------ |
| Casual | `startGame(set_id)` | any account | none recorded |
| Ranked | `startRankedGame(set_id)` | personhood Lite or Full, bound alias in OAB's context | `endGame` records the run on the set's top-100 leaderboard (keyed by personhood alias) and mints soulbound badges |

Default rules (contract `default_config()`): 3 lives, 10 wins to victory, board 5, hand 5, bag 50, mana limit 3 rising to 10. Details: `contract/README.md`.

## Directory Structure

```
open-auto-battler/
├── battle/                  # oab-battle: types, combat, turn validation, limits
├── game/                    # oab-game: game state, config, views, bounded session
├── assets/                  # oab-assets: cards/sets/styles/themes JSON (data/)
├── client/                  # WASM bindings (GameEngine) for the browser
├── contract/                # PolkaVM arena contract (@oab/arena)
│   ├── src/main.rs          # contract + native tests
│   └── tests-native/        # engine game-logic tests (oab-contract-tests)
├── nft-minter/              # PolkaVM claim minter (@oab/nft-minter)
├── register-cards/          # dumps cards/sets for registerCard/registerSet
├── web/                     # React frontend
│   ├── cdm.json             # arena address + ABI
│   ├── scripts/             # register-cards, live checks, on-chain E2E
│   └── src/
│       ├── contract/        # arena client, session, personhood, codec
│       ├── store/           # gameStore, contractStore, ...
│       ├── components/      # pages and game UI
│       └── wasm/            # built WASM artifacts
└── docs/                    # Documentation
```

## Gameplay Flow

```
1. START GAME (Chain)
   startGame / startRankedGame  ──► contract creates ArenaSession
                                    (seed from block entropy, bag, hand)
2. SYNC
   getGameState + getSet        ──► engine.init_from_scale(...)
3. SHOP PHASE (Browser - Local)
   burn / play / move / undo in the WASM engine; actions logged
4. COMMIT
   submitTurn(CommitTurnAction) ──► contract validates, fights a ghost,
                                    emits BattleReported
5. REPLAY & CONTINUE
   resolve_battle_p2p(...) renders the battle; sync; go to step 3
6. END
   endGame (after 10 wins or 0 lives) ──► archive ghost; ranked: leaderboard
                                          + badges. abandonGame forfeits.
```

## Current Limitations & Future Work

See [BETA_RELEASE_PLAN.md](../BETA_RELEASE_PLAN.md) for the roadmap and the open items (ranked allowlist, NftPurse, sponsored-play scaling, render layer).

## Key Files to Understand

| File | Purpose |
|------|---------|
| `battle/src/battle.rs` | Combat resolution - how battles work |
| `battle/src/commit.rs` | Turn verification - how actions are validated |
| `battle/src/types.rs` | Core types including Ability system |
| `battle/src/limits.rs` | Battle execution safeguards |
| `game/src/state.rs` | Game state structure |
| `client/src/engine.rs` | WASM bindings - browser ↔ engine bridge |
| `contract/src/main.rs` | On-chain logic |
| `web/src/contract/index.ts` | Contract calls, events, signing |
| `web/src/store/contractStore.ts` | Contract state and turn submission |
| `web/src/store/gameStore.ts` | Local state management (Serde/JSON) |

## Running Tests

See `agents/TESTING_GUIDE.md`.
