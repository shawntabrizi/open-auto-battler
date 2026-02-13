# Quick Start Guide

Get up and running with Open Auto Battler development in 5 minutes.

## Prerequisites

- Rust (latest stable)
- Node.js 18+ & pnpm
- wasm-pack (`cargo install wasm-pack`)

## Quick Start (All-in-One)

```bash
# From project root - builds WASM, starts chain, starts web UI
./start.sh
```

Open http://localhost:5173 when ready.

## Manual Setup

### 1. Build WASM Client

```bash
# From project root
./build-wasm.sh
```

This compiles `client/` to WASM and copies artifacts to `web/src/wasm/`.

### 2. Run in Sandbox Mode (No Blockchain)

For quick iteration on game logic:

```bash
cd web
pnpm install
pnpm dev
```

Open http://localhost:5173 and click "Sandbox Mode". Everything runs locally in your browser.

### 3. Run with Blockchain

#### Terminal 1: Start the chain

```bash
cd blockchain
./start_chain.sh
```

Wait for block production to start (you'll see block numbers incrementing).

#### Terminal 2: Start the web UI

```bash
cd web
pnpm dev
```

Open http://localhost:5173 and click "Blockchain Mode".

## Project Structure at a Glance

```
auto-battle/
├── core/          # The heart: battle engine, shared by browser & chain
├── client/        # WASM wrapper around core for browser
├── blockchain/    # Substrate node + auto-battle pallet
├── web/           # React frontend
└── docs/          # You are here
```

## Development Workflow

### Making Game Logic Changes

1. Edit files in `core/src/`
2. Run tests: `cd core && cargo test`
3. Rebuild WASM: `./build-wasm.sh`
4. Refresh browser

### Making UI Changes

1. Edit files in `web/src/`
2. Changes hot-reload automatically

### Making Blockchain Changes

1. Edit files in `blockchain/pallets/auto-battle/src/`
2. Restart the chain: `cd blockchain && ./start_chain.sh`
3. Refresh browser and reconnect

## Common Tasks

### Add a new card

Edit `core/src/units.rs`:
- Add to the card set definition in `get_card_set()`
- Define abilities in the `UnitCard` struct

### Add a new ability

Edit `core/src/battle.rs`:
- Add variant to ability enums
- Implement in `execute_ability()` or relevant trigger handler

### Modify turn validation

Edit `core/src/commit.rs`:
- `verify_and_apply_turn()` validates all player actions

## Running Tests

```bash
# Core engine tests (from project root)
cargo test -p oab-core

# Pallet tests (from project root)
cargo test -p pallet-auto-battle
```

## Debugging

### Browser Console

The WASM engine logs to console. Look for:
- `[INFO]` - Normal operations
- `[DEBUG]` - Detailed state (enable in `core/src/log.rs`)

### Chain Logs

The Substrate node outputs block info and extrinsic results.

### State Inspection

In Blockchain Mode, the UI shows:
- Current chain state (decoded from SCALE)
- Action log (what will be submitted)
- Battle events (combat resolution)

## Next Steps

- Read [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) for deep dive
- Check `core/src/tests/` for examples of game mechanics
- Look at existing cards in `core/src/units.rs` for patterns
