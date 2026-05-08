# Agent Instructions (Canonical)

This folder is the single source of truth for AI agent guidance.
The top-level files (`AGENTS.md`, `CLAUDE.md`) are pointers only.

## Start Here
Read the following documents when relevant:
- `agents/AGENTS_INDEX.md` for the canonical index.
- `agents/ARCHITECTURE.md` for the system overview.
- `agents/CORE_ENGINE.md` for game rules and engine structure.
- `agents/WASM_BRIDGE.md` for Rust-to-WASM boundaries.
- `agents/WEB_UI.md` for frontend state and components.
- `agents/SERIALIZATION_CONTRACTS.md` for SCALE and JSON contracts.
- `agents/TESTING_GUIDE.md` for test locations and expectations.
- `agents/FORMATTING.md` for mandatory formatting rules.
- `agents/REACT.md` for frontend patterns and state management.

## Global Requirements
- **WASM Bridge**: The web app uses a SCALE-encoded bridge between the PolkaVM
  smart contract and the browser WASM engine. Any change to game state types
  must be reflected in `core/`, the contract (`contract/`), and the frontend.
- **No Engine Panics**: Core engine/runtime code must not use `panic!`,
  `unwrap()`, or `expect()` for normal control flow. Use explicit error
  handling or deterministic no-op behavior instead.
- **Formatting**: After making changes, always run `cargo fmt` (Rust) and
  `prettier` (web) on affected files.

## Layout
- `battle/`, `assets/`, `game/` — deterministic game engine, card data, rules.
- `client/` — `wasm-bindgen` bridge that exposes the engine to the browser.
- `contract/` — PolkaVM smart contract that runs the arena game on-chain.
- `web/` — React frontend (contract-only).

## Workflow Expectations
- Maintain the visual style established in `web/src/index.css`.
- Prefer minimal, targeted edits over broad refactors.
- Use `./start.sh` to boot PPN zombienet, deploy the contract via the cdm
  CLI, register cards, and start the web app. See `contract/README.md` for
  prerequisites (bun ≥ 1.2, ppn checkout, sibling `contract-dependency-manager`
  clone with patched `REGISTRY_ADDRESS`, `cargo-pvm-contract` from
  `charles/cdm-integration`).
- The contract path uses `@dotdm/cdm` over PAPI (Asset Hub WS, not eth-rpc).
  Sign-flow uses `@parity/product-sdk-signer`'s `SignerManager` with
  `DevProvider` for local dev.
- A pinned local patch to `@polkadot-api/sdk-ink` lives in `web/patches/` and
  is applied automatically via `npm install` (postinstall: `patch-package`).
  Don't edit `node_modules` directly — update the patch via `npx patch-package
  @polkadot-api/sdk-ink`.
