# OAB Smart Contract (PolkaVM)

The OAB arena game runs as a PolkaVM smart contract on Polkadot Asset Hub
(`pallet-revive`). It is built with the
[`cargo-pvm-contract` / `pvm-contract-sdk`](https://github.com/paritytech/cargo-pvm-contract)
framework (git `main`) for automatic dispatch, ABI generation, and CDM metadata.

The frontend talks to it through the **Polkadot Product SDK**
(`@parity/product-sdk-contracts` + `@parity/product-sdk-chain-client`), which
routes every chain call through the host — no direct WebSocket, no Ethereum
JSON-RPC proxy.

## Toolchain

The `contract/rust-toolchain.toml` pins the nightly the PolkaVM target needs
(`rust-src` builds `core`/`std` from source for `riscv64…-polkavm`):

```toml
[toolchain]
channel = "nightly-2026-02-01"
components = ["rust-src"]
```

- **Rust** — installed automatically from the pin above.
- **`cdm` CLI** — the contract build/deploy/install tool. Install per its
  upstream `install.sh`; `cdm --version` should report ≥ 0.1.0.
- **`playground` CLI** — for deploying the frontend to Bulletin + DotNS.

No sibling `contract-dependency-manager` clone, no `bun`, and no local
Preview-Network zombienet are required any more — those were part of the
pre-SDK prototype loop and have been retired.

## Build the contract

```bash
cd contract
cargo build --release          # build.rs (PvmBuilder) links the PolkaVM blob + ABI
# or, equivalently, via the CLI:
# cargo pvm-contract build
```

Outputs (under `contract/target/release/`):
- `oab-contract.polkavm` — PolkaVM bytecode (~93 KB)
- `oab-contract.abi.json` — Solidity-style ABI (camelCase selectors)

The `build.rs` recursion guard means an outer host build re-enters the PVM
build once; set `CARGO_PVM_CONTRACT_INTERNAL=1` to skip the PVM step when you
only want a host compile (e.g. for fast test iteration — see below).

## Native tests

The contract compiles as a normal std crate off the PolkaVM target, so its
logic is unit-tested natively against a `MockHost` — no deployment, no node:

```bash
cd contract
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --features std
```

This drives the real contract methods (`startGame`/`submitTurn`/`endGame`/…)
through the arena flow. The `contract/tests-native/` crate additionally
mirrors the game-engine logic for parity with the original pallet behaviour.

> Note: `contract/.cargo/config.toml` pins the riscv target for the on-chain
> build, so run native tests with a host target — the `CARGO_PVM_CONTRACT_INTERNAL=1
> cargo test --features std` invocation above builds for the host by default
> when that config is not forcing riscv. If a `cargo test` picks up the riscv
> target, temporarily move `.cargo/config.toml` aside.

## Deploy (paseo)

Deployment uses the standard `cdm` flow (same as the Rock-Paper-Scissors
reference app). It requires a funded paseo Asset Hub account (faucet) and a
one-time account mapping:

```bash
cdm build
cdm deploy -n paseo                 # deploys via pallet-revive + registers @oab/arena
cdm install -n paseo @<handle>/arena  # refresh web/cdm.json (registry + address)
```

`cdm install` writes the registry-pointer manifest the frontend consumes at
runtime; `web/src/contract/index.ts` resolves the live address/ABI from the
on-chain CDM registry via `ContractManager.fromLiveClient` (a redeploy is
picked up without shipping a new `cdm.json`). It also still accepts the legacy
inline `@dotdm/cdm` manifest for backward compatibility.

After the contract is deployed, register the genesis cards/sets and deploy the
frontend to a host (`playground deploy`) so it can reach Asset Hub through the
Polkadot host.

## Contract API

Rust method names are exposed through the generated ABI as `camelCase`. All
game data is SCALE-encoded inside ABI `bytes` parameters.

| Function                     | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `registerCard(bytes)`        | Admin: store a card definition                  |
| `registerSet(uint16, bytes)` | Admin: store a card set                         |
| `startGame(uint16, uint64)`  | Start a new arena game (set ID, seed nonce)     |
| `submitTurn(bytes)`          | Submit shop actions and resolve battle on-chain |
| `getGameState()`             | Read current game state (view call)             |
| `abandonGame()`              | Forfeit the current game                        |
| `endGame()`                  | Finalize a completed game                       |
| `getCard(uint16)`            | Read a card definition                          |
| `getSet(uint16)`             | Read a card set                                 |

The contract emits a `BattleReported` event after each `submitTurn` with the
battle result and opponent board for client-side replay. The frontend reads it
from the `Revive.ContractEmitted` substrate event in the tx's events list.

## Project structure

```
contract/
  src/main.rs        # Contract source (pvm-contract-sdk macros; raw host storage
                     # of SCALE game blobs at keccak-derived keys) + native tests
  build.rs           # PvmBuilder: PolkaVM linking + ABI + CDM metadata
  rust-toolchain.toml
  .cargo/config.toml # riscv target + build-std for the on-chain build
  tests-native/      # game-logic parity tests (std)
  Cargo.toml         # deps pinned to cargo-pvm-contract @ df613d48
```

## Storage model

Persistent state is stored as SCALE-encoded blobs via raw host storage
(`self.host().set_storage`/`get_storage`) at keys derived from
`keccak256(domain_prefix ++ key)`. The shared `oab-battle`/`oab-game` engine
types are SCALE (`parity-scale-codec`), so they stay out of the framework's
typed `Mapping`/`Lazy` (Solidity `SolStorage`) layer.
