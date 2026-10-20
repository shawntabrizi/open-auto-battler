# Architecture Overview

This document is derived from the source code structure and entry points.

## System Map
- `battle/`, `assets/`, `game/` — deterministic Rust game engine and card data.
  `battle/` holds types, battle resolution, and turn validation. `game/` holds
  game state, config, and UI views. `assets/data/` holds the card, set, style,
  and theme JSON.
- `client/` — `wasm-bindgen` bridge exposing the engine to JavaScript. Entry in
  `client/src/lib.rs` and `client/src/engine.rs`.
- `contract/` — PolkaVM arena contract `@oab/arena` (the only chain backend).
  Entry in `contract/src/main.rs`.
- `nft-minter/` — PolkaVM claim minter `@oab/nft-minter`. Entry in
  `nft-minter/src/main.rs`.
- `web/` — React UI and Zustand state. Entry in `web/src/main.tsx`.

## Live Deployment (Paseo Asset Hub Next)
- Arena v2: `0xA61f803AeEBFfF2c7568157756932D3944EDCa28`, CDM registry
  `0xc1a73a4f93fde65b1cb1680baead248073566cb0` (both in `web/cdm.json`).
- NFTs: collection 29 "Open Auto Battler Collectibles" (cosmetics, claimed
  with Scarcity credits through `@oab/nft-minter`) and collection 30 "OAB
  Achievements" (soulbound badges, owned by the arena). See
  `docs/NFT_DESIGN.md`.
- Frontend: product ID `oab-arena.paseo`, served at
  https://oab-arena.paseo.li from Bulletin + DotNS.

## Primary Data Flow
1. The Rust engine in `battle/`, `game/`, and `assets/` defines all types and
   battle rules.
2. The WASM layer in `client/src/engine.rs` wraps the engine and exposes a
   `GameEngine` API to JS.
3. The web UI consumes `GameEngine` via `web/src/store/gameStore.ts`. The shop
   phase runs locally in WASM.
4. Arena turns are submitted to the contract via `web/src/contract/index.ts`,
   driven by `web/src/store/contractStore.ts`. The contract validates the turn
   with the same engine, picks a ghost opponent, resolves the battle, and
   emits a `BattleReported` event with the battle seed and the opponent board.
   The WASM engine replays that battle locally to render it.
5. `endGame` of a ranked run records the run on the per-set leaderboard and
   mints achievement badges.

## Integration Boundaries
- SCALE encoding for on-chain or compact transport uses `parity_scale_codec`
  in `battle/`, `game/`, and the contract.
- JSON views for the UI are created in the engine and consumed by TS types in
  `web/src/types.ts`.
- The WASM API is defined in `client/src/engine.rs` and consumed by
  `web/src/store/gameStore.ts`.
- The contract API is defined in `contract/src/main.rs` and consumed by
  `web/src/contract/index.ts` via `@parity/product-sdk-contracts`
  (`createContract` with the address and ABI from `web/cdm.json`) over the
  host-routed `@parity/product-sdk-chain-client`, with signing through
  `@parity/product-sdk-signer`'s `SignerManager`.
- SCALE results of the ranked and badge views are decoded in
  `web/src/contract/codec.ts`.

## Chain Access Paths
- **Sponsored play** (`web/src/contract/session.ts`): inside a host, the
  player approves once. A local session key, added as a proxy, then signs each
  game call and pays the fee in PGAS. If the player declines or the host
  cannot sponsor, play falls back to product-account signing.
- **Personhood** (`web/src/contract/personhood.ts`): ranked play needs the
  product account bound to the player's personhood alias in OAB's context
  (pallet `AliasAccounts`). The contract reads the Lite/Full status and the
  alias from the personhood precompile.
- **Cosmetics ownership** (`web/src/services/nftOwnership.ts`): reads item
  metadata from collection 29. Listing owned items waits for the host NftPurse
  API, so the ownership source is a disabled stub for now.

## Key Entry Points
- Engine exports and modules: `battle/src/lib.rs`, `game/src/lib.rs`.
- WASM public API: `client/src/engine.rs`.
- Web store and engine usage: `web/src/store/gameStore.ts` and
  `web/src/store/contractStore.ts`.
- Contract entry point: `contract/src/main.rs`.
- Contract client: `web/src/contract/index.ts` (with `arenaFlows.ts`,
  `codec.ts`, `personhood.ts`, and `session.ts`).
