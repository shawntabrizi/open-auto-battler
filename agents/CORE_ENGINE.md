# Core Engine Guide

This document summarizes the engine model from `core/src/*`.

## Modules
- `core/src/state.rs` defines `GameState`, `LocalGameState`, and phase tracking.
- `core/src/types.rs` defines abilities, targets, matchers, and fundamental types.
- `core/src/battle.rs` resolves combat flow.
- `core/src/limits.rs` defines battle limit reasons and constraints.
- `core/src/commit.rs` validates and applies turn actions.
- `core/src/view.rs` produces UI-facing views.

## State Model
- `GameState` contains `card_pool` and `LocalGameState` in `core/src/state.rs`.
- Key constants like `HAND_SIZE`, `BOARD_SIZE`, and `STARTING_MANA_LIMIT` live in `core/src/state.rs`.
- Phase progression is modeled with `GamePhase`.

## Abilities and Effects
- Abilities are defined in `core/src/types.rs` with `AbilityTrigger`, `AbilityEffect`, and `AbilityTarget`.
- Conditions use `Matcher` and `Condition` for targeting and comparisons.

## Determinism and RNG
- Deterministic hand derivation uses seeded RNG in `core/src/state.rs` and `core/src/rng.rs`.
- Opponent selection is in `core/src/opponents.rs`.

## Invariants to Respect
- Board size and hand size limits are fixed in `core/src/state.rs`.
- Bounded types exist for on-chain integration in `core/src/bounded.rs`.
