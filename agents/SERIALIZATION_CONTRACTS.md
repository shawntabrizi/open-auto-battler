# Serialization Contracts

This document lists serialization boundaries derived from code usage.

## SCALE Encoding
- Core types implement `parity_scale_codec` in `core/src/types.rs` and `core/src/state.rs`.
- The pallet reuses bounded variants in `blockchain/pallets/auto-battle/src/lib.rs`.
- The WASM bridge produces SCALE bytes in `client/src/engine.rs` via `get_commit_action_scale`.

## JSON Views
- `core/src/view.rs` produces `GameView` and `CardView`-style structures for UI consumption.
- Frontend mirrors these in `web/src/types.ts`.

## Known Contract Pairs
- `core/src/view.rs` ↔ `web/src/types.ts` for view structs.
- `core/src/types.rs` ↔ `web/src/types.ts` for ability and target definitions.
- `core/src/commit.rs` ↔ `client/src/engine.rs` for turn commitments.

## Update Rules
- When a Rust view struct changes, update the matching TypeScript type.
- When SCALE-encoded types change, update pallet bounded types and any JS SCALE consumers.
