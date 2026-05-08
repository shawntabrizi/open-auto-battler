# Architecture Overview

This document is derived from the source code structure and entry points.

## System Map
- `battle/`, `assets/`, `game/` — deterministic Rust game engine and card data.
- `client/` — `wasm-bindgen` bridge exposing the engine to JavaScript. Entry in
  `client/src/lib.rs` and `client/src/engine.rs`.
- `contract/` — PolkaVM smart contract (the only canonical chain backend).
  Entry in `contract/src/main.rs`.
- `web/` — React UI and Zustand state. Entry in `web/src/main.tsx`.

## Primary Data Flow
1. The Rust engine in `battle/`, `game/`, and `assets/` defines all types and
   battle rules.
2. The WASM layer in `client/src/engine.rs` wraps the engine and exposes a
   `GameEngine` API to JS.
3. The web UI consumes `GameEngine` via `web/src/store/gameStore.ts`.
4. Arena turns are submitted to the contract in `contract/src/main.rs` via
   `web/src/contract/index.ts`. The contract emits a `BattleReported` event
   carrying a deterministic seed and the opponent board, which the WASM engine
   replays locally to render the battle.

## Integration Boundaries
- SCALE encoding for on-chain or compact transport uses `parity_scale_codec`
  in `battle/`, `game/`, and the contract.
- JSON views for the UI are created in the engine and consumed by TS types in
  `web/src/types.ts`.
- The WASM API is defined in `client/src/engine.rs` and consumed by
  `web/src/store/gameStore.ts`.
- The contract API is defined in `contract/src/main.rs` and consumed by
  `web/src/contract/index.ts` via `@dotdm/cdm` (`createCdm()` over PAPI),
  with signing through `@parity/product-sdk-signer`'s `SignerManager`.

## Key Entry Points
- Engine exports and modules: `battle/src/lib.rs`, `game/src/lib.rs`.
- WASM public API: `client/src/engine.rs`.
- Web store and engine usage: `web/src/store/gameStore.ts` and
  `web/src/store/contractStore.ts`.
- Contract entry point: `contract/src/main.rs`.
- Contract client: `web/src/contract/index.ts`.
