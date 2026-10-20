# Open Auto Battler — Beta Release Plan

Current roadmap. Checked 2026-10-20 against branch `update/oct-2026`.

The pallet-era plan that this file held before (holographic `VictoryAchievements`, tournaments, creator hub) is in git history. The pallet runtime was removed on 2026-05-05; see "Pallet-era features not carried over" below.

## What is the Beta?

**A polished, playable game.** You pick a set, draft cards from a random bag, build a board in the shop phase, then watch your team auto-battle against ghost opponents. Win 10 rounds before you lose 3 lives to achieve victory. The whole loop works end-to-end on mobile and desktop inside a Polkadot host (Polkadot Desktop, Polkadot Mobile, dot.li).

**A reason to keep playing.** Ranked runs need proof of personhood and go on a per-set leaderboard. A 10-win ranked run earns a soulbound Victory badge; a run with no life lost also earns Flawless.

**A showcase for Polkadot.** The game runs in a PolkaVM smart contract on Asset Hub. Players sign once and then play without prompts, with fees paid in PGAS. NFTs are cosmetic (board background, hand, card border, avatar, card art, theme) and never pay-to-win.

---

## Technical Detail

## Current State Summary

| Layer | Status | Details |
|-------|--------|---------|
| **Engine** | Done for beta | `battle/`, `game/`, `assets/`: battle and shop triggers, permanent stat modifiers, targeting, conditions, deterministic RNG. The status system was removed. |
| **Contract** | Live (arena v2) | `@oab/arena` `0xA61f803AeEBFfF2c7568157756932D3944EDCa28` on Paseo Asset Hub Next: casual and ranked games, ghost opponents, top-100 leaderboard per set, achievement badges (collection 30). |
| **NFT minter** | Live | `@oab/nft-minter` picks the item for Scarcity credit claims into collection 29 (9 cosmetics). See `docs/NFT_DESIGN.md`. |
| **Frontend** | Deployed | React 18.3, polkadot-api 3.2.2, product-sdk 0.38. Ranked entry, personhood bind, leaderboard, badges. Live at https://oab-arena.paseo.li against arena v2 (root CID `bafybeiai6gdctaogaxj5av6lpzlcgw35aroaep6jdac5xmmnxw7rriisc4`). |
| **Content** | 111 cards, 3 sets | Foundations of War (set 0, the only set the arena page offers), The Hollow Swarm, Fortune's Reckoning. |

## Done (October 2026 update)

Integration branch `update/oct-2026`:

1. **Contract port and redeploy.** Ported to `cargo-pvm-contract` rev `d5991131` (polkavm 0.35). Game seeds come from block entropy, not a caller nonce. Redeployed `@oab/arena` to Paseo Asset Hub Next with `cdm`.
2. **PAPI 3, product-sdk, `.paseo`.** Frontend on polkadot-api 3.2.2 and the product-sdk 0.38 family. The contract client uses `@parity/product-sdk-contracts` `createContract` with `web/cdm.json` (the old `@dotdm/cdm` client is gone). Product ID `oab-arena.paseo`. No public IPFS gateway URLs inside a host.
3. **Bulletin deploy.** `npm run deploy` (bulletin-deploy 0.22.0) and `.github/workflows/deploy-frontend.yml` with the `DOTNS_MNEMONIC` secret. The GitHub Pages deploy is gone.
4. **Sponsored play.** `web/src/contract/session.ts`: a PGAS allowance and a proxy session key; one approval, then no prompts. Falls back to product-account signing. Checked end to end by `web/scripts/e2e-session.mjs`.
5. **Ranked mode and leaderboard.** `startRankedGame` accepts personhood Lite or Full, keyed by the personhood alias in OAB's context. Top-100 board per set. The frontend binds the product account to the alias (`web/src/contract/personhood.ts`).
6. **NFT minter and badges.** Collection 29 (cosmetics) with the deterministic claim minter. Arena v2 mints soulbound Victory and Flawless badges into collection 30 on ranked `endGame`, with `claimPendingBadges` for failed mints.
7. **Frontend integration.** Ranked panel, personhood bind, leaderboard and badges pages, SCALE decoders with shared fixtures, a cosmetics ownership adapter, and the read-only live check `web/scripts/check-ranked-reads.mjs`.
8. **Docs.** This rewrite (Phase 7).

## Open Items

- **Ranked play is blocked.** The personhood app `peopl.paseo` must allowlist `oab-arena.paseo` in its manifest. Until then the host answers `NotAllowlisted` to the bind, so players cannot bind an account and ranked play is closed in practice.
- **Cosmetics ownership.** Listing owned collectibles needs the host NftPurse API, which exists only on `host-rust-core` branch `cbh/nft-purses`. `web/src/services/nftOwnership.ts` is a disabled stub; the customize pages show the defaults.
- **product-sdk 0.39.** Bump after 2026-10-22 (the npm release-age guard blocks it before then).
- **Sponsored-play scale.** Proxy sessions pay each call through a thin DOT↔PGAS pool. Registry sessions are the scalable path but need a contract change.
- **Badge recipients.** Scarcity holds one NFT per key, so each badge goes to its own derived keyless key. Badges do not show in the player's host purse.
- **Badges per account, not per person.** A person with more than one bound account can earn each badge once per account. See `docs/NFT_DESIGN.md` section 8.
- **Render layer (decision pending).** The board is React DOM today. Research advised against a full Unity or Godot migration: hosts allow no Web Workers, only own-origin network, and WebGL2; Bulletin limits bundle size; signing is JS-only; and the Rust engine is shared with the contract. The direction under discussion: move the board (shop and battle) to a WebGL renderer (PixiJS or Phaser) behind an event-driven presentation "director", and keep React for menus. A spike comparing PixiJS and Godot web is proposed. Nothing is decided.
- **Known-broken script.** `web/scripts/test-query.ts` imports the removed `@dotdm/cdm`. Delete or port it.

## Pallet-era Features Not Carried Over

These existed in the old pallet and frontend. The contract and the current frontend do not have them:

- Tournaments with entry fees and prize pools (the leaderboard and badges replace them for now)
- Holographic card unlocks from `VictoryAchievements`
- Creator hub (user-made cards and sets; `registerCard` / `registerSet` are admin-only)
- P2P versus, offline practice, card sandbox, ghost browser, history pages

Open question: bring tournaments back in the contract, or keep leaderboard plus badges?

## Next Steps

1. Get `oab-arena.paseo` allowlisted by `peopl.paseo`, then test ranked play, the bind, and badges end to end in a host.
2. Deploy the current frontend to `oab-arena.paseo`.
3. Bump to product-sdk 0.39 (after 2026-10-22).
4. Wire cosmetics ownership to NftPurse when it reaches host-rust-core main.
5. Decide the render layer; run the PixiJS vs Godot web spike first.
6. Design registry sessions (contract change) if sponsored play outgrows the pool.
7. Content: review the pallet-era content goals (balance pass on set 0, more style sets; see this file's git history). Their current status was not checked in this rewrite.
