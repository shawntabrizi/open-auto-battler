# Serialization Contracts

This document lists serialization boundaries derived from code usage.

## SCALE Encoding
- Core types implement `parity_scale_codec` in `battle/src/types.rs` and
  `battle/src/state.rs`.
- The PolkaVM contract (`contract/src/main.rs`) consumes SCALE-encoded turn
  actions and emits SCALE-encoded battle events.
- The WASM bridge produces SCALE bytes in `client/src/engine.rs` via
  `get_commit_action_scale`.

## JSON Views
- The engine produces `GameView` and `CardView`-style structures for UI
  consumption.
- `battle/src/battle.rs` defines `CombatEvent` and `UnitView` for battle
  playback.
- Frontend mirrors these in `web/src/types.ts`.

## Known Contract Pairs
- Engine view structs ↔ `web/src/types.ts` for view structs.
- Engine ability/target types ↔ `web/src/types.ts` for ability and target
  definitions.
- `CombatEvent` enum ↔ `web/src/types.ts` (`CombatEvent` type) for battle
  events.
- `BattlePhase` enum ↔ `web/src/types.ts` (`BattlePhase` type) for phase
  tracking.
- `commit` types ↔ `client/src/engine.rs` for turn commitments.
- `BattleReported` event payload (contract) ↔ `web/src/contract/index.ts`
  for the post-turn battle replay.

## Update Rules
- When a Rust view struct changes, update the matching TypeScript type.
- When `CombatEvent` variants are added/removed, update `web/src/types.ts`
  and the frontend event handlers in `web/src/components/BattleArena.tsx`
  and `web/src/components/BattleOverlay.tsx`.
- When `BattlePhase` variants change, update `web/src/types.ts`.
- When SCALE-encoded types change, update the contract's encode/decode paths
  and `web/src/contract/abi.ts`.
