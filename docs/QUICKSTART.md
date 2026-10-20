# Quick Start Guide

Get up and running with Open Auto Battler development in 5 minutes.

## Prerequisites

- Rust (stable, with the `wasm32-unknown-unknown` target)
- Node.js 22 & npm
- wasm-pack (`cargo install wasm-pack`)
- For contract work: the `cdm` CLI (see `contract/README.md`)

## Quick Start (All-in-One)

```bash
# From project root - builds WASM, starts the web dev server
./start.sh
```

Open http://localhost:5173 when ready. `./start.sh --build-contract` also
builds the PolkaVM contract to check that it compiles.

## Manual Setup

### 1. Build WASM Client

```bash
# From project root
./build-wasm.sh
```

This compiles `client/` to WASM and copies artifacts to `web/src/wasm/`.

### 2. Run the Web UI

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. Standalone, the app renders the UI and loads the
local WASM engine. Contract calls need a host (step 3).

### 3. Play On Chain

There is no local chain. Chain access is routed through a Polkadot host, so
contract play needs the app inside a host (Polkadot Desktop, Polkadot Mobile,
or dot.li). The live app is https://oab-arena.paseo.li, which talks to the
arena contract on Paseo Asset Hub Next.

In the app: **Connect** on `/contract`, then **Contract Arena** →
**Start Game** (casual) or **Ranked** (needs personhood). **Leaderboard** and
**Badges** are on the same menu.

## Project Structure at a Glance

```
open-auto-battler/
├── battle/        # Battle engine: types, combat, turn validation
├── game/          # Game state, config, UI views
├── assets/        # Card, set, style and theme data (assets/data/)
├── client/        # WASM wrapper around the engine for the browser
├── contract/      # PolkaVM arena contract (@oab/arena)
├── nft-minter/    # PolkaVM claim minter (@oab/nft-minter)
├── register-cards/# Dumps cards and sets for on-chain registration
├── web/           # React frontend
└── docs/          # You are here
```

## Development Workflow

### Making Game Logic Changes

1. Edit files in `battle/src/` or `game/src/`
2. Run tests: `cargo test -p oab-battle -p oab-game`
3. Rebuild WASM: `./build-wasm.sh`
4. Refresh browser

The contract links the same engine. A rule change needs a contract redeploy
before it applies on chain (see `contract/README.md`).

### Making UI Changes

1. Edit files in `web/src/`
2. Changes hot-reload automatically

### Making Contract Changes

1. Edit `contract/src/main.rs`
2. Run the native tests (see `agents/TESTING_GUIDE.md`)
3. Deploy with `cdm` and refresh `web/cdm.json` (see `contract/README.md`)

## Common Tasks

### Add a new card

Edit `assets/data/cards.json` (and `assets/data/sets.json` to put it in a
set). `assets/build.rs` validates the JSON at build time. Follow the rules in
`docs/CARD_DESIGN.md`.

### Add a new ability

Edit `battle/src/types.rs` and `battle/src/battle.rs`:
- Add variant to ability enums
- Implement it in the battle (or shop, `battle/src/commit.rs`) trigger handler

### Modify turn validation

Edit `battle/src/commit.rs`:
- `verify_and_apply_turn()` validates all player actions

## Running Tests

```bash
# Engine tests (from project root)
cargo test -p oab-battle
cargo test -p oab-game

# Contract native tests (from project root)
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path contract/Cargo.toml --features std

# Web tests
cd web && npm test
```

## Core Coverage

```bash
# One-time install
cargo install cargo-llvm-cov
rustup component add llvm-tools-preview

# Generate core coverage summary + reports
./battle/coverage.sh
```

Coverage outputs:
- Summary printed to stdout
- `target/coverage/oab-core/lcov.info`
- `target/coverage/oab-core/html/index.html`

Optional minimum line coverage gate:

```bash
FAIL_UNDER_LINES=80 ./battle/coverage.sh
```

Optional engine-critical gate (ignores `log/opponents/units/view/rng/types`
under `battle/src/`):

```bash
FAIL_UNDER_LINES=80 ENGINE_FAIL_UNDER_LINES=80 ./battle/coverage.sh
```

CI (`.github/workflows/core-coverage.yml`) enforces `80%` total line coverage
and `80%` engine-critical line coverage.

## Debugging

### Browser Console

The WASM engine logs to console when `client/` is built with the
`browser_log` feature (see the comment in `build-wasm.sh`).

### Chain Checks

`web/scripts/check-ranked-reads.mjs` reads the live arena views without
sending transactions. See `agents/TESTING_GUIDE.md` for the on-chain E2E
scripts.

## Deploying the Frontend

The app is served from Bulletin + DotNS as `oab-arena.paseo` on Paseo Next
(`https://oab-arena.paseo.li`). One command builds the WASM engine and the web
app, uploads `web/dist`, and writes the product manifest from
`web/bulletin-deploy.config.ts` (name, icon):

```bash
cd web
DOTNS_MNEMONIC="<owner phrase of oab-arena.paseo>" npm run deploy
```

`DOTNS_MNEMONIC` is required; there is no dev-account fallback. The name is
owned by the cdm `paseo` deploy account (`5CUbpNYAePqCdFkS6BWqVF4RDaAcsueW923DrJTnDUXHst7v`).
CI deploys the same way from `.github/workflows/deploy-frontend.yml` with the
`DOTNS_MNEMONIC` repository secret.

## Next Steps

- Read [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) for deep dive
- Check `battle/src/tests/` and `game/src/tests/` for examples of game mechanics
- Look at existing cards in `assets/data/cards.json` for patterns
