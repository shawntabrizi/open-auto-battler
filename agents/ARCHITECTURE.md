# Architecture Overview

This document is derived from the source code structure and entry points.

## System Map
- `core/` Rust game engine and rules. Entry in `core/src/lib.rs`.
- `client/` WASM bridge exposing the engine to JavaScript. Entry in `client/src/lib.rs` and `client/src/engine.rs`.
- `web/` React UI and state management. Entry in `web/src/main.tsx` and `web/src/App.tsx`.
- `blockchain/` Substrate runtime and the `auto-battle` pallet (runs via Omni Node). Entry in `blockchain/pallets/auto-battle/src/lib.rs` and `blockchain/runtime/src/lib.rs`.

## Primary Data Flow
1. Core game logic lives in `core/src/*` and defines all types and rules.
2. The WASM layer in `client/src/engine.rs` wraps the core engine and exposes a `GameEngine` API to JS.
3. The web UI consumes that `GameEngine` via the Zustand store in `web/src/store/gameStore.ts`.
4. The blockchain pallet embeds core types and bounded variants in `blockchain/pallets/auto-battle/src/lib.rs`.

## Integration Boundaries
- SCALE encoding for on-chain or compact transport uses `parity_scale_codec` in `core/` and `blockchain/`.
- JSON views for the UI are created in `core/src/view.rs` and consumed by TS types in `web/src/types.ts`.
- The WASM API is defined in `client/src/engine.rs` and consumed by `web/src/store/gameStore.ts`.

## Key Entry Points
- Engine exports and modules: `core/src/lib.rs`.
- Game state model: `core/src/state.rs`.
- Core type system: `core/src/types.rs`.
- Battle flow: `core/src/battle.rs`.
- WASM public API: `client/src/engine.rs`.
- Web store and engine usage: `web/src/store/gameStore.ts`.
- On-chain pallet types and storage: `blockchain/pallets/auto-battle/src/lib.rs`.
