# Testing Guide

This document is derived from the test layout in the codebase.

## Core Engine Tests
- Engine tests live under each crate's `src/tests/` (notably `battle/src/tests/`
  and `game/src/tests/`).
- Notable areas include:
  - Shop turn validation and application.
  - Battle outcome scenarios (draw, mutual destruction, stalemate).
  - `max_triggers` enforcement, limit detection.
  - Trigger-specific suites: adjacency, deathtouch, scopes, spines, spawn,
    faint, conditions, snipe, combos, damage, lifecycle, positions,
    random ally other, support, targeting.

## Recommended Test Placement
- Engine rule changes should add or update tests in the relevant crate's
  `src/tests/`.

## Running Tests
- Rust: prefer crate-scoped tests for the crates you touched.
  - `cargo test -p oab-battle`
  - `cargo test -p oab-game`
  - `cargo test -p oab-client`
  - `cargo test -p oab-contract-tests` (PolkaVM contract integration)
- Web: `npm test` from `web/` (Vitest).

## Contract Changes
- If you change the contract, run `cargo test -p oab-contract-tests` to
  exercise the native test harness, and then a fresh deploy via
  `./start.sh` to verify the live JSON-RPC path.
