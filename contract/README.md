# OAB Smart Contract (PolkaVM)

The OAB arena game can run as a PolkaVM smart contract, deployed to any chain with `pallet-revive`. This guide covers local development setup.

## Prerequisites

### Rust Toolchain

You need Rust nightly with the RISC-V target for compiling the contract:

```bash
rustup toolchain install nightly
rustup component add rust-src --toolchain nightly
```

### polkatool

Links the compiled RISC-V binary into a PolkaVM blob:

```bash
cargo install polkatool
```

### revive-dev-node

A standalone Substrate node with `pallet-revive` enabled, for local development:

```bash
cargo install --git https://github.com/paritytech/polkadot-sdk revive-dev-node
```

**macOS note:** If the build fails with `Library not loaded: @rpath/libclang.dylib`, you need to tell the linker where to find LLVM's libclang:

```bash
# If you have Xcode Command Line Tools:
DYLD_FALLBACK_LIBRARY_PATH=/Library/Developer/CommandLineTools/usr/lib \
LIBCLANG_PATH=/Library/Developer/CommandLineTools/usr/lib \
cargo install --git https://github.com/paritytech/polkadot-sdk revive-dev-node

# Or install llvm via Homebrew and use that:
brew install llvm
DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix llvm)/lib" \
LIBCLANG_PATH="$(brew --prefix llvm)/lib" \
cargo install --git https://github.com/paritytech/polkadot-sdk revive-dev-node
```

### eth-rpc (pallet-revive-eth-rpc)

Ethereum JSON-RPC proxy that translates eth calls to the Substrate node:

```bash
cargo install --git https://github.com/paritytech/polkadot-sdk pallet-revive-eth-rpc
```

The binary is called `eth-rpc`. The same macOS libclang fix applies if the build fails.

## Build the Contract

```bash
cd contract
make
```

This produces `contract.polkavm` (~78 KB). The build uses `RUSTC_BOOTSTRAP=1` for `-Zbuild-std` support with the custom RISC-V target.

## Run a Local Dev Node

Open two terminals:

```bash
# Terminal 1: Substrate node with pallet-revive
revive-dev-node --dev

# Terminal 2: Ethereum JSON-RPC proxy
eth-rpc --dev
```

The RPC endpoint will be available at `http://localhost:8545`.

## Deploy

With the dev node running:

```bash
cd contract
./scripts/deploy.sh
```

This will:
1. Deploy `contract.polkavm` to the local node
2. Register all cards and sets on-chain (via the `register-cards` tool)
3. Write `deployment.json` with the contract address and RPC URL

The frontend reads `deployment.json` automatically.

## Run the Frontend

From the project root:

```bash
cd web
npm run dev
```

Navigate to `/#/contract` to connect and play.

## Project Structure

```
contract/
  src/main.rs          # Contract source (PolkaVM, no_std)
  Makefile             # Build: cargo + polkatool link
  contract.polkavm     # Compiled contract blob
  deployment.json      # Auto-generated after deploy (address, rpcUrl, chainId)
  scripts/deploy.sh    # Deploy + register cards
  tests-native/        # Native Rust tests (mirrors contract logic)
register-cards/        # CLI tool that registers card/set data on the contract
```

## Contract API

| Function | Selector | Description |
|---|---|---|
| `registerCard(bytes)` | `0xd6c09c1d` | Admin: store a card definition |
| `registerSet(uint16, bytes)` | `0xd8f41b6a` | Admin: store a card set |
| `startGame(uint16, uint64)` | `0xe8c0127d` | Start a new arena game (set ID, seed nonce) |
| `submitTurn(bytes, bytes)` | `0x217081fe` | Submit shop actions, resolve battle on-chain |
| `getGameState()` | `0x1760f3a3` | Read current game state (view call) |
| `abandonGame()` | `0xd6b56ded` | Forfeit the current game |
| `getCard(uint16)` | `0xcd25ba26` | Read a card definition |
| `getSet(uint16)` | `0x3e42c388` | Read a card set |

All game data is SCALE-encoded. The contract emits a `BattleReported` event after each turn with the battle result and opponent board for client-side replay.
