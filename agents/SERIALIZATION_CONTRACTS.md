# Serialization Contracts

This document lists serialization boundaries derived from code usage.

## SCALE Encoding
- Core types implement `parity_scale_codec` in `core/src/types.rs` and `core/src/state.rs`.
- The pallet reuses bounded variants in `blockchain/pallets/auto-battle/src/lib.rs`.
- The WASM bridge produces SCALE bytes in `client/src/engine.rs` via `get_commit_action_scale`.

## JSON Views
- `core/src/view.rs` produces `GameView` and `CardView`-style structures for UI consumption.
- `core/src/battle.rs` defines `CombatEvent` and `UnitView` for battle playback.
- Frontend mirrors these in `web/src/types.ts`.

## Known Contract Pairs
- `core/src/view.rs` ↔ `web/src/types.ts` for view structs.
- `core/src/types.rs` ↔ `web/src/types.ts` for ability and target definitions.
- `core/src/battle.rs` (`CombatEvent` enum) ↔ `web/src/types.ts` (`CombatEvent` type) for battle events.
- `core/src/battle.rs` (`BattlePhase` enum) ↔ `web/src/types.ts` (`BattlePhase` type) for phase tracking.
- `core/src/commit.rs` ↔ `client/src/engine.rs` for turn commitments.
- `core/src/bounded.rs` (`BoundedCombatEvent`) mirrors `CombatEvent` for on-chain storage.

## Update Rules
- When a Rust view struct changes, update the matching TypeScript type.
- When `CombatEvent` variants are added/removed, update `web/src/types.ts`, `core/src/bounded.rs` (`BoundedCombatEvent`), and the frontend event handlers in `web/src/components/BattleArena.tsx` and `web/src/components/BattleOverlay.tsx`.
- When `BattlePhase` variants change, update `web/src/types.ts`.
- When SCALE-encoded types change, update pallet bounded types and any JS SCALE consumers.
