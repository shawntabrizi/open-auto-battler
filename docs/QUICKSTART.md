# Quick Start Guide

Get running with Open Auto Battler development. The on-chain path is heavier
than a single dev node — it boots a local Polkadot Preview Network (PPN). If
you only want to look at the game, the WASM-only path is much lighter.

> **Authoritative deep-dive:** [`contract/README.md`](../contract/README.md)
> covers the full PolkaVM contract / PPN / `@dotdm/cdm` setup. This document
> is a shorter on-ramp.

## Two paths

| Path                   | What runs                                | Setup effort  |
|---                     |---                                       |---            |
| **WASM-only**          | Engine + React UI (no chain)             | ~5 minutes    |
| **Full on-chain loop** | PPN zombienet + PolkaVM contract + UI    | ~30–60 min*   |

\* mostly toolchain installs and a ~250 MB binary download for PPN.

If you prefer to keep all of this isolated from your host, see
[CONTAINER_DEV.md](./CONTAINER_DEV.md) for a distrobox/podman recipe.

---

## Path 1 — WASM-only (engine + UI, no chain)

This builds the deterministic battle engine to WASM and serves the React UI.
On-chain routes won't work, but you can verify the toolchain and explore the
codebase quickly.

### Prerequisites

- Rust stable (engine + WASM bridge do not need nightly)
- `wasm-pack`: `cargo install wasm-pack`
- Node.js 20+ and npm (the `web/` workspace uses npm — `package-lock.json` is
  the source of truth)

### Run

```bash
# From project root
./build-wasm.sh                       # compiles client/ to WASM, copies to web/src/wasm
cd web && npm install && npm run dev  # Vite dev server on :5173
```

Open <http://localhost:5173>. The `/#/contract` route requires the on-chain
stack (Path 2); other routes render against the local WASM engine.

---

## Path 2 — Full on-chain loop (PPN + contract + UI)

This is what `./start.sh` automates. Setup is non-trivial because the contract
runs on PolkaVM (`pallet-revive` on Asset Hub), the frontend talks to it via
`@dotdm/cdm` over PAPI, and a local Polkadot Preview Network supplies the
relay + Asset Hub + IPFS infrastructure.

### Prerequisites

Beyond Path 1's tools:

- **Rust nightly + `rust-src`** (only the contract crate needs it — the engine
  compiles on stable):
  ```bash
  rustup toolchain install nightly --component rust-src --profile minimal
  ```
- **`cargo-pvm-contract`** from the `charles/cdm-integration` branch:
  ```bash
  HOST_TARGET=$(rustc -vV | grep '^host:' | cut -d' ' -f2)
  git clone -b charles/cdm-integration \
    https://github.com/paritytech/cargo-pvm-contract.git /tmp/cpvm
  cargo install --force --locked --target "$HOST_TARGET" \
    --path /tmp/cpvm/crates/cargo-pvm-contract
  ```
- **`bun` ≥ 1.2** (the cdm CLI is bun-compiled; bun 1.1 hits a PAPI rxjs bug):
  ```bash
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"   # add to your shell rc
  ```
- **`gh auth login`** — the PPN installer lives in the public
  `paritytech/ppn-proxy` repo, but it clones `paritytech/product-preview-net`
  underneath, which **is private**. Without GitHub auth the install step
  fails partway through.

### Two extra clones

The dev loop expects two extra repos alongside `open-auto-battler/`:

1. **PPN zombienet** (cloned *inside* this repo at `./ppn/`). Use the
   installer from `paritytech/ppn-proxy` — it clones the network repo and
   runs `make ensure-deps` for you (~250 MB of chain binaries + specs).
   `gh auth login` must already be done because the installer's internal
   clone targets a private repo:
   ```bash
   cd open-auto-battler
   curl -sL https://raw.githubusercontent.com/paritytech/ppn-proxy/main/install.sh | bash
   ```

2. **Sibling `contract-dependency-manager` clone** with a patched
   `REGISTRY_ADDRESS` (cdm hardcodes the registry address for a specific
   bytecode hash that locally-built registries don't reproduce — see
   [`contract/README.md`](../contract/README.md) for the why):
   ```bash
   cd ..   # alongside open-auto-battler/
   git clone https://github.com/paritytech/contract-dependency-manager.git
   cd contract-dependency-manager
   pnpm install
   make build-registry
   make deploy-registry CHAIN=local      # one-time on a fresh chain
   # Patch REGISTRY_ADDRESS to the deployed address from the previous step:
   sed -i.bak \
     's|"0xae344f7f0f91d3a2176032af2990abcc7606c7d4"|"<DEPLOYED_ADDR>"|' \
     src/lib/utils/src/constants.ts
   ```

If your cdm clone lives elsewhere, set `CDM_SRC=/path/to/clone` before running
`start.sh`.

### Boot it

```bash
./start.sh                  # full bootstrap (registry + contract + cards + web)
./start.sh --no-bootstrap   # subsequent runs against the same chain
```

`start.sh` will:

1. Build the WASM engine (`./build-wasm.sh`).
2. Boot PPN zombienet (`cd ppn && make start EPHEMERAL=1`).
3. Wait for Asset Hub at `ws://127.0.0.1:10020`.
4. (Bootstrap only) Build and deploy the cdm `ContractRegistry`, then deploy
   the OAB contract; otherwise just redeploy OAB.
5. Refresh `web/cdm.json` + typed bindings via `cdm install`.
6. Generate card/set bytes (`oab-register-cards --dump`) and register them
   via `Utility.batch_all` (~25 s for 114 calls).
7. Start the Vite dev server on `:5173`.

Open <http://localhost:5173/#/contract>, click **DEV ACCOUNTS** → pick Alice
→ **Contract Arena** → **Start Game**.

### Endpoints PPN exposes

| Chain          | URL                          |
|---             |---                           |
| Paseo Relay    | `ws://127.0.0.1:10000`       |
| People Chain   | `ws://127.0.0.1:10010`       |
| **Asset Hub**  | `ws://127.0.0.1:10020`       |
| Bulletin Chain | `ws://127.0.0.1:10030`       |
| IPFS gateway   | `http://127.0.0.1:8080/ipfs` |

---

## Development Workflow

### Engine changes (`battle/`, `game/`, `assets/`)

1. Edit the relevant crate.
2. `cargo test -p oab-battle` (or the crate you touched).
3. `./build-wasm.sh` to rebuild the browser bundle.
4. Reload the browser tab.

### UI changes (`web/`)

Vite hot-reloads — just edit and save.

### Contract changes (`contract/src/main.rs`)

Re-running `./start.sh` (without `--no-bootstrap`) cleanly redeploys. Or build
manually:

```bash
cd contract
env -u CARGO -u RUSTUP_TOOLCHAIN \
  cargo pvm-contract build --manifest-path "$(pwd)/Cargo.toml" -p oab-contract
```

The absolute `--manifest-path` is required — `cargo-pvm-contract` v0.3.0 has a
relative-path bug. See `contract/README.md` for the full contract API and
selector table.

---

## Running Tests

```bash
cargo test --workspace          # full Rust workspace
cargo test -p oab-battle        # just the battle engine
```

The web tests (if any) live under `web/` and use Vite's runner — `cd web && npm test`.

---

## Where to read next

- [`agents/AGENTS.md`](../agents/AGENTS.md) — canonical agent + architecture
  index. Start here if you're contributing.
- [`agents/ARCHITECTURE.md`](../agents/ARCHITECTURE.md) — current system map.
- [`contract/README.md`](../contract/README.md) — full PolkaVM / PPN / cdm
  setup, contract API, and the upstream patches the dev loop depends on.
- [CONTAINER_DEV.md](./CONTAINER_DEV.md) — running the whole toolchain inside
  a container.
