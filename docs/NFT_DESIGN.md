# OAB NFT Design (Scarcity era)

Status: collection 29 and the claim minter are live on Paseo Asset Hub Next.
The frontend reads collectible item metadata. Listing owned collectibles waits
for the host NftPurse API (section 7). Achievement badges are on hold: arena
v2 minted them into collection 30, and arena v2 is retired (section 9).
Records will mint badges again (`docs/CONTRACT_ARCHITECTURE.md` section 4.5).
Section 10 has the asset rules for each cosmetic slot.

## 1. Live deployment (Paseo Asset Hub Next)

Checked 2026-10-20. Runtime `next-asset-hub-paseo` spec 3004000, chainId
420420417, eth-rpc `https://eth-rpc-paseo-next.polkadot.io`.

| What | Value |
| --- | --- |
| ScarcityFactory precompile | `0x0000000000000000000000000000000005210000` |
| NftClaimsMinter precompile | `0x0000000000000000000000000000000005220000` |
| OAB Collectibles collection id | **29** |
| Collection ERC-721 address | `0x0000001d00000000000000000000000005200000` |
| Collection owner | `0x704eAd03A0a7c8b06c6EBbde97934AdC24F9f5f7` (cdm `paseo` account `5CUbpNYAePqCdFkS6BWqVF4RDaAcsueW923DrJTnDUXHst7v`) |
| Collection metadata | `name` = `Open Auto Battler Collectibles`, `symbol` = `OAB` |
| Items | 0..8, see section 4 |
| Claim minter (`@oab/nft-minter` v0, CDM registry `0xc1a73a4f93fde65b1cb1680baead248073566cb0`) | `0x0e70985fbab259c08db151754c8bd9e17c4168aa` |
| Claim registration | `collectionMinter(29)` = kind 2 (contract), minter above, owner above |
| Collection deposit held | 78 187 500 000 planck (7.82 PAS) |

Transactions (all `Revive.call` from the owner account into the precompiles):

| Step | Block | Tx hash |
| --- | --- | --- |
| `createCollection()` → 29 | 2049051 | `0xb802103dcc53ce3fd4bd01e8e03a4ad2ee26a8a88b5c831f4bba3b9da1e3491e` |
| `setCollectionMetadata(name)` | 2049083 | `0xd31fe416b21d1227fce8f06e0e822e910e6d78eccb0ce4811e28cb7d047fc8d1` |
| `setCollectionMetadata(symbol)` | 2049101 | `0x70e5fcb0a76d82bed491ac103a9a018c26d9a13b7cb3ca8c8fb60e8b4bc6e353` |
| `defineItem` × 9 (items 0..8) | 2049139 – 2049266 | one per item |
| `cdm deploy` minter (`Revive.Instantiated`) | block hash `0x98e36e3bfe80ec0468d80a85944b5c34f1a1adad10b53085bddd8902b29bd3d6` | |
| `setContractMinter(29, minter)` | 2049662 | `0xca11e57d4230d0c479115a558ce608d4c072dc1ee7f2027caceb0177ac8b3a02` |

Known gap: `cdm deploy` deployed and registered the minter, but its Bulletin
metadata upload failed (`Invalid.Stale`), so the CDM registry entry has no
metadata CID. Nothing on chain needs it (the runtime calls the minter by
address). `cdm install @oab/nft-minter` may fail until a redeploy publishes the
metadata.

## 2. The platform

Scarcity (`indiv-pallet-scarcity` + precompiles, `paritytech/individuality`)
replaces `pallet-nfts`. The facts that shape this design:

- **Anyone can create a collection.** `ScarcityFactory.createCollection()` is
  open to any signed account. It needs no personhood and no governance. The
  only gate is the storage deposit: an unfunded caller reverts with
  `collection owner cannot pay the storage deposit` (checked by `eth_call`
  from `0x1111…1111`).
- **The collection owner is the only minter.** `mint`, `defineItem`, metadata
  writes, `forceTransfer` and `forceBurn` are owner-only. Every write holds a
  deposit from the owner.
- **One NFT per purse key.** A purse key (an address) holds at most one
  instance. A player with 20 items has 20 keys. The host's NftPurse API
  (section 7) manages these keys. `balanceOf` is always 0 or 1.
- **Soulbound is per item, fixed at `defineItem`.** The owner can still
  `forceTransfer` / `forceBurn` a soulbound token.
- **Claims (`indiv-pallet-nft-claims`).** Players earn claim credits in the
  People-chain game (Jollity / DIM2). A credit is a 32-byte hash of one game
  event. The player spends it on Asset Hub with `NftClaims.claim(…, collection,
  mint_to)` and picks the collection. A collection accepts claims only after
  its owner registers it at the NftClaimsMinter precompile:
  - `setRandomMinter(c)`: item = credit mod next item index.
  - `setContractMinter(c, minter)`: the runtime calls
    `minter.mint(uint32 collection, bytes32 credit) returns (uint32 item)` **as
    the collection owner** (the owner pays its storage deposit, up to 1 PGAS,
    under a 5e9 ref-time weight limit), then the pallet mints that item to
    `mint_to` **without a deposit**. The minter only picks the item. It does
    not mint.
  - A registration stops working if the collection changes owner.
- **Previews.** The runtime API `NftClaimsApi.preview_mints` runs the same
  selector path, so a host or frontend can show the item before the claim.

## 3. Decisions

Shawn decided that OAB NFTs cover three kinds: **cosmetics**, **card
ownership**, and **achievements**.

Integrator decision (recorded here for review): **card-ownership NFTs unlock
cards for a future custom "constructed" mode. Ranked arena keeps its fixed card
sets.** Owning a card never changes ranked balance. A player cannot buy power
in the mode that counts.

Achievements are **soulbound badges** (ERC-5192). Arena v2 minted them
(section 9). In the layered design, Records mints them (on hold).

## 4. Collections

Two collections. The split follows authority, not content type.

| Collection | Content | Owner | Transferable | Claimable with credits |
| --- | --- | --- | --- | --- |
| **OAB Collectibles** (id 29, live) | cosmetics now, card unlocks later | deploy account (EOA) | yes | yes, via `@oab/nft-minter` |
| **OAB Achievements** (id 30, stranded) | badges | arena v2 (retired) | no (soulbound items) | no |

Why two:

- The badge contract must be the collection owner to mint badges (only the
  owner mints). The owner of a collection can also force-move and burn every token
  in it and write all its metadata. Collectibles that players trade must not
  sit under a game contract's authority, and badges must not sit under an
  operator key that could move them.
- Claim registration is per collection, and the minter runs as the owner. A
  badge collection is never claim-registered, so credits can never mint a
  badge.
- Cosmetics and card unlocks share one collection: both are transferable,
  both come from credits, and the minter table decides which items a credit
  can draw.

A contract can create its own collection: `ScarcityFactory.createCollection()`
called from a contract makes the contract the owner, and the precompile holds
the deposit from the contract's balance (arena v2 did this for collection 30).

### Items in OAB Collectibles (season 0)

Items are defined from `assets/data/styles.json`. Item-scope metadata (keys ≤
32 bytes, values ≤ 256 bytes):

| Key | Meaning |
| --- | --- |
| `oab.slot` | `board_bg`, `hand_bg`, `card_style`, `avatar`, `card_art`, `theme` (later: `card`) |
| `oab.name` | display name |
| `oab.asset` | `ipfs://<cid>` of the asset (image, `card_art` directory, or theme JSON) |
| `oab.card` | later, card unlocks only: the card id |
| `tokenURI` | not set yet, see below |

| Item | Slot | Name | Tier | Weight /1000 |
| --- | --- | --- | --- | --- |
| 0 | avatar | Cosmic Elf | common | 180 |
| 1 | hand_bg | Cosmic Soil | common | 180 |
| 2 | card_style | Cosmic Vines | common | 180 |
| 3 | board_bg | Cosmic Tree | common | 180 |
| 4 | card_art | Cosmic Cards | rare | 70 |
| 5 | card_art | Kawaii Cards | rare | 70 |
| 6 | card_art | Full Moon Cards | rare | 70 |
| 7 | theme | Cyberpunk | epic | 35 |
| 8 | theme | Pastel | epic | 35 |

### Metadata on Bulletin (`tokenURI`)

`tokenURI()` resolves the reserved key `tokenURI` at instance, then item, then
collection scope. The plan: one ERC-721 metadata JSON per item, stored on
Bulletin, with `tokenURI` = `ipfs://<bulletin cid>` set at **item** scope (one
write per item, shared by every instance):

```json
{
  "name": "Cosmic Tree",
  "description": "Open Auto Battler board background",
  "image": "ipfs://<preview image cid>",
  "attributes": [
    { "trait_type": "slot", "value": "board_bg" },
    { "trait_type": "tier", "value": "common" }
  ],
  "oab": { "slot": "board_bg", "asset": "ipfs://<asset cid>" }
}
```

Not done yet, on purpose:

- Bulletin keeps data for `RetentionPeriod` = 201 600 blocks (about 14 days)
  on Paseo Bulletin Next unless it is renewed. A `tokenURI` that points at
  expired data breaks wallets. So the game reads `oab.*` item metadata on
  chain and never depends on `tokenURI` to render. `tokenURI` is for wallets
  and marketplaces, and it needs a renewal job before it goes live.
- The asset CIDs in `styles.json` are from the earlier IPFS/Pinata upload. They
  must be re-published to Bulletin (and renewed) before production.

The owner can set `tokenURI` at any time with `setItemMetadata`. This emits
ERC-4906 `BatchMetadataUpdate`. It does not affect claims.

## 5. Where each item comes from

| Kind | Source | Mechanism |
| --- | --- | --- |
| Cosmetics | claim credits | player spends a credit on collection 29; `@oab/nft-minter` picks the item |
| Card unlocks | claim credits (planned, not in season 0) | same collection, a later minter adds `card` items to the table |
| Card unlocks (pack variant, idea) | "battle your pack" | `docs/PAI_GOW_VARIANT.md`: open a pack, optionally play it, then it goes to the collection. Needs the collection owner to mint, so it is an arena/owner path, not a credit claim |
| Achievements | in-game | Records mints a soulbound badge when a run meets a condition (on hold) |

Credits are earned in Jollity, not in OAB. OAB does not build a claim UI: the
host collectibles app lists every collection with a registered minter. OAB's
part is to be one of those collections and to show what a player owns.

## 6. The claim minter (`nft-minter/`)

Contract: `nft-minter/src/main.rs`, cargo-pvm-contract rev `d5991131`, 6 KB
PolkaVM blob, no allocator. ABI: one function,
`mint(uint32 collection, bytes32 credit) pure returns (uint32)`.

Selection rule:

```
roll = uint256(credit) % 1000          // big-endian, the full 32 bytes
walk the table in order; return the first item whose cumulative weight > roll
```

This is the Solidity `uint256(credit) % N` convention, so a frontend previews
it with `BigInt(credit) % 1000n` and the table (or calls `preview_mints`).
`collection` is not read.

Rules:

- **Deterministic.** The pick is a pure function of the credit. Credits are
  public and the player picks which credit to spend, so a credit is not secret
  randomness. Each credit has one fixed outcome, which the player can see
  before claiming. That is the intended UX (PRD: "every outcome is
  previewable before committing").
- **Immutable.** No storage, no owner, no setter, no upgrade hook, no
  fallback. Every selector other than `mint` reverts (`UnknownSelector`).
- **No caller check.** The interface does not need one. The runtime calls as
  the collection owner, and a call from anyone else returns the same pure
  answer and writes nothing.
- **New items = new minter.** To change the table (a new season, card
  unlocks), the owner defines the new items, deploys a new minter with the new
  table, and calls `setContractMinter(29, newMinter)`. A minter returns
  explicit item indices, so adding items does not re-map old credits (unlike
  `setRandomMinter`). Never delete an item that the live minter can return,
  or claims that draw it fail.
- **Order of operations.** Define items first, then register the minter.
  The live table was built after the items were defined, and item indices
  0..8 were checked from `defineItem` return values.

Tests (`CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path
nft-minter/Cargo.toml --features std`, from the repo root): runtime calldata
and return decoding byte-for-byte as the Asset Hub Next runtime does it,
determinism, caller independence, the `% 1000` boundary vectors, distribution
within 5σ over 200 000 credits, table integrity, and no other entry point.

On-chain check: `eth_call` and `NftClaimsApi.preview_mints` on collection 29
return items 0, 4, 8, 8, 7 for credits `0x00…00`, `0x00…02d0`, `0x00…03c5`,
`0x80…00`, `0xff…ff`. These are the same as the native test vectors.

## 7. How the frontend reads ownership

**Target: NftPurse host API** (`truapi.nftPurse`, draft, `host-rust-core`
branch `cbh/nft-purses`, not on main). The host keeps one purse per product
and gives the product:

- `list({ collections: [29] })` / `listSubscribe(...)`: instances held in
  OAB's purse (collection + instance ids, chain facts only).
- `requestReceiveAddress({ idempotencyKey })`: a fresh empty key. Use it as
  `mint_to` for a claim.
- `transfer({ instance, to })`: host-signed, feeless move.

For each instance the frontend reads the collection precompile:
`instanceInfo(tokenId)` → `item`, then `itemMetadata(item, "oab.slot" |
"oab.name" | "oab.asset")`. The customize page then offers only owned items.

**Until NftPurse lands:** the collection precompile has no way to list a
player's tokens from one account, because each token sits at its own purse
key. The usable reads are:

- `ownerOf(tokenId)`: always correct; trust this one.
- `balanceOf(addr)` (0 or 1) and `tokenOfOwnerByIndex(addr, 0)`: per purse
  address, only for keys the runtime registered (minted-to keys are).
- `instanceInfo`, `itemMetadata`, `itemSupply`: item lookups.

So the interim frontend must know the purse addresses or token ids, for
example kept in local storage for tokens minted to keys it created. The
current localStorage cosmetics selection keeps working for non-chain modes.

## 8. Open questions

1. **Constructed mode ownership proof.** A card NFT sits at a host-derived
   purse key, not at the player's account. A mode contract cannot tell
   which purse keys belong to a caller. Options: the host attests a purse
   listing; the player moves the card into a contract-held escrow key; or the
   check runs off chain for unranked play. This must be decided before card
   unlocks ship.
2. **Card unlocks from credits in season 0 or later?** Season 0 has only
   cosmetics, because unlocks have no use until constructed mode exists.
3. **Collection owner key.** Collection 29 is owned by the cdm deploy account.
   For production, a multisig or a dedicated key should own it (handover:
   `nominateCollectionOwner` + `claimCollectionOwnership`, then register the
   minter again, because a handover clears the registration).
4. **Bulletin renewal** for `tokenURI` and assets (section 4).
5. **Weights.** 72 % common / 21 % rare / 7 % epic is a first guess.

## 9. Collection 30 (retired with arena v2)

Arena v2 (`0xA61f803AeEBFfF2c7568157756932D3944EDCa28`) created and owns
collection 30 "Open Auto Battler Achievements" (`OABA`, ERC-721 address
`0x0000001e00000000000000000000000005200000`), with items 0 = Victory and
1 = Flawless, both soulbound. Arena v2 has no owner handover and no
withdraw, so the collection and the PAS on the arena account are stranded.
Badges already minted stay valid. Records needs a new collection.

Lessons for Records, from the arena v2 build (2026-10-20):

- Scarcity keeps one NFT per key across all collections. Minting every badge
  to the player's account fails after the first one. Arena v2 minted each
  badge to a derived key:
  `keccak256("oab/badge-purse/" ++ arena ++ player ++ badge ++ set_id LE)[12..32]`.
- The game result must come first. A failed mint must not fail `endGame`;
  keep the badge pending and let the player retry.
- Each badge costs the collection owner about 0.21 PAS of deposit. Badges for
  casual play let anyone drain the owner, so arena v2 gave badges only to
  ranked (personhood) runs, at most one per (account, badge, set).

## 10. Asset rules per slot

These rules come from the earlier `pallet-nfts` design and still apply to the
asset files. On Scarcity, the item key `oab.asset` holds the asset CID (the old
`image` field).

### Board Background (`board_bg`)

Applied as the background image of the Arena component.

| Property | Value |
|----------|-------|
| Aspect Ratio | 16:9 |
| Recommended Size | 1920x1080 |
| Min Size | 960x540 |
| Format | PNG/WebP |
| Alpha | No |
| Max File Size | 2 MB |

### Hand Background (`hand_bg`)

Applied as the background image of the Shop/Hand component.

| Property | Value |
|----------|-------|
| Aspect Ratio | 5:1 |
| Recommended Size | 1920x384 |
| Min Size | 960x192 |
| Format | PNG/WebP |
| Alpha | Optional |
| Max File Size | 1 MB |

### Card Style Frame (`card_style`)

Overlay PNG frame rendered on top of card content. Must have a transparent center with decorative border/frame only.

| Property | Value |
|----------|-------|
| Aspect Ratio | 3:4 |
| Recommended Size | 256x352 |
| Min Size | 128x176 |
| Format | PNG (required) |
| Alpha | Required (frame overlay) |
| Max File Size | 500 KB |

### Player Avatar (`avatar`)

Circular avatar displayed in the GameTopBar next to the Lives section.

| Property | Value |
|----------|-------|
| Aspect Ratio | 1:1 |
| Recommended Size | 256x256 |
| Min Size | 64x64 |
| Format | PNG/WebP |
| Alpha | Optional |
| Max File Size | 500 KB |

### Card Art Set (`card_art`)

A complete set of card illustrations. The `image` field points to an IPFS directory CID containing WebP images for every card in the set. The UI resolves individual card images by appending the size and card ID to the directory path.

| Property | Value |
|----------|-------|
| IPFS Structure | Directory with `sm/` and `md/` subdirectories |
| Small Size | 256x340 per card (`sm/{cardId}.webp`) |
| Medium Size | 464x616 per card (`md/{cardId}.webp`) |
| Format | WebP |
| Fallback | Emoji (when no set selected or image fails to load) |

**IPFS Directory Layout:**

```
<directory CID>/
  sm/0.webp
  sm/1.webp
  ...
  md/0.webp
  md/1.webp
  ...
```

Art is uploaded as a complete set (one directory per set) rather than per-card. Use `ipfs add -r` or Pinata directory upload to get a single directory CID.

### Theme (`theme`)

A complete UI theme definition. The `image` field points to an IPFS CID containing a `ThemeDefinition` JSON file. The frontend fetches this JSON, validates it via `sanitizeTheme()`, merges with warm defaults via `resolveTheme()`, and applies it as CSS custom properties.

| Property | Value |
|----------|-------|
| IPFS Content | ThemeDefinition JSON |
| Format | JSON (UTF-8) |
| Max File Size | 20 KB |
| Fallback | Warm theme (all unspecified fields inherit from warm) |

**Theme JSON Structure:**
