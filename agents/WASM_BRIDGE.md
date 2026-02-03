# WASM Bridge Guide

This document describes how the Rust engine is exposed to JavaScript.

## Rust Entry Points
- `client/src/lib.rs` sets up the wasm-bindgen module and logging.
- `client/src/engine.rs` defines the `GameEngine` WASM class.

## Public JS API (from `client/src/engine.rs`)
- Constructor: `GameEngine::new(seed: Option<u64>)`.
- State and view: `get_view`, `get_battle_output`, `get_card_set`, `get_bag`.
- Turn actions: `pitch_hand_card`, `play_hand_card`, `swap_board_positions`, `pitch_board_unit`, `end_turn`, `continue_after_battle`, `new_run`.
- Commitment API: `get_commit_action` and `get_commit_action_scale`.
- SCALE init: `init_from_scale` for session restoration.

## Serialization Boundaries
- JSON exchange uses `serde_wasm_bindgen` and `serde` types in `client/src/engine.rs`.
- SCALE encoding uses `parity_scale_codec` in `client/src/engine.rs` and core types.

## Web Integration
- The WASM module is loaded in `web/src/store/gameStore.ts`.
- JS expects `GameView` and `BattleOutput` shapes from `web/src/types.ts`.

## Update Rules
- If a core type changes, update the view structs in `core/src/view.rs` and the matching TS types in `web/src/types.ts`.
- If a `GameEngine` method signature changes, update `web/src/store/gameStore.ts` and any components that call it.
