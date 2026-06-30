# Migrate open-auto-battler to @parity/product-sdk

> Produced via the `migrating-to-product-sdk` discovery + spec process.
> Sources analyzed: the target stack (`@parity/product-sdk`), the reference
> app (`Rock-Paper-Scissors`), and this repo's current `web/` + `contract/`.

## Target
- Repo: `open-auto-battler` (web app in `web/`, contract in `contract/`, Rust engine workspace at root)
- Target SDK: `@parity/product-sdk@^0.17` family (mirror the versions the RPS reference app pins where they differ — RPS is the known-good baseline)
- Target polkadot-api: `^2.x`

## Discovery summary
- **Framework:** Vite + React (single `web/` app inside a Rust/Cargo monorepo)
- **Container detection:** **dual** — already uses `isInsideContainerSync` from `@parity/product-sdk-host`, but also has a standalone raw-WebSocket path
- **Workspace structure:** single web app; Cargo workspace (`battle`, `game`, `assets`, `client`, `contract`, `register-cards`)
- **PAPI version:** `polkadot-api@1.23.3` (1.x — major bump required)
- **Legacy/prototype stacks detected:**
  - `@dotdm/cdm` contract client (`web/src/contract/index.ts`) — **wrong stack**; the SDK uses `@parity/product-sdk-contracts`
  - Hand-rolled Solidity ABI encoder (`web/src/contract/index.ts` `pad32`/`uint256`/`concat`, hardcoded 4-byte selectors)
  - Hand-rolled IPFS (`web/src/utils/ipfs.ts` `fetchIpfsJson` unguarded `fetch`, `uploadToPinata`)
  - Raw `createClient(withPolkadotSdkCompat(getWsProvider(url)))` in ALL modes — no host provider
  - Manual HOST/DEV button instead of `isInHost()`-derived provider
  - Unused-in-app deps: `@novasamatech/product-sdk`, `@polkadot-api/pjs-signer`, `@polkadot-labs/hdkd*`, `@polkadot-api/substrate-bindings`
  - Two disconnected endpoint systems: `settingsStore` (`9944`/`oab-rpc`) vs `contractStore` (`10020`)
- **Already SDK-aligned (keep):** `@parity/product-sdk-host` (`isInsideContainerSync`, `hostLocalStorage`), `@parity/product-sdk-signer` (`SignerManager`, host/dev providers, no injected wallet), `@parity/product-sdk-tx` (`submitAndWatch`)
- **Tests:** vitest (64) in `web/`; cargo (164 across `battle`/`game`/`assets`)

## Reframe (critical)
The `polkadot-triangle` skill describes an **older** model (`createPapiProvider`, `getWsProvider` standalone *fallback*, three-way detection). The **actual `@parity/product-sdk`** is host-only: boolean `isInsideContainer()`, chain access via `getChainAPI`/`createChainClient` (host-routed through `@parity/truapi`), contracts via `@parity/product-sdk-contracts` (NOT `@dotdm/cdm`), IPFS via `@parity/product-sdk-cloud-storage`. The migration skill's chain-access pattern *does* permit a `getHostProvider` + direct-WS dev fallback, so the local-dev path survives in restructured form.

## Migration areas

### 2. Chain access            [yes — CORE]
- **Sub-pattern:** `getChainAPI('paseo')` (preset) or `createChainClient({ chains: { assetHub: paseo_asset_hub } })` from `@parity/product-sdk-chain-client`, routing via `getHostProvider(genesisHash)`; keep a guarded direct-WS path for local dev only.
- **Files:** `web/src/contract/index.ts` (client creation ~L154), `web/src/store/settingsStore.ts` (endpoint presets), `web/src/store/contractStore.ts` (`DEFAULT_WS`)
- **Owning skill:** `product-sdk-chain-connection`
- **Recommendation:** **conform in place.**
- **Notes:** Removes the raw-WS-in-host non-compliance — the single biggest blocker (app cannot reach chain inside a host today). Reconcile the two endpoint systems into one host-first client.

### 10. Contracts              [yes — CORE]
- **Sub-pattern:** `ContractManager.fromLiveClient(cdmJson, client, descriptor, { ... })` + `contract.<method>.query(...)` / `.tx(...)`. Resolve address from the live on-chain CDM registry (don't trust the `cdm.json` address snapshot). `ensureContractAccountMapped` before calls.
- **Files:** `web/src/contract/index.ts` (whole module), `web/cdm.json`, `web/.cdm/cdm.d.ts` (drop the `@dotdm/cdm` augmentation)
- **Owning skill:** `product-sdk-contracts`
- **Recommendation:** **re-platform.**
- **Notes:** Replaces `@dotdm/cdm` + the hand-rolled Solidity ABI encoder + the raw `Revive.call` write path. Methods to port: `registerCard`, `registerSet`, `startGame`, `submitTurn`, `getGameState`, `getSet`, `getCard`, `endGame`, `abandonGame`. The custom `BattleReported` event decoder and the `DEFAULT_CONFIG_SCALE` schema-bridge hack should be re-evaluated against the SDK contract ABI/event surface.

### 14. PAPI 2.x + descriptors  [yes]
- **Sub-pattern:** bump `polkadot-api` 1.23 → `^2.x` + aligned subpackages; `polkadot-api/ws-provider/web` → `polkadot-api/ws`; `Binary.fromBytes`/`.asHex()` → `Binary.toHex(uint8)` / raw `Uint8Array`; rewrite any `.watch()` event handling; adopt `@parity/product-sdk-descriptors` and bump `web/.papi/descriptors`.
- **Files:** `web/package.json`, `web/.papi/*`, all `web/src` PAPI call sites
- **Owning skill:** _(this process)_ + `product-sdk-chain-connection`
- **Recommendation:** **conform (mechanical).**
- **Notes:** Gotcha G1 (`@polkadot-api/json-rpc-provider` override) and G10 (descriptors bump) apply.

### 9. Cloud Storage           [yes]
- **Sub-pattern:** drop hand-rolled IPFS/Pinata. If all blobs ≤ 2 MiB → `getPreimageManager().submit(bytes)` (host-sponsored, smallest scope); else `CloudStorageClient.create({ environment, signer })`. Use `calculateCid` (now `Promise<CID>`) for client-side CIDs.
- **Files:** `web/src/utils/ipfs.ts`, call sites that read/write card art / battle blobs
- **Owning skill:** `product-sdk-cloud-storage`
- **Recommendation:** **re-platform.**
- **Notes:** Fixes the unguarded `fetchIpfsJson` `fetch` (blocked in host sandbox). Decide blob-size path during implementation. CID computation becomes async — async-ify wrappers AND test fixtures.

### 3. Wallet / Signer         [yes]
- **Sub-pattern:** keep `SignerManager`; bump `@parity/product-sdk-signer` 0.1 → current; derive `providerType` from `isInHost()` (`'host'` in container, `'dev'`/`DevProvider` for local dev) instead of the manual HOST/DEV button.
- **Files:** `web/src/contract/index.ts` (`SignerManager` init, `connect`), `web/src/components/ContractMenuPage.tsx` (remove `connect(true/false)` buttons)
- **Owning skill:** `product-sdk-transactions`
- **Recommendation:** **conform.**

### 15. Deps + overrides        [yes]
- **Add:** `@parity/product-sdk`, `-chain-client`, `-contracts`, `-descriptors`, `-cloud-storage`, `-address`, `-utils` (versions aligned to RPS / latest published); bump existing `-host`/`-signer`/`-tx`.
- **Remove (direct):** `@dotdm/cdm`, `@novasamatech/product-sdk`, `@polkadot-api/pjs-signer`, `@polkadot-labs/hdkd*`, `@polkadot-api/substrate-bindings` (confirm zero `web/src` consumers; some used by `web/scripts/` — keep if so).
- **Overrides (required):** `"@polkadot-api/json-rpc-provider": "^0.2.0"` (G1).
- **Owning skill:** _(this process)_

### 1. Bootstrap               [yes — evaluate last]
- **Sub-pattern:** optionally adopt `createApp({ name: 'open-auto-battler', cloudStorage: <env> })` and/or `ProductSDKProvider` from `@parity/product-sdk/react`. Set `cloudStorage` per area 9.
- **Files:** `web/src/main.tsx`, a new `web/src/lib/app.ts`
- **Owning skill:** `product-sdk-app-builder`
- **Recommendation:** **conform.** Optional if the leaf-package wiring is already clean; revisit after areas 2/3/9/10 land.

### 8. App storage             [optional]
- **Sub-pattern:** consolidate `settingsStore`'s direct standalone `localStorage` reads onto `createLocalKvStore()` from `@parity/product-sdk-local-storage`.
- **Files:** `web/src/services/storage.ts`, `web/src/store/settingsStore.ts`
- **Recommendation:** **conform (low priority)** — already mostly compliant via `hostLocalStorage`.

### 5 / 7. Utils / Address      [optional]
- Hand-rolled hex/ABI + `FixedSizeBinary.fromHex(addr.toLowerCase())` H160 handling → `@parity/product-sdk-utils` / `@parity/product-sdk-address`. Largely subsumed by area 10.

### 4, 6, 11, 12, 13. Crypto / Keys / Logger / Statement Store / DotNS   [no]
- No evidence in `web/src` (no `tweetnacl`/`skiff`/custom HKDF; single-player-vs-ghost contract app, no pub/sub multiplayer; DotNS used only at deploy, not resolved in-app). Re-confirm during implementation. Statement Store is a likely **future** item if real-time multiplayer returns.

## Cross-cutting work

### Contract crate + CDM tooling   [yes — re-scaffold]
- **Current:** `contract/Cargo.toml` pins `cargo-pvm-contract` to the unmerged branch `charles/cdm-integration` (macro + builder); `cdm.json`/`.cdm` generated via a patched sibling clone of `contract-dependency-manager` + the private PPN zombienet.
- **Target (mirror RPS):** `pvm-contract-sdk` pinned to a **git rev** (RPS uses `rev = 90f3582…`), `nightly` toolchain pin with `rust-src`, `[package.metadata.cdm] package = "@oab/arena"`, built + deployed via the global **`cdm` CLI** (`cdm build` / `cdm deploy -n paseo` / `cdm install`). Drop the patched sibling + private-PPN dependency.
- **Recommendation:** **re-scaffold** — this is the most fragile prototype layer and the strongest case for adopting the RPS pattern wholesale.

### PAPI 2.x bump + descriptors
- See area 14. `.papi/descriptors/package.json` bumped to the `@parity/product-sdk-descriptors`-aligned version.

### Build / bundler
- Add `define: { 'import.meta.vitest': 'undefined' }` to `web/vite.config.ts` (required — SDK packages embed in-source `import.meta.vitest` blocks). Keep `base: './'`, the wasm/topLevelAwait/react plugins, and the `oab-client` engine-WASM alias.

### Deploy
- Drop the redundant GitHub Pages `.github/workflows/deploy.yml`. Standardize on **`playground deploy`** → Bulletin + DotNS (RPS's flow), or keep `deploy-frontend.yml` (DotNS) but strip its hardcoded fallback dev mnemonic before any production use.

## Cleanup
- [ ] Delete `web/src/contract/index.ts` hand-rolled ABI encoder + `BattleReported` decoder + `DEFAULT_CONFIG_SCALE` hack once the SDK contract path replaces them.
- [ ] Delete `web/.cdm/` `@dotdm/cdm` augmentation; remove `web/src/utils/ipfs.ts` Pinata/gateway glue.
- [ ] Remove the manual HOST/DEV buttons in `ContractMenuPage.tsx`.
- [ ] Reconcile/remove the duplicate endpoint config (`settingsStore` `9944`/`oab-rpc` vs `contractStore` `10020`).
- [ ] Remove now-unused deps (confirm `npm why` / zero `web/src` refs first).
- [ ] Run web lint/format + resolve all unused-import warnings; re-run clean.

## Verification plan
- [ ] `web` typecheck clean (`tsc -b`)
- [ ] `web` lint/format clean
- [ ] vitest: 64/64 (+ new tests for the SDK contract/chain paths)
- [ ] `web` build green (incl. `import.meta.vitest` define)
- [ ] cargo: 164/164 + `cargo check --workspace` clean
- [ ] contract builds via `cdm build`; deploys to paseo via `cdm deploy`; `cdm install` round-trips `cdm.json`
- [ ] **Manual smoke (inside a real host):** connect (auto host detection) → start game → submit turn → game-over → leaderboard/state reads; verify chain access works in-host (not just local WS)

## Recommended ordering
Each phase = an independent, commit-worthy chunk:
1. **Deps + overrides** (area 15) — failure mode contained
2. **PAPI 2.x adapt** (area 14) — mechanical
3. **Address/utils inline** (areas 5/7) — low risk, deletions
4. **Chain access** (area 2) — host-routed client; reconcile endpoints
5. **Signer auto-detection** (area 3) — derive from `isInHost()`
6. **Contracts re-platform** (area 10) — `ContractManager`; depends on 4+5
7. **Cloud Storage** (area 9) — preimage/CloudStorageClient
8. **Bootstrap** (area 1) — `createApp`/provider, evaluate after the above
9. **Contract crate + CDM tooling re-scaffold** (cross-cutting) — can proceed in parallel with frontend on its own branch slice
10. **Deploy switch** (cross-cutting) — drop Pages, standardize on playground/DotNS
11. **Cleanup** + **Final verification**

## Out of scope
- The 13 `npm audit` vulnerabilities (handle in a dedicated security pass; some need breaking changes).
- The master GitHub Pages deploy's pre-existing `CdmContract<never>` failure — resolved naturally once area 10 removes `@dotdm/cdm`.
- Real-time multiplayer / Statement Store (future feature, not present on master).
- Upstream `cargo-pvm-contract` branch merge status — track, don't fix here; pin to a rev like RPS.
