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
- `contract/README.md` for the arena contract API, deploy, and personhood.
- `docs/NFT_DESIGN.md` for the Scarcity NFTs, the claim minter, and badges.
- `BETA_RELEASE_PLAN.md` for the roadmap and open items.

## Global Requirements
- **One engine, two places**: the same Rust engine (`battle/`, `game/`) runs
  in the PolkaVM contract and in the browser WASM module, joined by SCALE.
  Any change to game state types must be reflected in the engine, the
  contract (`contract/`), the WASM bridge (`client/`), and the frontend
  (`web/src/types.ts`, `web/src/contract/codec.ts`).
- **No Engine Panics**: Core engine/runtime code must not use `panic!`,
  `unwrap()`, or `expect()` for normal control flow. Use explicit error
  handling or deterministic no-op behavior instead.
- **Formatting**: After making changes, always run `cargo fmt` (Rust) and
  `prettier` (web) on affected files.

## Layout
- `battle/`, `assets/`, `game/` — deterministic game engine, card data, rules.
- `client/` — `wasm-bindgen` bridge that exposes the engine to the browser.
- `contract/` — PolkaVM arena contract (`@oab/arena`): casual and ranked
  games, leaderboard, achievement badges.
- `nft-minter/` — PolkaVM claim minter (`@oab/nft-minter`) for the OAB
  Collectibles NFT collection.
- `register-cards/` — dumps card and set data for on-chain registration.
- `web/` — React frontend (contract-only).

There is no pallet or runtime. The old `pallet-auto-battle` runtime was
removed on 2026-05-05.

## Workflow Expectations
- Maintain the visual style established in `web/src/index.css`.
- Prefer minimal, targeted edits over broad refactors.
- Use `./start.sh` to build the WASM engine and start the web dev server for
  UI work. Contract play needs the frontend inside a Polkadot host (Polkadot
  Desktop, Polkadot Mobile, or dot.li), because chain access is host-routed.
- The contract is built with `cargo-pvm-contract` / `pvm-contract-sdk` (git
  rev `d5991131`, polkavm 0.35) and deployed with the `cdm` CLI — see
  `contract/README.md`.
- The frontend talks to the contract through the Polkadot Product SDK
  (`@parity/product-sdk-contracts` `createContract` with the address and ABI
  from `web/cdm.json`, over the host-routed `@parity/product-sdk-chain-client`)
  and signs via `@parity/product-sdk-signer`'s `SignerManager` (host provider
  inside a host, dev accounts standalone — derived from `isInHost()`).
- Deploy the frontend with `npm run deploy` from `web/` (Bulletin + DotNS,
  `oab-arena.paseo`) — see `docs/QUICKSTART.md`.
