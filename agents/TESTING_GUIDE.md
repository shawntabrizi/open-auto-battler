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
- Run `cargo test` at the repository root unless a smaller scope is requested.
