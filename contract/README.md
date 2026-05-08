# OAB Smart Contract (PolkaVM)

The OAB arena game runs as a PolkaVM smart contract on Polkadot Asset Hub
(`pallet-revive`). Built with [`cargo-pvm-contract`](https://github.com/paritytech/cargo-pvm-contract)
macros for automatic dispatch, ABI generation, and CDM metadata extraction.

The frontend connects via [`@dotdm/cdm`](https://github.com/paritytech/contract-dependency-manager)
over PAPI directly to Asset Hub's WS port — no Ethereum JSON-RPC proxy involved.

## Prerequisites

This is a heavier setup than a single dev node — local development runs the
full Polkadot Preview Network (PPN) zombienet (Relay + Asset Hub + People +
Bulletin) plus Kubo IPFS for Bulletin metadata.

### Toolchain

- **Rust nightly + rust-src**
  ```bash
  rustup toolchain install nightly --component rust-src --profile minimal
  ```
- **`cargo-pvm-contract`** from the `charles/cdm-integration` branch:
  ```bash
  HOST_TARGET=$(rustc -vV | grep '^host:' | cut -d' ' -f2)
  git clone -b charles/cdm-integration https://github.com/paritytech/cargo-pvm-contract.git /tmp/cpvm
  cargo install --force --locked --target "$HOST_TARGET" \
    --path /tmp/cpvm/crates/cargo-pvm-contract
  rm -rf /tmp/cpvm
  ```
- **bun ≥ 1.2** (cdm CLI is bun-compiled; bun 1.1 hits a PAPI rxjs bug):
  ```bash
  curl -fsSL -L "https://github.com/oven-sh/bun/releases/download/bun-v1.3.13/bun-darwin-aarch64.zip" -o /tmp/bun.zip
  unzip -o /tmp/bun.zip -d /tmp/bun-extract
  mkdir -p ~/.bun/bin && mv /tmp/bun-extract/bun-darwin-aarch64/bun ~/.bun/bin/bun
  export PATH="$HOME/.bun/bin:$PATH"   # add to your shell rc
  ```

### Polkadot Preview Network (zombienet)

Cloned into `open-auto-battler/ppn/` (gitignored). Requires `gh auth login`
since the upstream is a private paritytech repo:

```bash
cd open-auto-battler
git clone --depth 1 --branch main \
  https://github.com/paritytech/product-preview-net.git ppn
cd ppn && make ensure-deps  # downloads ~250MB of binaries + chain specs
```

### CDM CLI (sibling clone, with local patch)

CDM's `REGISTRY_ADDRESS` constant is hardcoded to a specific bytecode hash
that locally-built registries don't reproduce (cdm doesn't pin `Cargo.lock`
or `rust-toolchain.toml`, so dep drift changes the bytecode → CREATE2
mismatch). Until upstream pins the build, we run a sibling clone with the
constant patched to whatever `make build-registry` produces locally.

```bash
cd ../   # alongside open-auto-battler/
git clone https://github.com/paritytech/contract-dependency-manager.git
cd contract-dependency-manager
pnpm install
make build-registry   # produces target/contract-registry.release.polkavm

# Patch REGISTRY_ADDRESS to match locally-built registry's CREATE2 address.
# The exact value depends on your toolchain — easiest path: deploy registry
# once, read the deployed address from the output, paste it in.
make deploy-registry CHAIN=local   # one-time on a fresh chain; copy the address
sed -i.bak \
  's|"0xae344f7f0f91d3a2176032af2990abcc7606c7d4"|"<YOUR_LOCAL_REGISTRY_ADDR>"|' \
  src/lib/utils/src/constants.ts
```

`start.sh` invokes cdm via `bun run /path/to/this/clone/src/apps/cli/src/cli.ts`.
Set the `CDM_SRC` env var if your sibling clone is anywhere other than
`../contract-dependency-manager`.

## Local Dev Loop

From the OAB repo root:

```bash
./start.sh              # full bootstrap: zombienet + registry + deploy + cards + web
./start.sh --no-bootstrap   # subsequent runs (registry already deployed)
```

What it does:

1. Builds the WASM engine (`build-wasm.sh`)
2. Boots PPN zombienet (`cd ppn && make start EPHEMERAL=1`)
3. Waits for Asset Hub on `ws://127.0.0.1:10020`
4. (Bootstrap only) Builds the cdm `ContractRegistry` from your `CDM_SRC`
   clone, copies it into `contract/target/`, runs `cdm deploy --bootstrap`
   to deploy registry + OAB
5. Otherwise just `cdm deploy -n local` to redeploy OAB
6. Runs `cdm install` to refresh `web/cdm.json` and `web/.cdm/cdm.d.ts`
7. Builds card/set bytes via `oab-register-cards --dump`, registers them
   via `web/scripts/register-cards.ts` (Utility.batch_all over PAPI — 114
   calls in ≈25s)
8. Starts `npm run dev` on `:5173`

Open `http://localhost:5173/#/contract`, click DEV ACCOUNTS, pick Alice,
click Contract Arena → Start Game.

## Endpoints PPN exposes

| Chain                 | WS                        |
|---                    |---                        |
| Paseo Relay           | `ws://127.0.0.1:10000`    |
| People Chain          | `ws://127.0.0.1:10010`    |
| **Asset Hub**         | `ws://127.0.0.1:10020`    |
| Bulletin Chain        | `ws://127.0.0.1:10030`    |
| IPFS gateway          | `http://127.0.0.1:8080/ipfs` |

`cdm install` needs `--ipfs-gateway-url http://127.0.0.1:8080/ipfs` because
its `local` preset hardcodes `:8283` (stale). `start.sh` does this for you.

## Build the Contract Manually

```bash
cd contract
env -u CARGO -u RUSTUP_TOOLCHAIN \
  cargo pvm-contract build --manifest-path "$(pwd)/Cargo.toml" -p oab-contract
```

Note the **absolute** `--manifest-path` — `cargo-pvm-contract` v0.3.0 has a
bug where a relative manifest path causes an ENOENT spawn failure (parent of
`"Cargo.toml"` is `""`, which `current_dir("")` rejects). cdm's wrappers
always pass absolute paths internally, so it doesn't bite the normal flow.

Outputs:
- `target/oab-contract.release.polkavm` (~97 KB) — bytecode
- `target/oab-contract.release.abi.json` — Solidity-style ABI
- `target/oab-contract.release.cdm.json` — `{cdmPackage: "@oab/arena"}`

## Upstream patches the dev loop depends on

1. **`web/patches/@polkadot-api+sdk-ink+0.6.2.patch`** (auto-applied via
   `postinstall: patch-package`) — wraps sdk-ink's `traceCall` so descriptor
   incompatibility (PPN's Asset Hub runtime ships an older `ReviveApi.trace_call`
   shape than what sdk-ink's bundled descriptors expect) degrades to
   `{success: false}` instead of throwing. Without this, every `.query()`
   and gasLimit-less `.tx()` rejects.

2. **Sibling `contract-dependency-manager` clone with patched
   `REGISTRY_ADDRESS`** — see Prerequisites above.

3. **Manual `weight_limit` and `ref_time`/`proof_size` snake_case** in any
   direct `Revive.call` — `@dotdm/cdm`'s `TxOpts.gasLimit` type claims
   camelCase but PAPI's typed metadata expects snake_case. Already handled
   in `web/src/contract/index.ts` `TX_OPTS` and `web/scripts/register-cards.ts`.

These are upstream gaps worth filing; until they're addressed, the local
patches keep the loop working.

## Contract API

Rust method names are exposed through the generated ABI as `camelCase`. All
game data is SCALE-encoded inside ABI `bytes` parameters.

| Function                     | Selector     | Description                                     |
| ---------------------------- | ------------ | ----------------------------------------------- |
| `registerCard(bytes)`        | `0x704b59f5` | Admin: store a card definition                  |
| `registerSet(uint16, bytes)` | `0x199f7cb7` | Admin: store a card set                         |
| `startGame(uint16, uint64)`  | `0xe576ed69` | Start a new arena game (set ID, seed nonce)     |
| `submitTurn(bytes)`          | `0xe737f74d` | Submit shop actions and resolve battle on-chain |
| `getGameState()`             | `0xb7d0628b` | Read current game state (view call)             |
| `abandonGame()`              | `0xc398723a` | Forfeit the current game                        |
| `endGame()`                  | `0x6cbc2ded` | Finalize a completed game                       |
| `getCard(uint16)`            | `0xc5f6e877` | Read a card definition                          |
| `getSet(uint16)`             | `0xd6ea4a5f` | Read a card set                                 |

The contract emits a `BattleReported` event after each `submitTurn` with the
battle result and opponent board for client-side replay. The frontend reads
this from the `Revive.ContractEmitted` substrate event in the tx's events
list.

## Project Structure

```
contract/
  src/main.rs                       # Contract source (pvm-contract macros, no_std)
                                    # Annotated with #[pvm::contract(cdm = "@oab/arena")]
  build.rs                          # PvmBuilder: PolkaVM linking + ABI + CDM metadata
  scripts/deploy.sh                 # LEGACY eth-rpc deploy (kept for revive-dev-node)
  tests-native/                     # Native Rust tests (mirrors contract logic)
  target/
    oab-contract.release.polkavm    # Compiled PolkaVM bytecode
    oab-contract.release.abi.json   # Generated Solidity ABI
    oab-contract.release.cdm.json   # CDM package marker
    contract-registry.release.polkavm  # Copied from CDM_SRC clone for bootstrap
    cards-dump.json                 # Generated by start.sh, fed to register-cards.ts
register-cards/                     # Rust CLI: dumps SCALE card/set bytes to JSON
                                    # Use `--dump <PATH>` mode for the cdm flow
```

## Note on oab-bot

The bot in `../oab-bot/` still uses Ethereum JSON-RPC over `eth-rpc`. PPN
ships `eth-rpc` but it currently panics on connect (`ChainMismatch`) against
the local Asset Hub runtime. The bot is therefore broken against the cdm
setup; migrating it to PAPI / `@dotdm/cdm` is a separate initiative.
