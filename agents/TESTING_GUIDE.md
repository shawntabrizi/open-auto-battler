# Testing Guide

This document is derived from the test layout in the codebase.

## Core Engine Tests
- All engine tests live under `core/src/tests/`.
- Notable areas include:
  - `core/src/tests/turns.rs`
  - `core/src/tests/battle_result.rs`
  - `core/src/tests/limits.rs`
  - `core/src/tests/triggers/*`

## Recommended Test Placement
- Engine rule changes should add or update tests in `core/src/tests/`.
- Battle flow changes should add tests near `core/src/tests/battle_result.rs`.
- Trigger logic changes should add tests in `core/src/tests/triggers/`.

## Running Tests
- Prefer crate-scoped tests for the crates you touched.
- Use the following commands as needed:
- `cargo test -p oab-core`
- `cargo test -p oab-client`
- `cargo test -p pallet-auto-battle`
- `cargo test -p auto-battle-runtime`

## Pallet Changes
- If you change the pallet, also ensure the runtime compiles by running:
- `cargo test -p auto-battle-runtime`
