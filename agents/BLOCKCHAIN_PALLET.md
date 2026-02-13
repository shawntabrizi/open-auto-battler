# Blockchain Pallet Guide

This document is derived from `blockchain/pallets/auto-battle/src/lib.rs` and runtime/node wiring.

## Pallet Entry Point
- Main pallet is defined in `blockchain/pallets/auto-battle/src/lib.rs`.

## Bounded Types and Limits
- Bounded types mirror core types using `oab_core::bounded::*`.
- Config constants in `Config` define limits such as `MaxBagSize`, `MaxBoardSize`, and `MaxSetSize`.

## Storage
- `ActiveGame` stores player sessions.
- `CardSets` stores published card sets.
- `GhostOpponents` stores ghost boards for matchmaking.

## On-Chain Data Shapes
- `UserCardData`, `CardMetadata`, and `CardMetadataEntry` describe card content.
- `GameSession` stores `BoundedLocalGameState` and session metadata.

## Runtime Integration
- Runtime wiring is in `blockchain/runtime/src/lib.rs` and `blockchain/runtime/src/configs/*`.
- Node entry is in `blockchain/node/src/main.rs`.

## Update Rules
- When core types change, update bounded types and SCALE encoding in the pallet.
- Keep `client/src/engine.rs` constants aligned with runtime limits.
