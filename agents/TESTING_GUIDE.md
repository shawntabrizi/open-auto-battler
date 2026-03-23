# Testing Guide

This document is derived from the test layout in the codebase.

## Core Engine Tests
- All engine tests live under `core/src/tests/`.
- Notable areas include:
  - `core/src/tests/turns.rs` — shop turn validation and application.
  - `core/src/tests/battle_result.rs` — battle outcome scenarios (draw, mutual destruction, stalemate).
  - `core/src/tests/limits.rs` — max_triggers enforcement, limit detection.
  - `core/src/tests/triggers/` — trigger-specific test suites:
    - `adjacent.rs` — Adjacent targeting (allies, all, solo fizzle, cross-team).
    - `deathtouch.rs` — AfterUnitAttack + Destroy, dead unit triggers, graveyard condition evaluation, mutual deathtouch, buffed stat conditions on dead units.
    - `scopes.rs` — BeforeUnitAttack/AfterUnitAttack front-only filtering, AnyAttack scope.
    - `spines.rs` — OnHurt counter-damage and self-harm chains.
    - `spawn.rs` — SpawnUnit positioning, OnAllySpawn/OnEnemySpawn, board limits.
    - `faint.rs` — OnFaint buffs, sacrifice chains, mana effects.
    - `conditions.rs` — Condition matchers, stat comparisons, position checks, logic gates.
    - `snipe.rs` — Standard targeting by stat (highest/lowest attack/health/mana).
    - `combos.rs` — Multi-ability interactions.
    - `damage.rs` — Fatal damage triggers, Destroy event emission.
    - `lifecycle.rs` — OnSpawn self-buff, OnHurt Aggressor scope.
    - `positions.rs` — Absolute position targeting and fizzle behavior.
    - `random_ally_other.rs` — Random AlliesOther scope.
    - `support.rs` — BeforeAnyAttack support mechanics, conditional healing.
    - `targeting.rs` — Front-ally position targeting.
    - `abyssal_bomber.rs` — OnFaint AoE damage.

## Recommended Test Placement
- Engine rule changes should add or update tests in `core/src/tests/`.
- Battle flow changes should add tests near `core/src/tests/battle_result.rs`.
- Trigger logic changes should add tests in `core/src/tests/triggers/`.
- New trigger types or targeting modes should get their own file in `core/src/tests/triggers/`.

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
