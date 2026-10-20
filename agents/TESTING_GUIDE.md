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
- Contract changes should add or update the native tests at the bottom of
  `contract/src/main.rs` (they drive the real contract methods against a
  `MockHost`).
- Frontend contract-client changes should add or update the Vitest files next
  to the module (`web/src/contract/*.test.ts`, `web/src/services/*.test.ts`,
  `web/src/utils/*.test.ts`).

## Running Tests
- Rust: prefer crate-scoped tests for the crates you touched.
  - `cargo test -p oab-battle`
  - `cargo test -p oab-game`
  - `cargo test -p oab-client`
  - `cargo test -p oab-contract-tests` (engine game-logic tests in
    `contract/tests-native/`, the same calls the contract makes)
- Contract and minter (not workspace members; run from the repo root so the
  riscv `.cargo/config.toml` in each crate does not apply):
  - `CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path contract/Cargo.toml --features std`
  - `CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path nft-minter/Cargo.toml --features std`
- Web: `npm test` from `web/` (Vitest).
- Engine coverage: `./battle/coverage.sh` (needs `cargo-llvm-cov`; CI runs it
  in `.github/workflows/core-coverage.yml`).

## Live Chain Checks
Run from `web/` against Paseo Asset Hub Next. They use `web/cdm.json` for the
arena address and ABI.
- `node scripts/check-ranked-reads.mjs` — read-only check of the ranked,
  leaderboard, badge, and collectibles views. Sends no transactions.
- `node scripts/e2e-onchain.mjs` — registers the genesis cards and set 0, then
  plays `startGame` → `getGameState` → `submitTurn`. Needs the card dump
  (`DUMP=/tmp/cards-dump.json`, see `contract/README.md`).
- `node scripts/e2e-session.mjs` — sponsored play: a fresh PGAS-only player
  sets up a proxy session and plays a full run.

`web/scripts/test-query.ts` is known-broken: it imports the removed
`@dotdm/cdm` package and targets a local zombienet. Do not use it.

## Contract Changes
- If you change the contract, run its native tests (above) and
  `cargo test -p oab-contract-tests`. After a redeploy, refresh `web/cdm.json`
  and run the live chain checks.
