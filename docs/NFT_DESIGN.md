# OAB NFT Design (Scarcity era)

Status: Phase 6, part 2. Collection, items and claim minter are live on
Paseo Asset Hub Next (part 1). The arena contract owns the "OAB Achievements"
collection and mints soulbound badges (part 2, section 9). Frontend
integration is a later step. This document replaces `NFT_SPEC.md` (the `pallet-nfts` design). The
per-slot asset rules (sizes, formats, `card_art` directory layout, theme JSON)
in `NFT_SPEC.md` still apply to the asset files themselves.

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

Achievements are **soulbound badges** (ERC-5192). The arena contract mints them.
Section 9 records the badge decisions.

## 4. Collections

Two collections. The split follows authority, not content type.

| Collection | Content | Owner | Transferable | Claimable with credits |
| --- | --- | --- | --- | --- |
| **OAB Collectibles** (id 29, live) | cosmetics now, card unlocks later | deploy account (EOA) | yes | yes, via `@oab/nft-minter` |
| **OAB Achievements** (id 30, live) | badges | the arena contract | no (soulbound items) | no |

Why two:

- The arena must be the collection owner to mint badges (only the owner
  mints). The owner of a collection can also force-move and burn every token
  in it and write all its metadata. Collectibles that players trade must not
  sit under a game contract's authority, and badges must not sit under an
  operator key that could move them.
- Claim registration is per collection, and the minter runs as the owner. A
  badge collection is never claim-registered, so credits can never mint a
  badge.
- Cosmetics and card unlocks share one collection: both are transferable,
  both come from credits, and the minter table decides which items a credit
  can draw.

The arena creates its collection itself: the admin method `initAchievements()`
calls `ScarcityFactory.createCollection()` from the contract, so the arena is
the owner from the start. A contract caller works: the precompile resolves the
contract's account and holds the deposit from its balance (checked on chain,
section 9). The nominate/claim handover was not needed.

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
| Achievements | in-game | arena contract mints a soulbound badge when a run meets a condition |

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
  `mint_to` for a claim. (Season 0 badges do not use it: the arena mints them
  to derived keys, section 9.)
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
   purse key, not at the player's account. The arena contract cannot tell
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
4. **Badge minting cost.** Resolved for season 0 (section 9): ranked-only,
   one badge per (account, badge, set), about 0.21 PAS per badge from the
   arena's balance. The arena has no withdraw method, so PAS sent to it stays
   there.
5. **Bulletin renewal** for `tokenURI` and assets (section 4).
6. **Weights.** 72 % common / 21 % rare / 7 % epic is a first guess.
7. **Badges per person, not per account?** A person can bind more than one
   account in OAB's personhood context, and each account can earn each badge.
   Keying badges by the personhood alias (like the leaderboard) would make it
   one badge per person. Not done, because the integrator asked for per-account
   badges with the account as the owner.
8. **Badges in the host purse.** Badges sit at arena-derived purse keys, not
   in the player's NftPurse, so the host collectibles app does not list them.
   The game lists them with `getBadges`. If players want badges in their purse,
   the player must give the arena a fresh purse key per badge (a new
   `endGame` argument or a claim method), which needs NftPurse first.

## 9. Achievement badges (arena-minted)

Live since 2026-10-20 on Paseo Asset Hub Next.

| What | Value |
| --- | --- |
| Arena (`@oab/arena` v2, CDM registry `0xc1a73a4f93fde65b1cb1680baead248073566cb0`) | `0xA61f803AeEBFfF2c7568157756932D3944EDCa28` |
| Arena substrate account (holds the deposits) | `5FpXAT5tXb84qrLujsYgtxp6WTC8VrboJMFGFjPcx9GZmn6x` |
| OAB Achievements collection id | **30** |
| Collection ERC-721 address | `0x0000001e00000000000000000000000005200000` |
| Collection owner | the arena (`CollectionCreated` event, `owner()` checked) |
| Collection metadata | `name` = `Open Auto Battler Achievements`, `symbol` = `OABA` |
| Items | 0 = Victory, 1 = Flawless; both `Soulbound` (`ItemDefs` checked) |
| Collection deposit held by the arena | 18 038 700 000 planck (1.80 PAS) |
| Instance deposit per badge | about 2 060 000 000 planck (0.21 PAS), from other live instances |

Transactions:

| Step | Block | Tx hash |
| --- | --- | --- |
| `cdm deploy` arena v2 (metadata `bafk2bzacea5mqpk6bvih4uovhuapu55texttgcjbm5bmpklltbflflrnjgwmi`) | block hash `0x978b58f003f2918da253fc67c4d5b1d70527d9468c5db53a1b71445bb3fc69cc` | |
| `setPersonhoodContext` | 2050284 | `0x06595fa4856600d89221ea0c3880dd451248fad761a4230348e6bbabff4b7908` |
| fund arena 15 PAS (`Balances.transfer_keep_alive` from the deployer) | 2050307 | `0xe81548d5559e5660dd79d02f956e572eb5022fa012ca0aa209962c18d3be3668` |
| `initAchievements()` → 30 | 2050329 | `0xb3693d04b7bf3109badf5ba8608c30fc389374934e24ccca135a1ebc615b45b4` |

A first `cdm deploy` attempt instantiated an arena at `0xdc33…5d78`, but its
Bulletin metadata upload timed out. That instance is unused.

### Decisions

- **Badge types (season 0).** These mirror the pallet-era `VictoryAchievements`
  bits. The pallet gave silver (`wins >= wins_to_victory`) and gold (silver
  and `lives >= starting_lives`) to every card on the final board. Per card
  would mean up to 5 deposits per run, so OAB keeps the two conditions and
  scopes them per set:

  | Badge | Value | Condition at `endGame` | Item |
  | --- | --- | --- | --- |
  | Victory | 0 | ranked run, `wins >= 10` | 0 |
  | Flawless | 1 | ranked run, `wins >= 10` and `lives == 3` (no life lost) | 1 |

  A flawless first victory earns both. The pallet's bronze bit (any won
  battle) is dropped: it is too cheap to earn for a paid NFT.
- **Ranked runs only.** The arena pays a deposit for every badge. Casual play
  is open to unlimited new accounts, and a bot can plant weak ghosts to win
  cheaply. Casual badges would let anyone drain the arena's balance. Ranked
  play needs personhood, so the number of earning accounts is bounded.
- **At most one badge per (account, badge, set).** The arena keeps
  `Vec<BadgeRecord>` per account. With 2 badges and 3 sets, an account holds at
  most 6 badges, so the arena pays at most 6 instance deposits per account.
- **Each badge has its own derived purse key.** Scarcity keeps one NFT per key,
  across **all** collections (`NftsByOwner` in the pallet). Minting to the
  player's own account would work once and then fail for every later badge,
  and it would also fail if the account held any other NFT. So the arena mints
  to

  ```
  purse = keccak256("oab/badge-purse/" ++ arena (20) ++ player (20) ++ badge (u8) ++ set_id (u16 LE))[12..32]
  ```

  Nobody holds that key's private key. That is acceptable for a soulbound
  badge, which never moves. The arena address is in the hash, so a redeployed
  arena never collides with old purses. Anyone can check a badge:
  `ownerOf(token) == purse(player, badge, set)`.
  **Deviation:** the integrator asked for the player's H160 as the recipient.
  The one-NFT-per-key rule makes that unusable after the first badge.
- **The game result comes first.** `endGame` records the leaderboard entry and
  clears the session before it mints. A failed mint (collection not set up, no
  deposit funds, a revert) does not fail `endGame`. The badge is stored with
  `token: None` and a `BadgePending` event. `claimPendingBadges()` retries every
  pending badge of the caller. A badge earned before `initAchievements` is
  claimable after it.
- **Instance metadata.** Each badge has `oab.set` = the set id in decimal, so
  the NFT shows its set without the arena. Items have `oab.badge`
  (`victory` / `flawless`) and `oab.name`.

### Contract surface

| Function | Who | What |
| --- | --- | --- |
| `initAchievements() returns (uint32)` | admin, once | create the collection, set name and symbol, define the badge items. Reverts with `BadgeSetupFailed()` on any failure, so nothing is half set up |
| `getBadgeConfig() returns (bytes)` | anyone | SCALE `BadgeConfig { collection: u32, items: Vec<u32> }`; empty before init |
| `getBadges(address) returns (bytes)` | anyone | SCALE `Vec<BadgeRecord { badge: u8, set_id: u16, block: u64, token: Option<u64> }>` in the order earned |
| `claimPendingBadges() returns (uint32)` | player | retry the caller's pending mints; returns how many minted |

Events (topic 1 = the player address, left-padded):

- `BadgeMinted(address indexed player, uint8 badge, uint16 setId, uint256 tokenId)`
- `BadgePending(address indexed player, uint8 badge, uint16 setId)`

The collection precompile has no owner enumeration for one account
(`tokenOfOwnerByIndex` is per purse key), so `getBadges` is the list.

### Operations

- Fund the arena before `initAchievements` and keep it funded: send PAS to the
  arena's substrate account (the H160 followed by twelve `0xEE` bytes). The
  collection, metadata and two items cost 1.80 PAS. Each badge costs about
  0.21 PAS. 13.2 PAS were free after setup (enough for about 60 badges).
- When the balance runs out, badges go pending. Fund the arena, and players
  call `claimPendingBadges()`.

### Verification

- Native tests (`contract/src/main.rs`, MockHost): a qualifying run mints
  exactly one badge to a derived purse that is not the player's account; a
  flawless run mints two badges to two purses; a repeat run mints nothing; a
  new set or another account earns its own badge; a 9-win run and a casual
  flawless run mint nothing; a failed mint keeps the leaderboard entry and
  finalizes the game, then `claimPendingBadges` mints it once; badges earned
  before setup are claimable after it; `initAchievements` is admin-only,
  runs once, defines soulbound items, and stores nothing if the factory
  reverts.
- On chain (dry-runs against the live arena): the context, config, collection
  owner, name, item metadata and soulbound flags read back as above; a second
  `initAchievements` reverts; `startRankedGame` returns 0 for an account
  without personhood; the exact badge `mint` call, run as the arena account
  against collection 30, succeeds for a fresh derived purse.
- **Not verified on chain:** a full ranked run that mints a badge. A ranked
  run needs an account with personhood bound in OAB's context, and no test
  account has one. The mint path is covered by the native tests and the
  dry-run above.
