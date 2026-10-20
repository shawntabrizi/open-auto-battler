# OAB Contract Architecture (layered contracts)

Status: **design; M1, M2, and M3 (casual Arena) implemented** (engine
crate, `@oab/engine`, `@oab/content`, `@oab/identity`, `@oab/arena` version
4, deployed on Paseo Next 2026-10-20; see
[M1 status](#m1-status-2026-10-20), [M2 status](#m2-status-2026-10-20), and
[M3 status](#m3-status-2026-10-20)).
Written 2026-10-20 against branch `update/oct-2026` at `6569b91`. Shawn
approved the direction (five contracts). This document makes it concrete.

All statements about current code cite a file. The code is the truth. If this
document and the code disagree, the code wins and this document is stale.

Tool versions checked on 2026-10-20:

- `cargo-pvm-contract`: `origin/main` is `d5991131`, the same rev the arena
  pins (`contract/Cargo.toml`). No newer SDK features exist on `main`.
- `contract-dependency-manager` (CDM): `origin/main` is `5ecde00`.
- Registry-session reference: `gaming-retreat-2026` `origin/main`,
  `.claude/skills/session-autosigning/references/`.
- Own-purse pattern: `paritytech/top-trumps` `main` at `4bf2295`.

## Contents

1. [Summary](#1-summary)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [The current system](#3-the-current-system)
4. [The five contracts](#4-the-five-contracts)
5. [Shared crates](#5-shared-crates)
6. [Who may call what](#6-who-may-call-what)
7. [Call flows](#7-call-flows)
8. [Hot-path cost](#8-hot-path-cost)
9. [Trust boundaries and failure modes](#9-trust-boundaries-and-failure-modes)
10. [Versioning and upgrades](#10-versioning-and-upgrades)
11. [Wiring and the frontend](#11-wiring-and-the-frontend)
12. [Governance](#12-governance)
13. [Migration from arena v2](#13-migration-from-arena-v2)
14. [Build plan](#14-build-plan)
15. [Where the direction meets the tooling](#15-where-the-direction-meets-the-tooling)
16. [Open questions](#16-open-questions)

---

## 1. Summary

Today one contract (`@oab/arena` v2, `contract/src/main.rs`) does everything:
card storage, casual games, ranked games, ghost pools, the personhood gate,
leaderboards, and badge NFTs. We split it into five layers:

```
                 ┌──────────────────────────────────────────────┐
  player ───────►│ Mode contracts (one per mode)                │
  (session key   │  Arena (casual) · Ranked · later: Pai Gow,   │
   or direct)    │  Constructed, Tournament                     │
                 │  own: games, ghost pools, set cache          │
                 │  link: oab-engine crate (no sub-call)        │
                 └──┬───────────────┬───────────────┬───────────┘
                    │ resolve       │ set bundle    │ report facts
                    ▼ (every call)  ▼ (once/set)    ▼ (end of run)
             ┌────────────┐  ┌────────────┐  ┌──────────────────┐
             │ Identity   │  │ Content    │  │ Records          │
             │ sessions,  │  │ cards,     │  │ leaderboards,    │
             │ personhood │  │ sets       │  │ achievements,    │
             └─────┬──────┘  │ (immutable │  │ badge collection,│
                   │         │  once      │  │ treasury         │
                   ▼         │  published)│  └────────┬─────────┘
          personhood         └────────────┘           ▼
          precompile 0x0A01                  Scarcity precompiles

             ┌───────────────────────────────────────────┐
             │ Engine contract (one per engine version)  │
             │ pure, no storage; for third parties and   │
             │ verification. Not on the game hot path.   │
             └───────────────────────────────────────────┘
```

The key rules:

- **The engine is a Rust crate first.** Modes link it. The engine contract is
  the same crate, deployed for others to call.
- **Content is immutable once published.** A mode copies a set into its own
  storage once. Turns never call Content.
- **Identity is the only sub-call on every game call.** It resolves a session
  key to the player.
- **Modes report facts. Records applies rules.** Records survives mode and
  engine upgrades.
- **Addresses come from the CDM registry at deploy time,** not on the hot path.

## 2. Goals and non-goals

### Goals

1. One meaning per achievement. "Flawless" means the same thing in every mode.
2. Leaderboards, badges, and the badge collection survive a new engine or a
   new mode.
3. A new engine version never breaks a game in flight. The game finishes on
   the engine it started with.
4. A client can replay any battle from chain data and the matching engine
   build.
5. Sign once, then play with no prompt and no native fee (registry sessions
   on the `ChargePGAS` path). This replaces the proxy-session pool cost.
   M2 measured it: the fee is not zero, it is burned in PGAS, and only a v5
   general transaction on extension pipeline V1 can pay it (M2 status).
6. Ranked identity is the personhood alias. One person has one ranked
   identity.
7. New modes (Pai Gow, Constructed, Tournament) plug in without a change to
   Identity, Content, or Records code.
8. The game hot path (`submitTurn`) costs no more than today. Section 8 shows
   the expected numbers. We measure after implementation.

### Non-goals

- No implementation in this document.
- No change to the battle rules or card balance.
- No mainnet launch plan. Mainnet governance is listed, not designed.
- No user-created cards now. Content has an extension point only.
- No state migration from arena v2. Testnet state reset is accepted
  (section 13 lists what is lost).
- No new render layer or frontend redesign.

## 3. The current system

### 3.1 Arena v2 (`contract/src/main.rs`)

One `pvm-contract-sdk` contract, 2 405 lines with tests. Live at
`0xA61f803AeEBFfF2c7568157756932D3944EDCa28`, CDM `@oab/arena` version 2
(`contract/cdm.json`). Build blob about 112 KB (`contract/README.md`).

| Concern | Where in `contract/src/main.rs` |
| --- | --- |
| Game config (copy of `oab_game::GameConfig`) | `GameConfig`, `default_config` lines 29–58 |
| Game state | `ArenaSession` lines 60–74 (the `LocalGameState` fields plus `set_id`) |
| Storage model | SCALE blobs at `keccak256(domain ++ key)`, domains `DOM_*` lines 265–282, helpers lines 409–451 |
| Cards and sets | `register_card` 797–811, `register_set` 814–828, admin only, no overwrite |
| Card pool per call | `build_card_pool_from_storage` 738–746: one storage read **per card** |
| Seeds | `block_entropy` 764–786, `derive_seed` 748–756 (keyed by `msg.sender`) |
| Start | `start_session` 859–899 (bag, hand draw, shop-start triggers) |
| Turn | `submit_turn` 904–1079: verify, pick ghost, push ghost, battle, deltas, next shop, event |
| Ghost pools | `push_ghost` 686–704, `select_ghost` 706–736, 10 boards per bracket (line 77) |
| Bracket key | `bracket_bytes(set, round, wins, lives)` 290–298: **no casual/ranked flag** |
| Personhood | `abi_import!` of `IPersonhood` 96–109, `personhood_status` 503–513 (fails closed), `ranked_identity` 517–525 |
| Leaderboard | `LeaderboardEntry` 113–121, `insert_ranked` 133–150, top 100 per set, `record_ranked_result` 547–569 |
| Badges | `BadgeConfig`/`BadgeRecord` 214–228, `badge_purse` 587–601, `mint_badge` 606–625, `award_badges` 649–675, `init_achievements` 1140–1180, `claim_pending_badges` 1202–1221 |
| Battle event | `BATTLE_REPORTED_TOPIC` 285, packed bytes emitted at 1061–1076 |

Facts that shape the design:

- **Casual and ranked share ghost pools.** The bracket key has no mode flag
  (lines 290–298). A free casual account can plant weak ghosts that ranked
  players then meet.
- **The contract copies engine code.** `GameConfig` (lines 29–58) copies
  `game/src/lib.rs:31`. `create_starting_bag` (302–326) copies
  `game/src/sealed.rs:27`. `draw_hand` (328–350) copies `GameState::draw_hand`
  and `derive_hand_indices_logic` (`game/src/state.rs:208`, `:252`). The turn
  pipeline in `submit_turn` is not in any crate.
- **`make_shop_state` hard-codes `set_id: 0`** (line 358). The engine does not
  read it today, but it is wrong data.
- **The arena has no withdraw** and no Scarcity owner handover. Collection 30
  cannot leave arena v2 (`docs/NFT_DESIGN.md` §8 item 4, §9).
- **Seeds use `msg.sender`.** With registry sessions, `msg.sender` is the
  session key. The new modes must seed from the resolved player.

### 3.2 Engine crates

Real entry points (all `no_std`, SCALE types):

| Item | Signature / location |
| --- | --- |
| Turn validation | `pub fn verify_and_apply_turn(state: &mut ShopState, action: &CommitTurnAction) -> GameResult<()>` — `battle/src/commit.rs:406` |
| Shop start | `pub fn apply_shop_start_triggers(state: &mut ShopState)` — `battle/src/commit.rs:37` |
| Shop start after battle | `pub fn apply_shop_start_triggers_with_result(state: &mut ShopState, previous_battle_result: Option<BattleResult>)` — `battle/src/commit.rs:45` |
| Battle | `pub fn resolve_battle<R: BattleRng>(player_units: Vec<CombatUnit>, enemy_units: Vec<CombatUnit>, rng: &mut R, card_pool: &BTreeMap<CardId, UnitCard>, board_size: usize) -> Vec<CombatEvent>` — `battle/src/battle.rs:381` |
| Mana from battle | `pub fn player_shop_mana_delta_from_events(events: &[CombatEvent]) -> i16` — `battle/src/battle.rs:517` |
| Permanent stats | `pub fn player_permanent_stat_deltas_from_events(events: &[CombatEvent]) -> BTreeMap<UnitId, (StatValue, StatValue)>` — `battle/src/battle.rs:550` |
| Combat unit | `CombatUnit::from_card(card: UnitCard) -> Self` — `battle/src/battle.rs:235` |
| RNG | `XorShiftRng::seed_from_u64(seed: u64)` — `battle/src/rng.rs:44` |
| Starting bag | `pub fn create_starting_bag(set: &CardSet, seed: u64, bag_size: usize) -> Vec<CardId>` — `game/src/sealed.rs:27` |
| Hand draw | `GameState::draw_hand(&mut self, hand_size: usize)` — `game/src/state.rs:208` |
| Constructed deck check | `pub fn validate_deck(deck: &[u16], set: &CardSet, max_copies_per_card: usize, bag_size: usize) -> Result<(), String>` — `game/src/constructed.rs:39` |

Types: `CardSet { cards: Vec<CardSetEntry> }` (`battle/src/state.rs:29`),
`CardSetEntry { card_id: CardId, rarity: u8 }` (`:21`), `ShopState`
(`:42`), `UnitCard` (`battle/src/types.rs:514`), `BoardUnit` (`:571`),
`CommitTurnAction { actions: Vec<TurnAction> }` (`:623`), `GhostBoardUnit
{ card_id, perm_attack, perm_health }` (`:638`), `MatchmakingBracket`
(`:650`), `BattleResult` and `CombatEvent` (`battle/src/battle.rs:91`,
`:101`), `GameConfig` (`game/src/lib.rs:31`), `GamePhase`, `LocalGameState`,
`GameSession { state, set_id, config }` (`game/src/state.rs:24`, `:36`, `:64`).

Numbers measured on 2026-10-20 (SCALE, from `oab-assets`):

| Set | Cards | `CardSet` bytes | Card pool bytes |
| --- | --- | --- | --- |
| 0 Foundations of War | 49 | 148 | 1 531 |
| 1 The Hollow Swarm | 68 | 206 | 1 967 |
| 2 Fortune's Reckoning | 70 | 212 | 2 169 |

All 111 cards are 3 317 bytes. The largest card is 48 bytes.

### 3.3 The client

- `web/src/contract/index.ts` binds the arena from the inline address and ABI
  in `web/cdm.json` (lines 268–273, 439–446). It does no registry lookup at
  run time.
- `getGameState` appends a hard-coded `GameConfig` (`[3,10,3,10,0,5,5,50]`) to
  the `ArenaSession` bytes, because the WASM engine expects a `GameSession`
  (`index.ts` lines 581–586).
- Replay: `submitTurnOnChain` captures the **local** board before it submits
  (`web/src/store/contractStore.ts`), reads `battleSeed` and the opponent board
  from `BattleReported` (`index.ts` 832–885), then calls
  `engine.resolve_battle_p2p(playerBoard, opponentBoard, seed)`
  (`client/src/engine.rs:765`). That function rebuilds combat units itself. It
  copies the contract code (`contract/src/main.rs` 933–950, 723–733). The
  player board is not in the event, so a third party cannot replay a battle
  from chain data alone.
- Sponsored play uses **proxy sessions** (`web/src/contract/session.ts`).
  `Proxy.proxy` is outside the `ChargePGAS` filter, so every call pays a fee in
  PGAS through the thin DOT↔PGAS pool (`session.ts` header,
  `BETA_RELEASE_PLAN.md` "Sponsored-play scale").
- Personhood: the product account at derivation index 0 binds to an alias in
  OAB's context (`web/src/contract/personhood.ts`).

## 4. The five contracts

Conventions for all five:

- Built with `pvm-contract-sdk` at the pinned rev. Methods are `camelCase` in
  the ABI.
- Game data stays SCALE inside ABI `bytes`, as today
  (`contract/README.md` "Storage model"). Simple scalar config uses typed
  ABI arguments.
- Storage stays SCALE blobs at `keccak256(domain ++ key)` for game data.
  Fixed-size maps (addresses, config) may use the SDK `Mapping`/`Lazy`.
- Errors are typed (`#[derive(SolError)]`) instead of `0`/`false` returns.
  The reference registry does this
  (`gaming-retreat-2026` `reference-contract.md`).
- Events are `#[derive(SolEvent)]` with the player or alias as an indexed
  topic. Large game payloads stay one SCALE `bytes` field.
- No contract opts in to reentry. pallet-revive denies reentry by default
  (`cargo-pvm-contract` `crates/pvm-contract-core/src/call.rs`, doc on
  `CallBuilder`). No flow below needs a callback.

### 4.1 Engine

**Job:** turn `(state, action, opponent, seeds, content)` into
`(new state, events)`. Pure. No storage. No host calls except the input and
the return.

**Two forms, one source:**

1. **Crate `oab-engine`** (new, thin facade over `oab-battle` + `oab-game`).
   Modes link it. The WASM client links it. No sub-call on the hot path.
2. **Contract `@oab/engine`**, one deployment per engine version. It wraps the
   same crate. Third parties, tools, and auditors call it to check a result
   on chain. Modes never call it.

**Crate API (Rust):**

```rust
// engine/src/lib.rs  (new crate `oab-engine`)
pub const ENGINE_VERSION: u32 = 1;             // bump on any behavior change
pub const ENGINE_VECTORS_HASH: [u8; 32] = ...; // hash of golden-vector outputs, checked in

/// Everything one game needs from Content, resolved and pinned.
pub struct SetBundle {               // SCALE
    pub set_id: SetIdValue,
    pub set: CardSet,
    pub cards: Vec<UnitCard>,        // every card the set references
}
impl SetBundle {
    pub fn hash(&self) -> [u8; 32];  // keccak256(SCALE(self)); pins content
    pub fn card_pool(&self) -> BTreeMap<CardId, UnitCard>;
}

pub fn new_game(config: &GameConfig, bundle: &SetBundle, seed: u64) -> LocalGameState;

pub struct TurnInput<'a> {
    pub config: &'a GameConfig,
    pub pool: &'a BTreeMap<CardId, UnitCard>,
    pub state: LocalGameState,       // phase must be Shop
    pub action: CommitTurnAction,
    pub opponent: Vec<GhostBoardUnit>,
    pub battle_seed: u64,
    pub next_shop_seed: u64,
}
pub struct TurnOutput {              // SCALE
    pub state: LocalGameState,       // next Shop, or Completed
    pub result: BattleResult,
    pub player_board: Vec<GhostBoardUnit>, // board that fought (for replay + ghost)
    pub events: Vec<CombatEvent>,    // contracts may drop this; replay recomputes it
}
pub fn resolve_turn(input: TurnInput) -> Result<TurnOutput, GameError>;

pub fn board_to_units(board: &[Option<BoardUnit>], pool: &BTreeMap<CardId, UnitCard>) -> Vec<CombatUnit>;
pub fn ghost_to_units(ghost: &[GhostBoardUnit], pool: &BTreeMap<CardId, UnitCard>) -> Vec<CombatUnit>;
pub fn replay_battle(player: &[GhostBoardUnit], opponent: &[GhostBoardUnit],
                     seed: u64, pool: &BTreeMap<CardId, UnitCard>, board_size: usize) -> Vec<CombatEvent>;
```

`resolve_turn` is the body of today's `submit_turn` without storage, ghost
choice, or seed derivation (`contract/src/main.rs` 927–1057). `new_game` is
`start_session` without storage (859–899). The copies in the contract
(section 3.1) go away. The client's `resolve_battle_p2p` calls
`replay_battle`, so the client and the chain run the same unit setup.

Seeds and ghost choice stay in the mode. They are mode policy, not engine
rules.

**Contract ABI (`@oab/engine`, all `pure`):**

```solidity
function engineVersion() external pure returns (uint32);
function vectorsHash() external pure returns (bytes32);
// SCALE (GameConfig, SetBundle, u64 seed) -> SCALE LocalGameState
function newGame(bytes calldata input) external pure returns (bytes memory);
// SCALE (GameConfig, SetBundle, LocalGameState, CommitTurnAction,
//        Vec<GhostBoardUnit>, u64 battleSeed, u64 nextShopSeed) -> SCALE TurnOutput
function resolveTurn(bytes calldata input) external pure returns (bytes memory);
// SCALE (Vec<GhostBoardUnit> player, Vec<GhostBoardUnit> opponent, u64 seed,
//        SetBundle, u8 boardSize) -> SCALE Vec<CombatEvent>
function replayBattle(bytes calldata input) external pure returns (bytes memory);
```

No constructor arguments, no admin, no storage, no fallback (the
`nft-minter/src/main.rs` pattern). The caller passes the content, so the
engine contract never calls Content.

**Version identity.** One number, two checks:

- `ENGINE_VERSION: u32` is the identity. Modes store it in every game, put it
  in every event and every fact, and the frontend uses it to pick the WASM
  build.
- A golden-vector test (a fixed corpus of starts and turns over sets 0–2)
  hashes all outputs. The hash must equal `ENGINE_VECTORS_HASH`. If the
  behavior changes, the test fails until the author bumps `ENGINE_VERSION`
  and updates the hash. A comment-only change keeps the hash, so it needs no
  bump.
- The engine contract returns both values. A check script compares them with
  the crate and with each mode's `engineVersion()`.

We do not use a hash of the source files as the identity. It changes on
every comment edit and gives no meaning to a client.

### 4.2 Content registry (`@oab/content`)

**Job:** hold cards and sets. A published card or set never changes.

**Storage:**

| Domain | Key | Value |
| --- | --- | --- |
| `ADMIN` | () | admin address |
| `CURATOR` | address | `bool` |
| `CARD` | `card_id: u16` | SCALE `UnitCard` |
| `CARD_META` | `card_id` | SCALE `CardMeta { publisher: [u8;20], block: u64, origin: CardOrigin }` |
| `SET` | `set_id: u16` | SCALE `SetRecord { set: CardSet, hash: [u8;32], name: String, publisher, block }` |
| `NEXT_SET` | () | `u16` |

`CardOrigin` is `Curated` now. `Community { creator: [u8;20] }` is the
extension point for user-made cards (the pallet era had a creator hub,
`BETA_RELEASE_PLAN.md` "Pallet-era features"). Community cards would use a
separate id range (proposal: `0x8000..`), and modes decide whether they
accept a set that holds them.

**ABI:**

```solidity
// Curator. Reverts CardExists if the id is taken. Card bytes = SCALE UnitCard.
function publishCard(bytes calldata card) external;
// Curator. Every card must exist. Assigns the next set id. Returns (id, hash).
function publishSet(string calldata name, bytes calldata cardSet) external returns (uint16 setId, bytes32 setHash);
// Admin.
function setCurator(address who, bool allowed) external;

// Views.
function getCard(uint16 cardId) external view returns (bytes memory);        // SCALE UnitCard or empty
function getSet(uint16 setId) external view returns (bytes memory);          // SCALE CardSet or empty
function getSetBundle(uint16 setId) external view returns (bytes memory);    // SCALE SetBundle or empty
function setHash(uint16 setId) external view returns (bytes32);              // zero if absent
function setCount() external view returns (uint16);
```

**Events:** `CardPublished(uint16 indexed cardId, address publisher)`,
`SetPublished(uint16 indexed setId, bytes32 setHash, address publisher)`,
`CuratorSet(address indexed who, bool allowed)`.

`getSetBundle` is at most about 2.4 KB for today's sets (section 3.2), well
under the 16 KB read buffer the arena uses (`contract/src/main.rs:419`).

> **M1 correction.** pallet-revive stores at most **416 bytes per storage
> item** (`pallet_revive::limits::STORAGE_BYTES`, checked in pallet-revive
> 0.19.1 and polkadot-sdk master of 2026-09-30). A 2.4 KB bundle cannot be one
> item. Content stores each card, each house ghost, and the `CardSet` as
> separate items, and `getSetBundle` assembles the bundle. The `SET` row above
> became `SET` (`SetRecord` without the set) plus `SET_CARDS`, `GHOST`, and
> `GHOST_COUNT`. See the M1 status in section 14.

**Pinning.** A game stores `(engine_version, set_id, set_hash)`. Because a set
never changes, a mode may copy the bundle once and trust the copy. The hash
lets anyone check the copy against Content.

**Retiring a set** is mode policy (each mode has an allow list). Content
never deletes.

### 4.3 Identity and sessions (`@oab/identity`)

**Job:** answer two questions for every mode:

1. Which player does `msg.sender` act for? (session key → owner)
2. Is this player eligible for ranked play, and what is their alias?

Identity embeds the session registry. It is the reference registry
(`reference-contract.md`) plus expiry, burned keys, and personhood.

> **As built in M2** (`identity/README.md`, [M2 status](#m2-status-2026-10-20)).
> The storage, ABI, and lifecycle below are the design. The deployed contract
> differs: the session key must **accept** (`acceptSession(owner)`) before it
> binds; `resolve(account)` returns only the player and **reverts**
> `InvalidSession(account)` for an expired or revoked key; expiry is unix
> seconds; storage is two 32-byte records (`KEY[session]`, `OWNER[player]`);
> personhood is a stub (`rankedIdentity` answers "not eligible").

**Storage:**

| Field | Type |
| --- | --- |
| `admin` | `Lazy<Address>` |
| `session_of` | `Mapping<Address, Address>` (owner → session) |
| `owner_of` | `Mapping<Address, Address>` (session → owner) |
| `expires_at` | `Mapping<Address, u64>` (session → block) |
| `burned` | `Mapping<Address, bool>` (a key that was ever revoked or replaced) |
| `context` | `Lazy<[u8;32]>` personhood context |
| `accepted_tiers` | `Lazy<u8>` bitmask, bit 1 = Lite, bit 2 = Full |
| `max_ttl` | `Lazy<u64>` blocks |

**ABI:**

```solidity
// Owner only (a session key may not register a session). Revokes and burns any
// previous session of the caller. Reverts InvalidSessionKey, SessionKeyInUse,
// SessionKeyBurned, TtlTooLong.
function registerSession(address session, uint64 expiresAt) external;
// Owner only. Revokes and burns the caller's session.
function revokeSession() external;

// Hot path. kind: 0 = Direct (not a session key), 1 = Session (live),
// 2 = Invalid (expired, revoked, or burned). player = owner for kind 1,
// account for kind 0, zero for kind 2.
function resolve(address account) external view returns (address player, uint8 kind);

// Resolve, then ask the personhood precompile for the player in the configured
// context. tier = raw status; alias = zero unless the tier is accepted.
function rankedIdentity(address account) external view returns (address player, uint8 tier, bytes32 alias);
// Raw status for a player (no session resolution).
function personhoodOf(address player) external view returns (uint8 status, bytes32 alias);

function sessionOf(address owner) external view returns (address session, uint64 expiresAt);
function getConfig() external view returns (bytes32 context, uint8 acceptedTiers, uint64 maxTtl);

// Admin.
function setContext(bytes32 context) external;
function setAcceptedTiers(uint8 mask) external;
function setMaxTtl(uint64 blocks) external;
```

**Events:** `SessionRegistered(address indexed owner, address indexed
session, uint64 expiresAt)`, `SessionRevoked(address indexed owner, address
indexed session)`, `ConfigChanged(bytes32 context, uint8 acceptedTiers,
uint64 maxTtl)`.

**Session lifecycle:**

As built and checked live in M2 (Paseo Next runtime 3004000). Every
transaction is a **v5 general transaction on extension pipeline V1**; fees are
PGAS planck, burned, measured from `PGASFeePaid` events:

| Step | Who signs | Call | Fee (PGAS planck) |
| --- | --- | --- | --- |
| PGAS allowance | host prompt | `requestResourceAllocation(SmartContractAllowance)` | none (host claims PGAS with a personhood proof) |
| Create | product account, **one prompt** | `Utility.batch_all[ Assets.transfer_keep_alive(PGAS, session SS58, budget), Revive.call(Identity.registerSession(session, expiresAt)) ]` | 20.9 M fee + 206.4 M deposit (owner record) |
| Accept + first call | session key, no prompt | `Utility.batch_all[ Revive.call(acceptSession(owner)), Revive.call(mode.*) ]` | 23.5 M fee + 206.4 M deposit (key record, never refunded) |
| Play | session key, no prompt | `Revive.call(mode.*)` | 13.9 M (probe `whoami`); a mode turn is more (section 8); new storage items add 206.4 M each |
| Expire | nobody | `resolve` reverts after `expiresAt` | — |
| Rotate | product account, one prompt | the Create batch with a new key; the old key is burned | as Create, without a new owner-record deposit |
| Revoke | product account, one prompt | `revokeSession()` | 13.9 M fee; owner record deleted, 10 % of its deposit refunded |
| Drain | session key | `Assets.transfer_all` or PGAS ERC-20 `transfer(owner, rest)` | 13.2 M |

The design's version of the Create row (an all-Revive batch with a PGAS ERC-20
precompile `transfer(session, budget)`) came from `registry-sessions.md`
§3–§5, checked by its authors on 2026-07-14. M2 found that it fails on
today's runtime in two ways; see [M2 status](#m2-status-2026-10-20).

Two changes from the reference contract, on purpose:

- **Expiry.** The reference leaves expiry to extensions. We add
  `expiresAt` because the session mnemonic sits in plain host storage on
  Android (`registry-sessions.md` §2).
- **Burned keys.** The reference clears `owner_of` on revoke, so a revoked
  key would resolve to itself (kind `Direct`) and could play casual as a new
  player. We keep `burned`, and `resolve` returns `Invalid`.

**Ranked eligibility.** `rankedIdentity` replaces `ranked_identity`
(`contract/src/main.rs` 517–525) and keeps its rules: no context → not
eligible; precompile error → not eligible; only accepted tiers (Lite and Full
today, `PERSONHOOD_LITE`/`PERSONHOOD_FULL` lines 88–89) give an alias; a zero
alias is not eligible. The precompile is queried for the **resolved player**
(the product account), not the session key, because the product account holds
the `AliasAccounts` binding (`web/src/contract/personhood.ts` header).

**External dependency.** Ranked play is closed in practice today. The host
answers `NotAllowlisted` to the bind (`BETA_RELEASE_PLAN.md` "Open Items").
The fix is outside OAB: the `peopl.paseo` manifest must grant
`trustedProducts: {"oab-arena": ["context"]}` (host-rust-core
`runtime/capabilities/account.rs`, near line 170; reported by the
coordinator's top-trumps study, not read by the author of this document).
Identity cannot fix this. Milestone 3's ranked check needs it.

**Ownership reads (cosmetics, Constructed).** The NftPurse host API
(`docs/NFT_DESIGN.md` §7) is effectively dead on shipped hosts: vendored
only, with a trait-id collision (top-trumps study). Do not plan on it. The
working pattern is **own purses** (top-trumps `src/net/ownPurses.ts`):

- Root entropy from `deriveEntropy("<product>:purses:v1")` (exported by
  `@parity/product-sdk-host`, which OAB pins at `^0.27.1` in
  `web/package.json`).
- Purse keys on the soft path `product/<productId>/<i>`.
- The client scans purses `0..n` with a gap limit, reads the collection
  precompile `balanceOf` / `tokenOfOwnerByIndex` per purse, and never reuses a
  retired purse.
- Test vectors: top-trumps `scripts/handoff-vectors.mjs`.

Identity does not store purses. The client owns the scan. Records accepts a
player-supplied purse for badges (section 4.5). Constructed may verify a
purse on chain (section 4.4.4).

### 4.4 Mode contracts

**Job:** run one game mode. A mode owns its games, its ghost pools, and its
set cache. It links `oab-engine` and `oab-mode-kit` (section 5).

**Decision: casual and ranked are two contracts, `@oab/arena` and
`@oab/ranked`.** Reasons:

1. **Separate ghost pools.** Today both share brackets
   (`contract/src/main.rs` 290–298). A free bot account can plant weak boards
   that ranked players meet, which inflates the leaderboard. Two contracts
   give two pools by construction. Ranked ghosts come only from
   personhood-checked players.
2. **Records trusts them differently.** Records lets Ranked write leaderboards
   and earn badges. Arena gets neither. An allow-list entry per address is
   simpler than a per-report flag that a bug could set.
3. **Different upgrade pace.** Ranked will gain seasons and rule changes.
   Casual can stay put.

Cost: two deployments of the same code size (about 112 KB each today). One
contract with a flag and a flag in the bracket key would also fix point 1.
We prefer two because points 2 and 3 then need no extra code.

**Common storage (both modes, from `oab-mode-kit`):**

| Domain | Key | Value |
| --- | --- | --- |
| `ADMIN` | () | admin |
| `DEPS` | () | SCALE `Deps { identity, content, records: Option<[u8;20]> }` |
| `CONFIG` | () | SCALE `ModeConfig { mode_id: u16, game: GameConfig, allowed_sets: Vec<u16>, draining: bool }` |
| `SET_CACHE` | `set_id` | SCALE `SetBundle` (one read per turn instead of one per card) |
| `GAME` | player | SCALE `ModeGame` |
| `GHOST` | `MatchmakingBracket` SCALE | SCALE `Vec<Vec<GhostBoardUnit>>`, 10 per bracket |
| `RUN` | `run_id: u64` | SCALE `RunFact` (immutable once written) |
| `RUN_REPORTED` | `run_id` | `bool` |
| `NEXT_RUN` | () | `u64` |

```rust
pub struct ModeGame {                 // replaces ArenaSession; the client gets it as is
    pub run_id: u64,
    pub engine_version: u32,
    pub set_id: SetIdValue,
    pub set_hash: [u8; 32],
    pub config: GameConfig,           // no more hard-coded config in the client
    pub state: LocalGameState,
    pub alias: Option<[u8; 32]>,      // Ranked only
    pub started_block: u64,
}
```

**Common ABI:**

```solidity
function startGame(uint16 setId) external returns (uint64 runId);      // Arena
function submitTurn(bytes calldata action) external returns (uint64 battleSeed); // SCALE CommitTurnAction
function endGame() external returns (bool reported);
function abandonGame() external;

// Views take an explicit player. A dry-run origin may be a session key.
function getGame(address player) external view returns (bytes memory);   // SCALE ModeGame or empty
function getRun(uint64 runId) external view returns (bytes memory);       // SCALE RunFact or empty
function engineVersion() external pure returns (uint32);
function modeId() external view returns (uint16);

// Anyone. Re-sends a stored fact that Records did not accept.
function retryReport(uint64 runId) external returns (bool);

// Admin.
function setDeps(address identity, address content, address records) external;
function setAllowedSet(uint16 setId, bool allowed) external;
function setDraining(bool draining) external;   // no new games; running games finish
function cacheSet(uint16 setId) external;       // warm SET_CACHE at deploy
```

Errors: `NoGame`, `GameActive`, `WrongPhase`, `SetNotAllowed`,
`SetUnavailable`, `InvalidTurn`, `InvalidSession`, `NotEligible`, `Draining`.

**Events:**

```solidity
event GameStarted(address indexed player, uint64 runId, uint16 setId, uint32 engineVersion, bytes32 setHash);
// report = SCALE BattleReport (below)
event BattleReported(address indexed player, uint64 indexed runId, bytes report);
event GameEnded(address indexed player, uint64 indexed runId, uint8 wins, uint8 lives, uint8 rounds, bool reported);
event GameAbandoned(address indexed player, uint64 indexed runId);
```

```rust
pub struct BattleReport {             // SCALE, in BattleReported.report
    pub engine_version: u32,
    pub set_id: SetIdValue,
    pub round: RoundValue,            // the round that was fought
    pub result: BattleResult,
    pub wins: RoundValue,
    pub lives: RoundValue,
    pub battle_seed: u64,
    pub player_board: Vec<GhostBoardUnit>,   // new: replay needs no local state
    pub opponent: Vec<GhostBoardUnit>,
}
```

Today the event has no player topic and no player board
(`contract/src/main.rs` 1061–1076). Adding both costs about 30 bytes and lets
anyone replay any battle (flow 7.7).

#### 4.4.1 Arena (`@oab/arena`, casual)

> **As built in M3** (`arena/README.md`, [M3 status](#m3-status-2026-10-20)).
> No Records, runs, or `retryReport` yet; the set cache is filled by the admin
> in 416-byte pages; thin brackets add the set's house ghosts (Q1); the game
> item is never deleted.

- Open to every account. A `Direct` or `Session` caller plays as the resolved
  player. An `Invalid` session reverts.
- `endGame` reports a `RunFact` with `alias: None` when `records` is set.
  Records stores no board and mints no badge for it (rules in 4.5). See open
  question Q5.

#### 4.4.2 Ranked (`@oab/ranked`)

- `startRankedGame(uint16 setId) returns (uint64 runId)` calls
  `Identity.rankedIdentity(msg.sender)`. A zero alias reverts `NotEligible`.
  The alias goes into `ModeGame.alias`. Turns do not call the precompile again.
- `endGame` reports a `RunFact` with the alias.
- Ghosts come only from ranked games. Cold start: see open question Q6.

#### 4.4.3 Pai Gow (planned, `@oab/paigow`)

From `docs/PAI_GOW_VARIANT.md` "On-chain adaptation":

```solidity
function createMatch(uint16 setId) external returns (uint64 matchId);  // pack seed from block entropy
function joinMatch(uint64 matchId) external;
function commit(uint64 matchId, bytes32 commitment) external;         // keccak(SCALE(piles) ++ salt)
function reveal(uint64 matchId, bytes calldata piles, bytes32 salt) external;
function claimTimeout(uint64 matchId) external;                       // a side that did not reveal loses
function getMatch(uint64 matchId) external view returns (bytes memory);
```

Each pile pair resolves with `oab_engine::replay_battle`. The pairing seed is
`keccak(reveal_a ++ reveal_b ++ match seed)`. The fact kind is `Match` (4.5).

#### 4.4.4 Constructed (planned, `@oab/constructed`)

Deck checked with `validate_deck` (`game/src/constructed.rs:39`). The open
problem is ownership proof (`docs/NFT_DESIGN.md` §8 item 1): a card NFT sits at
a purse key, not at the player's account. Options:

1. **Signed purse claim.** The player's client signs
   `("oab/constructed/purse", mode, player, purse)` with the purse key. The
   mode checks the signature (pallet-revive has `sr25519_verify` and
   `ecdsa_recover` host functions; SDK support not checked) and then
   `ownerOf(token) == purse` on the collection precompile. Fits own purses
   (4.3). A purse moved later must be checked again at each start.
2. **Escrow.** The player moves the card to a purse the mode controls. Scarcity
   lets only the collection owner force-move, and one NFT sits per key, so
   return of the card is hard. Not preferred.
3. **Off-chain check, unranked only.** The client checks. No Records facts.

Recommendation: option 1. It needs a test that the host can sign with a purse
key. Open question Q10.

#### 4.4.5 Tournament (planned)

A mode with entry fees and a prize pool. It holds and pays its own funds and
reports facts to Records. Seasons are a Records concept (4.5), not a mode.
Open question Q9.

### 4.5 Records (`@oab/records`)

**Job:** turn facts into standing. Records owns leaderboards, achievement
rules, the soulbound badge collection, and the treasury that pays badge
deposits. It accepts facts only from allow-listed mode addresses. It keys
people by personhood alias.

**Fact type (in `oab-protocol`, section 5):**

```rust
pub struct RunFact {
    pub run_id: u64,                 // unique per mode address; idempotency key
    pub player: [u8; 20],            // resolved player (product account)
    pub alias: Option<[u8; 32]>,     // Some for personhood-checked runs
    pub set_id: SetIdValue,
    pub set_hash: [u8; 32],
    pub engine_version: u32,
    pub config: GameConfig,          // so rules can read wins_to_victory, starting_lives
    pub started_block: u64,
    pub ended_block: u64,
    pub kind: RunKind,
}
pub enum RunKind {
    Gauntlet { wins: u8, lives: u8, rounds: u8, outcome: RunOutcome },  // Arena, Ranked, Constructed
    Match { opponent_alias: Option<[u8; 32]>, lanes_won: u8, lanes_lost: u8 },  // Pai Gow
}
pub enum RunOutcome { Completed, Abandoned }
```

The mode id is **not** taken from the fact. Records reads it from the allow
list entry of `msg.sender`. A mode cannot report as another mode.

**Storage:**

| Domain | Key | Value |
| --- | --- | --- |
| `ADMIN` | () | admin |
| `MODE` | mode address | SCALE `ModeEntry { mode_id: u16, flags: u8 }` (flags: `RANKED`, `BOARDS`, `BADGES`) |
| `SEEN` | mode address ++ `run_id` | `bool` (dedupe) |
| `SEASON` | () | SCALE `Vec<Season { id: u16, start: u64, end: Option<u64> }>` |
| `BOARD` | `(mode_id, set_id, season)` | SCALE `Vec<LeaderboardEntry>`, top 100 (as today) |
| `BEST` | `(mode_id, set_id, season, alias)` | SCALE `LeaderboardEntry` |
| `RULES` | () | SCALE `Vec<BadgeRule>` |
| `BADGE_CONFIG` | () | SCALE `BadgeConfig { collection, items }` (as today) |
| `BADGES` | alias | SCALE `Vec<BadgeRecord>` |
| `PURSES` | alias | SCALE `Vec<[u8;20]>` queued fresh purses |
| `DEPS` | () | identity address |

```rust
pub struct BadgeRule {
    pub badge: u8,                   // index into BadgeConfig.items
    pub conditions: Vec<Cond>,       // all must hold
}
pub enum Cond {
    ReachedVictory,                  // wins >= config.wins_to_victory
    NoLifeLost,                      // lives >= config.starting_lives
    RankedMode,                      // ModeEntry.flags has RANKED
    ModeIs(u16),
    SetIs(u16),
}
pub struct BadgeRecord {
    pub badge: u8,
    pub set_id: SetIdValue,
    pub mode_id: u16,
    pub block: u64,
    pub purse: Option<[u8; 20]>,     // where it was minted
    pub token: Option<u64>,          // None = pending
}
```

Season 0 rules equal today's `qualifying_badges` (`contract/src/main.rs`
201–210): Victory = `[RankedMode, ReachedVictory]`; Flawless =
`[RankedMode, ReachedVictory, NoLifeLost]`. Because the rule reads the game
config from the fact, "Flawless" means "no life lost" in every mode, even one
with 5 lives.

**ABI:**

```solidity
// Allow-listed modes only. Idempotent per (mode, runId). Never reverts on a
// rule or mint problem; reverts only for NotAllowedMode or a bad payload.
function report(bytes calldata runFact) external returns (bool accepted);
// Anyone. Records calls mode.getRun(runId) and applies it (pull path,
// leaderboard-playground `arcade::record_score` style).
function pull(address mode, uint64 runId) external returns (bool accepted);

// Badge recipients (own purses, section 4.3). The caller is resolved through
// Identity to an alias. Appends fresh, empty purses to the alias's queue.
function addBadgePurses(address[] calldata purses) external;
// Anyone may retry; pending badges mint to queued purses (or the derived
// fallback when enabled). Returns how many minted.
function retryBadges(bytes32 alias) external returns (uint32 minted);

// Views.
function getLeaderboard(uint16 modeId, uint16 setId, uint16 season, uint32 offset, uint32 limit) external view returns (bytes memory);
function getPlayerRank(uint16 modeId, uint16 setId, uint16 season, bytes32 alias) external view returns (uint32);
function getBestRun(uint16 modeId, uint16 setId, uint16 season, bytes32 alias) external view returns (bytes memory);
function getBadges(bytes32 alias) external view returns (bytes memory);   // SCALE Vec<BadgeRecord>
function getBadgePurses(bytes32 alias) external view returns (address[] memory);
function derivedPurse(bytes32 alias, uint8 badge, uint16 setId) external view returns (address); // fallback / verifier
function getBadgeConfig() external view returns (bytes memory);
function getRules() external view returns (bytes memory);
function modeOf(address mode) external view returns (uint16 modeId, uint8 flags); // zero = not allowed
function currentSeason() external view returns (uint16);

// Admin.
function setMode(address mode, uint16 modeId, uint8 flags) external;
function removeMode(address mode) external;
function setRules(bytes calldata rules) external;            // SCALE Vec<BadgeRule>
function startSeason(uint16 id) external;                    // closes the open season
function initAchievements() external returns (uint32 collection);
function defineBadge(bytes calldata key, bytes calldata name) external returns (uint8 badge); // new soulbound item
function setDerivedFallback(bool enabled) external;
function nominateCollectionOwner(address newOwner) external; // handover to a Records v2
function withdraw(address to, uint256 amount) external;
function setIdentity(address identity) external;
// Funding: plain value transfer to the contract (payable receive/fund).
function fund() external payable;
```

**Events:** `RunRecorded(bytes32 indexed alias, address indexed mode,
uint64 runId, uint16 modeId, uint16 setId, uint16 season, uint32 rank)`,
`RunIgnored(address indexed mode, uint64 runId, uint8 reason)`,
`BadgeMinted(bytes32 indexed alias, uint8 badge, uint16 setId, address purse,
uint256 tokenId)`, `BadgePending(bytes32 indexed alias, uint8 badge, uint16
setId)`, `ModeSet(address indexed mode, uint16 modeId, uint8 flags)`,
`RulesSet(bytes32 rulesHash)`, `SeasonStarted(uint16 id, uint64 block)`,
`Funded(address from, uint256 amount)`, `Withdrawn(address to, uint256
amount)`.

**Rules Records applies to a fact:**

1. `msg.sender` must be in `MODE`. Else revert `NotAllowedMode`.
2. Seen `(mode, run_id)` → return `false` (no double count, safe retries).
3. `alias == None` or `Abandoned` → record nothing, emit `RunIgnored`.
4. Mode has `BOARDS` → update `BEST` and `BOARD` for
   `(mode_id, set_id, current season)` with `insert_ranked`
   (`contract/src/main.rs` 133–150).
5. Mode has `BADGES` → evaluate `RULES`. At most one record per
   `(alias, badge, set)`. This makes badges **per person**, not per account
   (resolves `docs/NFT_DESIGN.md` §8 item 7 in the direction of the alias;
   see Q4).
6. Mint each new badge. A failed mint leaves `token: None` and emits
   `BadgePending`. Rule 4 is already stored, so a mint failure never loses the
   result.

**Badge recipients (own purses).** Today the arena mints each badge to a
keyless key `keccak256("oab/badge-purse/" ++ arena ++ player ++ badge ++
set)[12..]` (`contract/src/main.rs` 587–601). Nobody controls those keys, so
the badges never show in a player's purse scan. Records changes this:

- The client derives fresh purses (section 4.3) and calls
  `addBadgePurses([...])` once per session setup, for example 4 purses. This
  call goes through the session key, so it is free.
- At mint time Records takes the first queued purse, checks
  `balanceOf(purse) == 0` on the collection precompile (one NFT per key,
  `docs/NFT_DESIGN.md` §2), mints to it, and removes it from the queue. A
  purse is never used twice.
- No queued purse → the badge stays pending. `retryBadges(alias)` mints it
  after the client adds a purse. With `setDerivedFallback(true)`, Records
  mints to `derivedPurse(alias, badge, set)` instead. The derived formula
  also serves as a verifier for fallback badges.
- A wrong purse (one the player does not control) only hurts the player. The
  badge is soulbound and the record in `BADGES` stays keyed by alias, so the
  record is the source of truth for "who earned it".

**Treasury.** Records pays the collection deposit (1.80 PAS) and about
0.21 PAS per badge (`docs/NFT_DESIGN.md` §9). It has `fund` and an admin
`withdraw`. Arena v2 has no withdraw, so its balance is stuck (section 13).

## 5. Shared crates

Shared code lives in crates, not in a shared contract.

| Crate | Content | Used by |
| --- | --- | --- |
| `oab-battle`, `oab-game` (exist) | rules | `oab-engine` |
| `oab-engine` (new) | facade of 4.1, `ENGINE_VERSION`, golden vectors | modes, engine contract, WASM client |
| `oab-protocol` (new) | SCALE types that cross a contract boundary: `SetBundle`, `ModeGame`, `BattleReport`, `RunFact`, `LeaderboardEntry`, `BadgeRecord`, `BadgeRule`, `BadgeConfig`; ABI `abi_import!` blocks of Identity, Content, Records, mode `getRun`; frontend fixture test | all contracts, client codec tests |
| `oab-mode-kit` (new) | raw SCALE storage helpers (today's `skey`/`read_scale`/`write_scale`, `contract/src/main.rs` 409–451), seed derivation (`block_entropy`, `derive_seed`), ghost pools, set cache, start/turn/end skeleton, report-with-retry | mode contracts |

`oab-protocol` takes over the fixture test that pins the frontend decoders
(`frontend_scale_fixtures`, `contract/src/main.rs` 2334–2404).

## 6. Who may call what

| Caller ↓ / Callee → | Engine | Content | Identity | Arena / Ranked | Records | Scarcity | Personhood pc |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Player, session key | views | views | views | game calls | `addBadgePurses`, `retryBadges`, `pull`, views | — | — |
| Player, product account | views | views | `registerSession`, `revokeSession` | game calls | same as session | — | — |
| Curator | — | `publishCard`, `publishSet` | — | — | — | — | — |
| Admin (deploy key) | — | `setCurator` | config | config, `setDraining`, `cacheSet` | allow list, rules, seasons, treasury, collection | — | — |
| Arena / Ranked | — (linked) | `getSetBundle` (cold) | `resolve`, `rankedIdentity` | — | `report` | — | — |
| Identity | — | — | — | — | — | — | `personhoodStatus` |
| Records | — | — | `rankedIdentity` (purse queue) | `getRun` (pull) | — | `createCollection`, `defineItem`, `mint`, `balanceOf`, owner handover | — |
| Anyone / third party | all | views | views | views, `retryReport` | views, `pull`, `retryBadges` | views | — |

Nested depth is at most 3 (player → mode → Records → Scarcity). No path calls
back into a contract that is already on the stack. `pull` runs Records →
mode, but the mode is not on the stack then.

## 7. Call flows

### 7.1 Casual turn (hot path)

```mermaid
sequenceDiagram
    participant S as Session key
    participant A as Arena (engine linked)
    participant I as Identity
    S->>A: Revive.call submitTurn(action)  [free, ChargePGAS]
    A->>I: resolve(msg.sender)
    I-->>A: (player, Session)
    A->>A: read GAME[player], SET_CACHE[set], GHOST[bracket]
    A->>A: seeds from player + game_seed
    A->>A: oab_engine::resolve_turn(...)
    A->>A: push player ghost, write GAME[player]
    A-->>S: BattleReported(player, runId, SCALE BattleReport)
```

### 7.2 Ranked start

```mermaid
sequenceDiagram
    participant S as Session key
    participant R as Ranked
    participant I as Identity
    participant P as Personhood precompile
    participant C as Content
    S->>R: startRankedGame(setId)
    R->>I: rankedIdentity(msg.sender)
    I->>I: resolve session -> player
    I->>P: personhoodStatus(player, context)
    P-->>I: (status, alias)
    I-->>R: (player, tier, alias or zero)
    alt alias is zero
        R-->>S: revert NotEligible
    else eligible
        opt SET_CACHE[setId] missing (only once per set per mode version)
            R->>C: getSetBundle(setId)
            C-->>R: SetBundle
            R->>R: check hash == Content.setHash, store
        end
        R->>R: seed = f(block entropy, player); oab_engine::new_game
        R-->>S: GameStarted(player, runId, setId, engineVersion, setHash)
    end
```

### 7.3 End of game, report, badge mint

```mermaid
sequenceDiagram
    participant S as Session key
    participant R as Ranked
    participant I as Identity
    participant RC as Records
    participant N as Scarcity collection
    S->>R: endGame()
    R->>I: resolve(msg.sender)
    R->>R: phase == Completed; push final ghost
    R->>R: write RUN[runId] = RunFact; clear GAME[player]
    R->>RC: report(RunFact)  [bounded gas, error is caught]
    RC->>RC: allow list, dedupe, BEST/BOARD update
    RC->>RC: evaluate rules -> new badges
    RC->>N: balanceOf(purse)==0 ? mint(item, purse, oab.set)
    N-->>RC: tokenId (or error -> pending)
    RC-->>R: accepted
    R->>R: RUN_REPORTED[runId] = true
    R-->>S: GameEnded(player, runId, wins, lives, rounds, reported)
    Note over R,RC: If report fails: game still ends, reported=false.<br/>Anyone calls Ranked.retryReport(runId) or Records.pull(Ranked, runId).
```

### 7.4 Session setup

As built in M2. Every extrinsic is a v5 general transaction on extension
pipeline V1, so its fee is burned in PGAS (no native token, no pool).

```mermaid
sequenceDiagram
    participant U as Product account (host signs, txExtVersion 1)
    participant H as Host
    participant K as Client (session key, V1)
    participant A as Assets pallet
    participant I as Identity
    participant M as Mode
    K->>H: requestResourceAllocation(SmartContractAllowance) [only if no PGAS]
    H-->>U: PGAS claimed (personhood proof)
    K->>K: SessionKeyManager.getOrCreate()
    U->>A: batch_all[ Assets.transfer_keep_alive(PGAS, session SS58, budget),
    U->>I:            Revive.call registerSession(session, expiresAt) ]  ONE prompt
    A-->>K: session account created and auto-mapped
    I-->>U: SessionOffered(owner, session, expiresAt)
    K->>I: batch_all[ Revive.call acceptSession(owner),
    K->>M:            Revive.call first game call ]  silent
    I-->>K: SessionRegistered(owner, session, expiresAt)
    Note over K: Restore: read Identity.sessionOf(owner); trust the stored key only if it matches, state = 2, and expiresAt is in the future.
```

Badge purses (`addBadgePurses`, Records) wait for M4.

### 7.5 Content publish

```mermaid
sequenceDiagram
    participant Cu as Curator
    participant C as Content
    participant Ad as Admin
    participant M as Mode
    Cu->>C: publishCard(UnitCard) x N  (batch_all of Revive calls)
    Cu->>C: publishSet(name, CardSet)
    C-->>Cu: SetPublished(setId, setHash)
    Ad->>M: setAllowedSet(setId, true)
    Ad->>M: cacheSet(setId)   (warm cache; else first player pays it)
```

### 7.6 Engine upgrade with games in flight

```mermaid
sequenceDiagram
    participant Ad as Admin
    participant V1 as Ranked v1 (engine 1)
    participant V2 as Ranked v2 (engine 2)
    participant RC as Records
    participant E2 as @oab/engine v2
    Ad->>E2: cdm deploy (pure engine 2)
    Ad->>V2: cdm deploy (links engine 2, same mode_id)
    Ad->>V2: setDeps, setAllowedSet, cacheSet
    Ad->>RC: setMode(V2, mode_id, flags)   (V1 stays allowed)
    Ad->>V1: setDraining(true)   (no new games)
    Note over V1: Running games finish on engine 1 and report to Records as mode_id.
    Note over V2: New games start here. Boards and badges are shared: same mode_id.
    Ad->>RC: removeMode(V1)   (after the drain window, e.g. 14 days)
```

Because modes link the engine, an engine upgrade is a mode redeploy.
Section 15 explains why.

### 7.7 Client battle replay

```mermaid
sequenceDiagram
    participant W as Web client
    participant M as Mode
    participant B as WASM bundle for engine_version
    W->>M: tx events of submitTurn (or event log for any player)
    M-->>W: BattleReported(player, runId, report)
    W->>W: decode SCALE BattleReport
    W->>W: bundle = ENGINE_BUNDLES[report.engine_version] (refuse if missing)
    W->>M: (cached) SetBundle via Content.getSetBundle(report.set_id)
    W->>B: replay_battle(player_board, opponent, battle_seed, bundle, board_size)
    B-->>W: Vec<CombatEvent> -> render
```

## 8. Hot-path cost

Frequent calls: `submitTurn` (about 10–20 per run), `startGame` (1 per run),
`endGame` (1 per run). Proof size (PoV) on a parachain grows with every
contract code blob the call loads and every storage item it touches.

| Call | Code blobs loaded | Sub-calls | Storage reads / writes |
| --- | --- | --- | --- |
| **Today** `submitTurn` (`contract/src/main.rs` 904–1079) | arena (~112 KB) | none | session, set, **1 per card** (49–70), ghost pool / session, ghost pool |
| **New** `submitTurn` | mode (~112 KB est.) + Identity (est. 5–15 KB) | `Identity.resolve` | game, `SET_CACHE` (1 blob ≤ 2.4 KB), ghost pool, Identity 2–3 small items / game, ghost pool |
| Today `startRankedGame` | arena | personhood precompile | session flag, set, 1 per card / session, ranked flag |
| New `startRankedGame` | mode + Identity | `rankedIdentity` → precompile; `getSetBundle` only on a cold cache | as turn, plus Content code (cold only) |
| New `endGame` (ranked) | mode + Identity + Records (est. 40–80 KB) | `resolve`, `report` → Scarcity `balanceOf` + `mint` ×0–2 | run fact, ghost / Records: board (≤ 4.6 KB), best, badges, purses |
| Engine contract call | engine (~ size of the engine part of the mode) | none | none |

Expected result: `submitTurn` adds one small sub-call and removes 48–69
storage reads. It should cost the same or less than today. `endGame` costs
more (Records code), but it runs once per run.

**Avoid on the hot path:**

- `cdm::import!`'s `cdm_lookup()`. It calls the CDM registry
  (`getAddress(string)`) at run time, returns the **latest** version, and
  panics on failure (CDM `src/lib/cdm/rust-macros/pvm-cdm-macros/src/lib.rs`
  lines 53–162). That is one extra sub-call plus the registry code per use.
  Modes store dependency addresses in `DEPS` instead (section 11).
- Calling the engine contract. It would load a second ~100 KB blob per turn.

**Measured in M1 (Paseo Next, 2026-10-20, dry-run at the best block,
`ReviveApi.call` `weight_required`):**

| Call | ref_time | proof_size | Notes |
| --- | --- | --- | --- |
| `@oab/engine.resolveTurn`, busiest corpus turn (158 combat events, 7 units, set 0 round 3) | 25 253 713 083 | 98 014 | input 1.9 KB |
| `@oab/engine.resolveTurn`, 5v5 round 10, set 0 (47 events) | 19 609 035 395 | 98 014 | |
| `@oab/engine.resolveTurn`, 5v5 round 10, set 1 (62 events) | 26 847 291 527 | 98 014 | |
| `@oab/engine.resolveTurn`, 5v5 round 10, set 2 (93 events) | 27 162 366 727 | 98 014 | input 2.6 KB, output 1.1 KB |
| `@oab/content.getSetBundle(0)` (49 cards) | 15 833 659 959 | 557 298 | 1 682 bytes returned |
| `@oab/content.getSetBundle(1)` (68 cards) | 21 545 725 843 | 752 665 | 2 177 bytes |
| `@oab/content.getSetBundle(2)` (70 cards) | 22 446 093 457 | 773 397 | 2 385 bytes |
| `@oab/content.getHouseGhosts(i)` (30 ghosts) | 7 416 415 389 | 361 505 | |
| `@oab/content.setHash(i)` | ~298 000 000 | 53 045 | one storage read |
| `@oab/content.publishSet` (sets 0, 1, 2) | 35.9 G / 44.5 G / 45.8 G | 1.42 M / 1.81 M / 1.85 M | deposit about 0.69–0.71 PAS each |

What the numbers say:

- The engine contract's proof size is its code (98 014 bytes); it reads no
  storage. A linked engine in a mode adds the same code once per call.
- **Each storage read is charged about 10 KB of proof** (getSetBundle: (773 397
  − 53 045) / 71 reads). The proof weight is per item, not per byte. Arena v2's
  `submitTurn` reads one item per card (49–70) every turn, so its proof weight
  is in the 0.5–0.75 MB range from card reads alone. M3's `SET_CACHE` must be
  few items: a 2.4 KB bundle in 416-byte pages is 6 items (about 60 KB of
  proof). It cannot be one item, as section 4.4 assumed.

**Measured in M2 (Paseo Next runtime 3004000, 2026-10-20, dry-run at the best
block, `@oab/identity` CDM version 2, 7 176-byte blob):**

| Call | ref_time | proof_size | Deposit (PGAS planck) |
| --- | --- | --- | --- |
| `resolve(live session key)` (hot path) | 130 555 519 | 17 849 | 0 |
| `resolve(plain account)` | 135 184 993 | 17 849 | 0 |
| `resolve(expired key)` (reverts) | 135 417 999 | 17 849 | 0 |
| probe `whoami()`: session-signed call that sub-calls `resolve` | 673 353 172 | 49 402 | 0 |
| probe `play()`: `resolve` + one item write (version 1 run) | 897 905 862 | 68 635 | 205.2 M for a new item |
| `registerSession` (first offer) | 670 376 553 | 58 909 | 206.4 M |
| `registerSession` (rotation; burns the bound key) | 998 149 407 | 79 519 | 0 |
| `acceptSession` | 771 270 095 | 58 909 | 206.4 M |
| `revokeSession` (bound key) | 647 824 624 | 48 716 | refund 206.4 M (10 % paid back, 90 % burned) |

What the M2 numbers say:

- `resolve` is one storage read: 17 849 proof bytes = the 7 176-byte code +
  one item (about 10 KB). The same for a live key, a plain account, and a
  dead key. This is the whole Identity cost a mode adds per call (plus the
  sub-call overhead), well inside the 5–15 KB code estimate above.
- **The fee follows proof size and call length, not ref time.** Fee
  estimates (`TransactionPaymentApi.query_fee_details`) on this runtime: base
  0.58 M; length 50 000 per byte; weight fee 6.2 M at 0.67 G / 49 KB, 10.7 M at
  1 G / 100 KB, 12.2 M at 25.3 G / 98 KB (an engine turn), 23.9 M at 27 G /
  250 KB, 68.0 M at 27 G / 750 KB. So M3's proof-size target is also its fee
  target, and turn calldata should stay small (a 2 KB input costs 107.7 M in
  length fee alone).
- Each new storage item costs 200 M PGAS (`DepositPerChildTrieItem`) plus
  100 000 per byte of key and value (a 32-byte word: 206.4 M). A release
  refunds only 10 %. New items, not fees, dominate a session's PGAS use.

**Measured in M3** (casual Arena, see [M3 status](#m3-status-2026-10-20)):
`submitTurn` 18.6–27.5 G ref time and 268 KB proof (arena v2: 37.7 G,
679 KB); `startGame` 13.7 G and 261 KB (arena v2: 32.6 G, 661 KB); fee
38.1 M per turn. A turn that creates a new ghost bracket item also pays about
206 M deposit.

**Measure after implementation (milestone 3 and 4 success criteria):**
dry-run `gasRequired` (ref time and proof size) for `startGame`,
`startRankedGame`, `submitTurn` (round 1 and round 10, with a full ghost
bracket), and `endGame` (no badge, one badge, two badges). Compare with arena
v2 on the same chain. The client already doubles dry-run weight for game
starts (`web/src/contract/arenaFlows.ts` `withGasHeadroom`); check that the
margin still holds. Also measure the largest `BattleReported` event and the
engine contract's `replayBattle` return size, because return buffer limits
were not checked.

## 9. Trust boundaries and failure modes

**Trust:**

- Records trusts every fact from an allow-listed mode. A buggy mode can write
  false boards. Mitigation: allow-list per address, `removeMode`, and facts
  stored in the mode (`getRun`) so an audit can recompute them with the
  engine contract.
- Modes trust Identity for "who is this". A wrong Identity address lets
  anyone act as anyone. `setDeps` is admin-only and emits an event.
- Modes trust Content only at cache time, and they check the hash.
- Identity trusts the personhood precompile.
- Nobody trusts the engine contract. Modes do not call it.

**Failure modes:**

| Failure | Effect | Rule |
| --- | --- | --- |
| `Records.report` reverts or runs out of gas | Game still ends. `GameEnded.reported = false`. Fact stays in `RUN`. | The mode calls Records with a bounded gas limit (`CallLimits`) and catches the error. Anyone calls `retryReport` or `Records.pull`. Dedupe makes retries safe. |
| Badge mint fails (no funds, no collection, purse not empty) | Board entry kept, badge `token: None`, `BadgePending`. | `retryBadges(alias)` after funding or after new purses. Same rule as today (`contract/src/main.rs` 646–675). |
| No queued purse | Badge pending. | Client adds purses; or admin enables derived fallback. |
| Identity call fails, ranked | `startRankedGame` reverts. | Fail closed (as today, `contract/src/main.rs` 500–513). |
| Identity call fails, casual | **Revert** (Q3, decided). | A contract cannot go "down"; a failure here means a bad address or a bug. Revert is the safe answer. |
| Session expired or burned | `Identity.resolve` itself reverts `InvalidSession(account)` (M2); the mode propagates the revert. Client sets up a new session (one prompt). | A burned or expired key never falls back to playing as itself. |
| Content missing a set | `startGame` reverts `SetUnavailable`. Running games are not affected (they use the cache). | |
| Personhood precompile missing on a chain | Ranked closed. Casual open. | As today. |
| Records full of stale modes | `modeOf` returns zero for removed modes; their reports revert. | |

## 10. Versioning and upgrades

| Contract | Changes how | State on upgrade |
| --- | --- | --- |
| Engine | New version = new deployment of `@oab/engine` (new CDM version) | none (pure) |
| Content | Code immutable. New cards and sets are appended. | kept forever |
| Identity | Redeploy, then `setDeps` on every mode and `setIdentity` on Records. | sessions lost: one prompt per player |
| Mode | New engine or new mode logic = new deployment with the same `mode_id`. Old one drains. | games finish on the old one; ghost pools start empty (Q1) |
| Records | Immutable code at first. Escape hatch: `nominateCollectionOwner` to a Records v2. See Q8 for a proxy. | boards and badges must be migrated or restarted |
| nft-minter | Immutable (`nft-minter/src/main.rs` header). New table = new minter. | none |

**Engine version rule.** Any change that alters a golden-vector output bumps
`ENGINE_VERSION`. A new engine version means: new `@oab/engine` deploy, new
mode deploys, new WASM bundle in the frontend. A game never changes engine
version.

**Frontend needs:**

- A table `ENGINE_BUNDLES: Record<number, () => Promise<WasmModule>>`, one
  `wasm-pack` output per engine version still in play (`build-wasm.sh` today
  builds one). Lazy-load old bundles. Bundle size was not measured; check it
  against the Bulletin limit before keeping more than two.
- `getGame` returns `engine_version`. The client loads that bundle for the
  shop phase and replay. If it has no bundle, it shows "update the app" and
  does not submit.
- The client stops patching config bytes (`index.ts` 581–586), because
  `ModeGame` carries `config`.
- A CI check: the WASM `engine_version()` export equals the crate constant,
  and every mode in `web/cdm.json` reports an engine version that has a
  bundle.

## 11. Wiring and the frontend

**Contracts.** `cdm::import!` gives two resolvers (CDM `pvm-cdm-macros`):

- `cdm_lookup()`: run-time registry call, latest version, panics on failure.
- `cdm_from_env()`: address baked at build time from `CDM_REGISTRY`.

Design: each mode keeps its dependencies in `DEPS`. The deploy script fills
them right after `cdm deploy`, with addresses from the registry
(`getAddressAtVersion`, an exact version, not "latest"). `setDeps` emits an
event. This keeps the hot path free of registry calls, pins exact versions,
and lets the admin re-point a mode. `cdm::import!` is still used for the
typed interfaces. Its `cdm_from_env()` is acceptable for a constructor
default.

**Package names:** `@oab/engine`, `@oab/content`, `@oab/identity`,
`@oab/arena` (version 3 = casual mode; the ABI changes, but the frontend pins
versions in `cdm.json`), `@oab/ranked`, `@oab/records`. `@oab/nft-minter`
stays.

**Frontend.** `cdm i -n paseo @oab/content @oab/identity @oab/arena
@oab/ranked @oab/records` writes all addresses and ABIs into
`web/cdm.json`. The client binds each from the inline address and ABI, as it
does today (`index.ts` 268–273), so `connect()` stays free of registry
lookups. `ContractManager.getContract("@oab/...")` from
`@parity/product-sdk-contracts` is the typed path (CDM README "Using
Contracts From A Triangle App").

Client changes:

- `session.ts`: proxy sessions → registry sessions (flow 7.4). The
  `Sponsor` policy object stays; `ProxySession` becomes a `RegistrySession`.
  On first run after the switch, offer `Proxy.remove_proxies` to return the
  proxy deposit.
- Dry-runs use the session key as origin, so `resolve` sees the same caller as
  the real call.
- Views pass the player address explicitly.
- `codec.ts` decodes `ModeGame`, `BattleReport`, `RunFact`, and the Records
  views from `oab-protocol` fixtures.
- Own purses for badges and cosmetics (section 4.3).

## 12. Governance

| Stage | Who holds admin |
| --- | --- |
| Testnet (now) | the cdm deploy key (`docs/NFT_DESIGN.md` §1 owner account) |
| Before mainnet | a multisig or a governance origin for: Content curators, Identity config, mode config, Records allow list, rules, seasons, treasury, collection owner |

Immutable after deploy:

- Every engine contract (no storage, no admin).
- Every published card and set in Content.
- Mode code per version (config stays mutable).
- `nft-minter`.

Mutable (admin):

- Content curator list.
- Identity context, accepted tiers, max TTL.
- Mode deps, allowed sets, draining.
- Records allow list, rules, seasons, derived fallback, treasury, collection
  handover, Identity address.

Every admin setter emits an event, so changes are visible on chain.

## 13. Migration from arena v2

Testnet only. A state reset is accepted. Arena v2 stays deployed (a contract
cannot be removed). The frontend stops pointing at it.

**What is lost or stranded:**

| Item | Where in v2 | Fate |
| --- | --- | --- |
| Games in progress | `DOM_SESSION` | Not moved. Players can finish them only with an old frontend. Proposal: announce, then switch. |
| Ghost pools | `DOM_GHOST` | Lost. v2 has no view for them. They could be read off chain through raw storage and seeded by an admin (Q6). |
| Leaderboards, best runs | `DOM_LEADERBOARD`, `DOM_BEST_RUN` | Lost. Readable through `getLeaderboard`. Likely empty: ranked play is blocked by the bind (`BETA_RELEASE_PLAN.md`). |
| Badge records | `DOM_BADGES` | Lost. Likely empty for the same reason. |
| Collection 30 | owned by v2 | Stranded. v2 has no owner handover. Existing badges stay valid in it. Records creates a new collection. |
| Arena v2 PAS balance | arena account | Stranded. v2 has no withdraw (`docs/NFT_DESIGN.md` §8 item 4). |
| Proxy sessions | `Proxy` pallet, per player | Still valid but unused. The client offers to remove them. |

**Kept:** personhood bindings (pallet `AliasAccounts`, not contract state),
the personhood context value (product-scoped, unchanged while the product id
is `oab-arena.paseo`), collection 29 and `@oab/nft-minter`, card and set data
(re-published from `assets/` into Content; set ids are auto-assigned in order,
so 0, 1, 2 stay the same if published in order).

## 14. Build plan

Order agreed: content + engine → identity → modes → records → frontend →
retire arena v2. Each milestone ends with its success criteria met.

**Priority change (2026-10-20):** casual play for everyone comes first.
Build M1, M2 (sessions; the personhood part of Identity can wait), and M3 with
the Arena mode only. The Ranked mode, M4 Records, and the personhood bind are
on hold.

### M1. Engine crate, engine contract, Content

Work:

1. Create `oab-engine` (4.1). Move the turn pipeline out of
   `contract/src/main.rs` into `resolve_turn`. Delete the copies of
   `GameConfig`, `create_starting_bag`, `draw_hand` from the contract. Fix
   `set_id: 0` in `make_shop_state`.
2. Point arena v2 source and the WASM client at the facade (no redeploy).
3. Golden vectors, `ENGINE_VERSION = 1`, `ENGINE_VECTORS_HASH`.
4. `@oab/engine` contract. `@oab/content` contract. `oab-protocol` crate.

Success:

- All current native tests in `contract/src/main.rs` and
  `contract/tests-native/` pass with the facade, unchanged.
- The golden vectors give the same outputs as arena v2 code before the
  refactor (proof that the refactor changed no behavior).
- On Paseo Next: 111 cards and 3 sets published; `setHash(i)` equals the hash
  computed off chain; `@oab/engine.resolveTurn` dry-run output equals the
  native output for the corpus; `engineVersion()` = 1.

### M1 status (2026-10-20)

Done on branch `update/m1-engine-content` (not merged). Deployed on Paseo
Next by the cdm `paseo` account (`5CUbpNYAePqCdFkS6BWqVF4RDaAcsueW923DrJTnDUXHst7v`,
H160 `0x704ead03a0a7c8b06c6ebbde97934adc24f9f5f7`), CDM registry
`0xc1a73a4f93fde65b1cb1680baead248073566cb0`.

| Item | Value |
| --- | --- |
| `oab-engine` (`engine/`) | `ENGINE_VERSION` 1, `ENGINE_VECTORS_HASH` `0xd8d7c21e3b7ef1f67befb155370cfe55a7840de2259c4d4ec8b98517aee68b5c` |
| `@oab/engine` (`engine-contract/`) | `0xb63d4a8DdAcB30a3E181C98a6008a2Be4fC6CCb0`, CDM version 0, 98 014-byte blob |
| `@oab/content` (`content/`) | `0xd9Cb4F28a6164485D800144E202353D612bAf642`, CDM version 0, 42 372-byte blob |
| `oab-protocol` (`protocol/`) | Content types: `HouseGhost`, `SetRecord`, `CardMeta`, `CardOrigin` |
| Content data | 111 cards (6 `batch_all` txs, blocks 2054945–2054959); sets 0, 1, 2 (blocks 2054978–2054980), 30 house ghosts each |
| Set hashes | 0 `0xf45b623640787699…`, 1 `0x7902188848594e10…`, 2 `0x476120fbb2c2e926…` (equal to `SetBundle::hash` off chain) |

Checks that passed:

- `engine/arena-oracle` compiles `contract/src/main.rs` unchanged and runs
  the arena methods on the golden-vector corpus (12 games, 71 turns, one
  invalid turn): equal start seeds, start states, battle seeds, post-turn
  states, and `BattleReported` payloads. This is the proof that version 1 is
  arena v2. The arena's own 40 tests pass, in its crate and in the oracle.
- On chain: `eth_getCode` of both addresses equals the local blobs;
  `engineVersion()` = 1 and `vectorsHash()` equal the crate; all 157 corpus
  calls (`newGame`, `resolveTurn` including the revert, `replayBattle`) return
  the crate's bytes; every card, `getSet`, `getSetBundle`, `getHouseGhosts`,
  and `setHash` equals the plan from `oab-plan`.
- `cargo test --workspace` passes.

Deviations from the design:

1. **Arena v2 source was not moved onto the facade** (work items 1 and 2).
   The integrator asked to leave `contract/src/main.rs` alone in M1. Its
   copies of `GameConfig`, `create_starting_bag`, and `draw_hand` stay. The
   oracle proves equal behaviour instead. The WASM client (`client/`) is not
   pointed at `replay_battle` yet.
2. **Storage layout of Content** follows the 416-byte item limit (section 4.2
   note). Extra views: `getSetRecord`, `getHouseGhosts`, `getCardMeta`,
   `isCurator`, `adminAddress`.
3. **`publishSet` takes the house ghosts** (Q1) as a third argument:
   `publishSet(string, bytes cardSet, bytes houseGhosts)`. `SetPublished`
   also carries `ghostsHash`. `HouseGhost { round, board }` has no bracket:
   a mode puts a round-r ghost in every round-r bracket.
4. **The deployer is the first curator**, so publishing works right after
   deploy.
5. **`ENGINE_HISTORY`** (append-only list of `(version, hash)`) is the source
   of `ENGINE_VERSION` and `ENGINE_VECTORS_HASH`. A test refuses a list where
   two versions share a hash or versions skip.
6. **Engine contract errors**: `BadInput()`, `InvalidTurn(bytes)` (SCALE
   `GameError`).
7. **Saturating arithmetic** for the mana limit, wins, and lives. Arena v2
   wraps its mana limit at round 254 and up (`overflow-checks = false`). The
   corpus does not reach that round.
8. **CDM versions start at 0.** `@oab/engine` CDM version 0 runs engine
   version 1. The two numbers are independent.

Open problems found in M1:

- **Arena v2 leaderboard limit (from source, not tested live).**
  `LeaderboardEntry` is 45 bytes SCALE; a board of 10 entries is 451 bytes,
  above the 416-byte item limit. So the write for the 10th distinct ranked
  finisher on a set should fail, and with it that `endGame`. Ranked play is
  blocked today, so nobody has hit it. Records (M4) must page boards.
- **Mode `SET_CACHE` and Records `BOARD`** cannot be single items (sections
  4.4, 4.5). Use 416-byte pages.
- **Client replay differs from the chain** for a ghost unit with negative
  health after buffs: `client/src/engine.rs` (`resolve_battle_p2p`) clamps
  enemy health at 0, the arena and the engine do not. Moving the client to
  `oab_engine::replay_battle` fixes it.
- **A `CardSet` above 416 bytes** (about 138 cards) cannot be published.
  Larger sets need paging in Content.
- **House ghosts are rule-made**, not hand-designed
  (`scripts/oab-plan/src/house_ghosts.rs`). A designer list can ship with a
  new set.

### M2. Identity

Success:

- MockHost tests: register, rotate (old key burned), revoke, expiry,
  session cannot register, burned key returns `Invalid`, TTL limit, tier mask,
  fail closed with no context, with a reverting precompile, and with an empty
  reply (the current tests at `contract/src/main.rs` 1730–1818 move here).
- On Paseo Next: the all-Revive setup batch costs the product account no fee;
  a session-signed `Revive.call` into a test contract that calls `resolve`
  costs no fee and resolves to the owner.

### M2 status (2026-10-20)

Done on branch `update/m2-identity` (from `update/oct-2026` at `bf13ebc`; not
merged). Personhood is on hold (section 14 priority note), so M2 built the
session registry and a personhood stub only. Deployed on Paseo Next by the
cdm `paseo` account (H160 `0x704ead03a0a7c8b06c6ebbde97934adc24f9f5f7`).

| Item | Value |
| --- | --- |
| `@oab/identity` (`identity/`) | `0x7b41368859B67BB5c88500612eDe21AA6b837FBA`, CDM version 2, block 2056840, 7 176-byte blob, metadata `bafk2bzacebnfrdmbb5bm3ce3e7ujprsnch45uj5jtjbgt2s4x4hmots3s4tse` |
| Probe (`identity/probe`, test only, not in CDM) | `0x60ce23e6c109ef34b961c52af3bc4e15ac573479`, block 2056854 |
| Do not use | CDM version 0 `0x954697369c81f5bfbf2a7c78d10a329671007b46` (block 2055508; its Bulletin metadata upload timed out, so `cdm i` cannot fetch it) and version 1 `0x13Aa48532372031ab58047B1a0cA8c956c5fCc03` (block 2056585; revoke left the owner record, see deviation 4) |
| Scripts | `scripts/m2/deploy-probe.mjs`, `scripts/m2/check-identity.mjs` (polkadot-api 3.2.1) |

Checks that passed:

- 14 native tests (`identity/src/tests.rs`): a key resolves to its player only
  after it accepts; a plain account resolves to itself; an expired key and a
  revoked key revert and never play as themselves; a burned key cannot be
  registered again by anyone; one session per player (rotation burns the old
  key at once); a player cannot bind another player's account (the offer
  binds nothing, and withdrawing it burns nothing); a bound key cannot be
  taken by another player; a key with two offers binds once; a key cannot own
  and an owner cannot be a key; stale offers fail; TTL limit and admin-only
  `setMaxTtl`; the ranked stub fails closed; every storage item is one 32-byte
  word (≤ 416 bytes); revoke deletes the owner record. Mutating the accept
  check, the rotation burn, the revoked flag, or the delete makes tests fail.
- `cargo test --workspace` passes (243 tests). `eth_getCode` of the address
  equals the local blob.
- Live (`check-identity.mjs`, //Alice as the player, a fresh session key,
  blocks 2056861–2056933): register → accept → a session-signed contract call
  that resolves to Alice inside the probe → `resolve` reverts
  `InvalidSession(session)` after expiry → revoke deletes the owner record
  (206.4 M deposit released, 10 % back to Alice) and burns the key →
  `registerSession(burned key)` reverts `SessionKeyBurned()`. The same flow,
  with a write per call (`play`) and a final drain, passed on version 1
  (blocks 2056603–2056726).

**Fee model, verified live.** The design's claim ("free; an all-Revive batch
passes `ChargePGAS`") does not hold on runtime 3004000:

1. Since individuality `f0d5e690c2` (2026-10-08, "version Paseo transaction
   extensions"), the runtime has two extension pipelines. **V0** (every classic
   v4 signed extrinsic, the polkadot-api 2 default) has plain
   `ChargeAssetTxPayment` and no `ChargePGAS`: the fee is native. **V1** (only
   v5 general extrinsics, signed through `VerifyMultiSignature`) has
   `ChargePGAS` with `CallFilter = Everything`: any call, any batch, pays its
   fee in PGAS when the signer holds enough.
2. A PGAS ERC-20 precompile `transfer(h160, x)` to an unmapped account credits
   the H160's *fallback* account (`h160 ++ 0xEE × 12`), not the key's own
   account. The key is not auto-mapped and cannot spend it. Auto-mapping
   happens when the key's own SS58 account is created, for example by
   `Assets.transfer_keep_alive` of the sufficient PGAS asset.

Evidence (fees in planck; `TransactionFeePaid` = native, `PGASFeePaid` = PGAS):

| Tx (block) | Signer, pipeline | Call | Fee event | Balances |
| --- | --- | --- | --- | --- |
| `0x8beb782a…86a6` (2055839) | Alice, V0 | `batch_all[precompile transfer(session H160, 1 G), registerSession]` | `TransactionFeePaid` 24 548 799 native | Alice native −24.5 M; PGAS −1 207.7 M; session SS58 PGAS 0 → 0 (1 G went to the fallback account; lost) |
| `0xcf3f5cba…c629` (2056199) | Alice, V0 | `Assets.transfer_keep_alive(PGAS, session SS58, 300 M)` | `TransactionFeePaid` 9 588 398 native | session created and auto-mapped |
| validate only | PGAS-only key, V0 | `System.remark`, `Revive.call`, all-Revive batch | — | all `Invalid(Payment)` |
| validate only | PGAS-only key, V1 | `System.remark`, `Revive.call`, all-Revive and mixed batches | — | all valid |
| `0x4309cb65…5d7a` (2056313) | PGAS-only key, V1 | `Revive.call(resolve)` | `PGASFeePaid` 12 482 616 | key PGAS 300 M → 287.5 M; native 0 → 0 |
| `0x37238b12…1033` (2056861) | Alice, V1 | `batch_all[Assets.transfer_keep_alive(PGAS, session, 260 M), registerSession]` | `PGASFeePaid` 20 901 883 | Alice native unchanged; PGAS −487.3 M (260 M budget + 206.4 M deposit + fee) |
| `0x44f9a441…359b` (2056865) | session, V1 | `batch_all[acceptSession, probe.whoami]` | `PGASFeePaid` 23 507 630 | session native 0 → 0; PGAS −229.9 M (206.4 M deposit + fee) |
| `0xa5176d0b…e1c0` (2056867) | session, V1 | `probe.whoami` | `PGASFeePaid` 13 869 034 | session PGAS −13.9 M |
| `0xc96f2856…9195` (2056933) | Alice, V1 | `revokeSession` | `PGASFeePaid` 13 858 546 | Alice PGAS +6.8 M (20.6 M refund − fee); `AssetsHolder.Burned` the other 90 % |
| `0x30fe321f…de8d` (2056726, version 1 run) | session, V1 | precompile `transfer(Alice H160, 117.7 M)` | `PGASFeePaid` 13 244 263 | Alice PGAS +117.7 M: she is mapped, so the precompile credits her own account |

The first two rows and the fifth come from one-off probes run while finding
the cause (an earlier version of the check script, and a short script against
a key funded by `Assets.transfer_keep_alive`). The committed
`check-identity.mjs` repeats the validate rows on every run. No transaction in
M2 touched the DOT↔PGAS pool (no `asset` option, no swap event).

**Conclusion.** "Sign once, play with no prompt and no native token" holds,
and needs no pool: one product-account prompt, then silent session calls.
"No fee" does not hold: every call burns 13–25 M PGAS (more for heavy turns,
section 8), and every new storage item takes 206.4 M. The cheapest design that
avoids the pool is the as-built flow in section 7.4: all transactions on V1
(product account through the host with `txExtVersion: 1`, session key with
polkadot-api 3 `getVerifyMultiSignatureTxCreator`), the session funded by
`Assets.transfer_keep_alive` to its SS58 account in the setup batch, and the
accept batched with the first game call.

Deviations from the design:

1. **Two-step binding.** `registerSession` only offers; the key must call
   `acceptSession(owner)`. With one step, a player could register someone
   else's account (any plain casual player) as their key: that account would
   play for the attacker and, after a revoke, be burned for good. The accept
   costs no extra prompt (it is batched with the first game call).
2. **`resolve` reverts** `InvalidSession(account)` and returns only the
   player. The design returned `(player, kind)`. A reverting `resolve` makes
   fail-closed (Q3) the default: a mode cannot forget to check `kind`.
   Clients use `sessionOf` and `keyOf`. An unknown account resolves to itself
   (the design's `Direct`), as the brief asked.
3. **Expiry in unix seconds** (`block.timestamp`), not blocks. Paseo Next
   makes a block every 2.0 s (measured over 1 000 blocks); block times change.
4. **Storage.** Two records, each one 32-byte word at a fixed key:
   `KEY[session] = (owner, expiresAt, revoked)` (never deleted; this is the
   burned set) and `OWNER[player] = (session, expiresAt, state)`. `resolve`
   reads one item. pallet-revive keys `set_storage(32-byte slice)` as a
   *variable* key and `set_storage_or_clear` as a *fixed* key, which are
   different items; version 1 mixed them, so revoke did not delete. MockHost
   cannot see this. Version 0 cleared with an empty value, which keeps the
   item and its deposit.
5. **Personhood is a stub.** `rankedIdentity` returns `(resolve(account), 0,
   0)`. There is no context, tier mask, `personhoodOf`, `setContext`, or
   `setAcceptedTiers`. Storage domains 4 and up are kept. Adding personhood
   means a new Identity version (players re-register; sessions last at most
   7 days anyway) or a separate contract that calls `resolve` and then the
   precompile. The ranked M2 success items (tier mask, precompile failure
   tests) are not built.
6. **Events.** `SessionOffered` is new. `SessionRegistered` is emitted at
   accept. `MaxTtlSet(uint64)` replaces `ConfigChanged`.
7. **Setup batch.** Not all-Revive: on V1 it does not need to be, and the
   precompile path loses funds (fee model point 2).
8. **CDM version 2.** Versions 0 and 1 are dead (table above).

Open problems found in M2:

- **Host signing on V1 is not tested.** product-sdk's host transaction creator
  takes `txExtVersion` (`packages/host/src/tx-creator.ts`; default 0 in
  `accounts.ts` `getProductAccountSigner`). A product account that holds only
  PGAS cannot pay a V0 transaction at all. M5 must sign the setup batch with
  `txExtVersion: 1` and test it in a real host.
- **The web client** (polkadot-api 2, v4 transactions) must move to
  polkadot-api 3 general V1 transactions for the session key (M5).
- **Upstream docs are stale.** `gaming-retreat-2026`
  `.claude/skills/session-autosigning` (pgas.md, registry-sessions.md) still
  says ChargePGAS covers v4 Revive calls only, that the setup batch must be
  all-Revive, and that a precompile transfer auto-maps the session key. All
  three are wrong on runtime 3004000.
- **Key records are permanent.** Each session ever bound locks 206.4 M PGAS
  for good. Deleting a record after expiry would let a burned key bind again;
  not done.
- **No silent logout.** Only the player can revoke (one prompt). A
  self-revoke by the session key is a possible addition.
- **Test PGAS is scarce.** //Alice held 3.12 G PGAS at the start (not the
  ~10 G expected), and 0.17 G after M2: 1 G went to the fallback account in
  the V0 run, the rest to deposits in the three Identity versions and probes,
  and fees. No dev account has more. M3's live checks need a PGAS source
  that is not the pool (a personhood claim).
- Leftover state: versions 0 and 1 keep Alice's old owner record and two
  burned keys. They are unreferenced.

### M3. Arena and Ranked modes

Success:

- Native end-to-end tests equal to today's (`e2e_full_game_lifecycle_to_defeat`
  and the ranked tests), now with Identity mocked.
- Ranked ghosts never come from Arena games (test).
- On Paseo Next: a full casual run signed only by a session key with zero fee;
  `BattleReported` replays in a script from chain data alone.
- Dry-run weights recorded for the calls in section 8, side by side with arena
  v2. `submitTurn` proof size is not higher than arena v2's.
- Ranked start succeeds for a bound account, after `peopl.paseo` allowlists
  OAB (external dependency, 4.3). If that is still blocked, record it and
  test with MockHost only.

### M3 status (2026-10-20)

Done on branch `update/m3-arena` (from `update/oct-2026` at `5524574`; not
merged). Casual Arena only: Ranked, personhood, Records, leaderboards, and
badges are on hold (priority note above). Deployed on Paseo Next by the cdm
`paseo` account (H160 `0x704ead03a0a7c8b06c6ebbde97934adc24f9f5f7`). That
account owns the `@oab/arena` name in the CDM registry, so //Alice cannot
publish a new version of it. //Alice played the live games.

| Item | Value |
| --- | --- |
| `@oab/arena` version 3 casual (`arena/`) | `0x2937aC2a421BecA60370994BAdf503529bF47650`, **CDM version 4**, 120 250-byte blob, metadata `bafk2bzacebvkyis3ne73t44pwgui5xbfler3yglitx32lhtb4k6beshkks5jw` |
| Wired to (exact CDM versions) | `@oab/identity` 2 `0x7b41…7FBA`, `@oab/content` 0 `0xd9Cb…F642`, `@oab/engine` 0 `0xb63d…CCb0` (`setDeps`, block 2057798) |
| Cached sets | 0, 1, 2 (blocks 2057799–2057805): 5, 6, 6 pages; 10 house rounds each; hashes equal Content `setHash` |
| Do not use | CDM version 3 `0xf65d6819811d71415f78348302a02261322296ef` (same code; its Bulletin metadata upload timed out, so `cdm i` cannot fetch it; never wired) |
| `oab-protocol` | new `ModeGame`, `BattleReport` |
| Scripts | `scripts/m3/wire-arena.mjs`, `scripts/m3/play-arena.mjs`, `scripts/m3/mutate-arena.py`; evidence in `scripts/m3/evidence/` |

Checks that passed:

- 15 native tests (`arena/src/tests.rs`, `TestHost` answers Identity and
  Content by selector as the deployed M1 and M2 contracts do): a full game to
  game over, end, and a new game in the same item; every reported battle
  replays to the reported result from the event and the cached bundle; a
  session key plays for its owner and the seeds are the owner's; an expired
  or revoked key reverts `InvalidSession(key)` and writes nothing; no Identity
  means no game; an empty bracket fights a house ghost; a set without house
  ghosts gives an empty board (arena v2); thin brackets mix in house ghosts,
  full ones do not; a bracket keeps the 10 newest boards; an invalid turn
  reverts with the engine's `GameError` and writes nothing; `cacheSet`
  accepts only the pinned bundle; every item type fits 416 bytes at its
  maximum, and no item written by real play is larger; the golden-vector
  corpus gives the engine's (so arena v2's) seeds, states, opponents, and
  results turn by turn.
- Mutations (each makes tests fail): no house ghosts in thin brackets; no
  drop of the oldest board; player = `msg.sender`; start seed from
  `msg.sender`; no hash check at cache; house round not clamped; ghost
  written before the turn is checked; battle seed from the wrong context
  (`scripts/m3/evidence/mutations-2026-10-20.txt`).
- `cargo test --workspace` passes (243 tests). `eth_getCode` of both arena
  addresses equals the local blob.
- Live (`play-arena.mjs`, blocks 2057824–2057890, all checks ok):
  - //Alice, V0: `startGame(0)` → 6 turns → game over (2 wins, 0 lives) →
    `endGame`. The game pins Content's set hash.
  - Every battle of that game replays through `@oab/engine.replayBattle`
    (dry-run) from the `BattleReported` data and `getSetBundle` alone, and
    ends in the reported result.
  - A fresh key: Alice funds it (`Assets.transfer_keep_alive` PGAS + native)
    and offers it; the key accepts, starts **Alice's** game, plays 9 turns to
    game over (turn 1 as a v5 general transaction on pipeline V1), and ends
    it. Every report names Alice. Alice revokes the key; its next
    `startGame` dry-run reverts `InvalidSession(key)`. The key was drained
    back to Alice.

Measured (Paseo Next runtime 3004000, dry-run at the best block,
`weight_required`, same caller //Alice, set 0):

| Call | ref_time | proof_size | Fee (planck) | Deposit (planck) |
| --- | --- | --- | --- | --- |
| arena v2 `startGame` | 32 600 652 201 | 661 372 | 69.5 M (tx) | |
| **v3 `startGame`** | 13 730 475 803 | **260 897** | 34.2 M | 18.7 M (game item rewrite) |
| arena v2 `submitTurn` (empty action, round 1) | 37 680 917 221 | 678 693 | | |
| **v3 `submitTurn`**, rounds 1–9 | 18.6 G – 27.5 G | **267 874 – 267 954** | 38.1 M each | 0.3–2.7 M on an existing bracket; 204.6–208.2 M when the turn creates a bracket item |
| v3 `submitTurn`, V1 (session key) | 19 046 725 777 | 267 922 | **38 100 790 PGAS** (`PGASFeePaid`; key native unchanged) | 1.5 M |
| v3 `endGame` | 2 163 536 213 | 194 288 | 26.7 M | |
| v3 `cacheSet` (sets 0, 1, 2; admin, once) | 37.9 G / 45.4 G / 46.6 G | 1.30 M / 1.51 M / 1.53 M | | 3.5–3.8 G |
| `@oab/engine.replayBattle` (6 battles) | 10.6 G – 21.9 G | 98 014 | | |

What the M3 numbers say:

- `submitTurn` proof size is **2.5 times lower** than arena v2 (268 KB vs
  679 KB), and ref time about half. The proof is the 120 KB arena code, the
  7 KB Identity code, and about 14 storage items; it does not grow with the
  round. The 6-page set cache works as section 8 predicted.
- One turn's fee is 38.1 M, the same on V0 (native) and V1 (PGAS). It is in
  the 37–81 M range Q12 estimated.
- **New ghost brackets dominate the cost of a fresh deployment.** A turn
  that is the first in its bracket `(set, round, wins, lives)` creates an
  item: about 206 M deposit, paid by the signer (in PGAS for a V1 session
  key). Part A paid it on every turn; part B, which followed the same path,
  paid it only from round 3. This cost falls as brackets fill. Q12 below is
  updated.
- Observed, not explained: before its V1 turn, the key's PGAS fell by 18.7 M
  (120 M funded, 101.3 M left), equal to the `startGame` deposit, although
  that call was a V0 transaction. The accept deposit came from native.

Deviations from the design:

1. **Folder and package.** The new contract is `arena/` (crate `oab-arena`,
   CDM `@oab/arena`). `contract/` stays arena v2 source (the M1 oracle
   compiles it). Both crates name `@oab/arena` in `package.metadata.cdm`.
2. **No `oab-mode-kit`.** With one mode, the helpers live in the arena. Build
   the kit when Ranked starts. The `abi_import!` blocks are in the arena too
   (`oab-protocol` has no SDK dependency).
3. **Set cache is admin-filled and paged.** `cacheSet` must run before
   `setAllowedSet`; `startGame` never calls Content (no cold-cache path). The
   allow flag lives in the set's meta item, and the draining flag in the
   config item, to save reads.
4. **House ghosts are read, not copied into brackets (Q1).** A thin bracket
   (fewer than 3 boards) draws from its boards plus the round's house boards.
   The cache keeps at most 10 house boards per round, rounds 1–32; a round
   without boards takes the nearest lower (else higher) round; later rounds
   use the last round. A set with no house ghosts behaves as arena v2.
5. **`setDeps` takes the engine contract address too** (stored, never called;
   for clients and auditors). No `records` address yet.
6. **Not built (on hold with Records):** `RUN`, `RUN_REPORTED`, `getRun`,
   `retryReport`, `modeId`. `endGame` returns `reported = false`. Run ids
   start at 1.
7. **Errors.** `InvalidSession(address)` when Identity reverts,
   `IdentityUnavailable` for any other Identity failure, plus `NotAdmin`,
   `NotConfigured`, `AlreadyCached`, `BadContent`, `ContentUnavailable`,
   `BadInput`, `InvalidTurn(bytes)`, `ItemTooLarge`.
8. **The game item is never deleted.** `endGame` and `abandonGame` write
   `None`, so a returning player pays no new item deposit.
9. **CDM version 4**, not 3 (version 3's metadata upload timed out).

Open problems found in M3:

- **Bracket deposits on fresh pools** (above). Options: the admin seeds the
  common early brackets at deploy; coarser brackets; or the contract keeps
  the pools in fewer, larger-key items. Decide with Q12.
- **"Zero fee" does not hold** (as M2 found): a session turn burns 38.1 M
  PGAS plus deposits. A full casual run signed only by a session key on V1
  was not done: //Alice has too little PGAS (0.17 G at the start, 0.09 G
  now). One V1 turn was done; the other session-key calls used V0 with a
  native fee.
- **Host signing on V1 and the web client** are still M5 work (M2 open
  problems).
- `web/cdm.json` pins `@oab/arena` version 2 with dependency `latest`; a
  `cdm i` in `web/` now installs version 4 and breaks the current frontend.
  Do not run it before M5.
- Arena v2 dry-run used an empty action and Alice's v2 game; the M3 turns
  played cards. Proof size does not depend much on the action, ref time does.

### M4. Records

Success:

- Report from a non-listed address reverts; a repeated `run_id` is ignored.
- Season 0 rules give the same badges as `qualifying_badges` today.
- A failed report leaves the game ended; `retryReport` and `pull` both work
  once.
- Badge mints go to queued own purses; a non-empty purse is skipped; no
  purse → pending → `retryBadges` mints after `addBadgePurses`.
- `withdraw` and `nominateCollectionOwner` work (on chain, small amounts).
- `endGame` dry-run weight recorded with 0, 1, and 2 badges.

### M5. Frontend

Success:

- `web/cdm.json` holds all new packages. Registry sessions replace proxy
  sessions. One prompt to start, no prompt and no fee per turn, checked in a
  host.
- Replay uses `ENGINE_BUNDLES[engine_version]` and the event's player board.
- Leaderboard and badges read Records. Badges show from own purses.
- `npm test` and the codec fixture tests pass.

### M5 status (2026-10-20)

Done on branch `update/m5-frontend` (from `update/oct-2026` at `02be74e`;
not merged, not deployed). Casual play only: ranked, personhood,
leaderboard, badges, and Records are on hold.

| Item | State |
| --- | --- |
| `web/cdm.json` | `@oab/arena` 4, `@oab/identity` 2, `@oab/content` 0, pinned (`cdm i -n paseo @oab/arena:4 ...`) |
| Casual game, normal signing (V0, native fee) | Works in the `@parity/host-api-test-sdk` host against Paseo Next: start, turns to game over, `endGame`, `abandonGame` |
| Replay | From the `BattleReported` SCALE report with `oab_engine::replay_battle` in the WASM build (`replay_report`). It refuses another engine version and a result the replay does not reach. The card data is the arena's `getSetBundle`, checked against the game's set hash |
| Registry sessions | Built (`web/src/contract/registrySession.ts`), unit-tested, V1 transactions validated free (`web/scripts/check-v1-session.mjs`). Not run live: see below |
| Ranked, leaderboard, badges UI | Removed (pages, panel, routes, links). `personhood.ts` and the badge decoders stay for M4 |

Checks: `npm test` 153 passed; e2e 5 passed, 1 skipped (the gated session
run); `npm run build`; replay perf at 1x CPU: 60 FPS, 7 % busy, 13.8 MB
peak (before M5: 60 FPS, 7.6 %, 13.9 MB).

Deviations:

1. `ENGINE_BUNDLES[engine_version]` is one WASM build that knows its
   `engine_version()`. It refuses other versions with a reload message. A
   second engine version needs a second build.
2. Dry-runs of game calls use the player as origin, not the session key.
   Before the key accepts, `resolve(key)` gives the key itself, so a dry-run
   as the key would read the wrong game.
3. The proxy session code stays (`SESSION_KIND` in `web/src/contract/index.ts`)
   until a registry session runs in a real host.

Blocked or open:

- **No live registry-session run.** The test host signs every host
  transaction as a classic v4 (V0) and ignores `txExtVersion`
  (`@parity/host-api-test-sdk` 0.17). A full run needs about 1.8 G PGAS
  (1.5 G budget, 206.4 M owner record, fees); //Alice holds 0.055 G. A real
  host with a personhood claim is the next check.
- **Storage deposits are taken in PGAS on V0 too.** When the origin holds
  PGAS, the deposit is taken in PGAS even on a classic V0 transaction with a
  native fee. Two `startGame` calls by //Alice (fixture capture, blocks
  2058209 and 2058217) each took 18.7 M PGAS, with no Assets event. This
  explains the M3 "observed, not explained" note.

### M6. Retire arena v2

Success:

- The deployed frontend has no reference to arena v2.
- `docs/CURRENT_ARCHITECTURE.md`, `agents/ARCHITECTURE.md`,
  `contract/README.md`, `docs/NFT_DESIGN.md`, and `BETA_RELEASE_PLAN.md`
  describe the new contracts.
- The client offers proxy removal to players who still have one.

## 15. Where the direction meets the tooling

These are places where the agreed direction and the code or tools pull apart.
The design above picks one answer for each. Shawn should confirm.

1. **Per-game engine version vs a linked engine.** The direction says each
   game stores its engine version and finishes on it. With the engine linked
   into the mode (the agreed nuance), one mode deployment holds exactly one
   engine version. So "finish on the old version" means "finish on the old
   mode deployment", and every engine upgrade is a mode redeploy (flow 7.6).
   Linking two engine versions into one mode would need two renamed copies of
   the crates and about twice the code size. We do not recommend it.
2. **CDM run-time lookup is "latest" only.** `cdm_lookup()` calls
   `getAddress(string)`, which returns the latest version, and it panics on
   failure. The registry has `getAddressAtVersion`, but the macro does not use
   it. Pinning engine or dependency versions at run time is not supported, and
   the lookup costs a sub-call. The design stores addresses (section 11).
3. **`#[slot(raw)]`.** At `d5991131` the form is `#[slot(raw = KEY)]`; a bare
   `#[slot(raw)]` is a parse error (`pvm-contract-macros` tests). The SDK
   provides only the slot. The EIP-1967 example
   (`crates/pvm-contract-macros/tests/native_proxy_slot.rs`) stores the
   implementation address but does not forward calls. A forwarding proxy
   (fallback + `delegate_call`) would be our code and is untested. The host
   API has no `set_code_hash`.
4. **No reentrancy guard macro.** The SDK relies on pallet-revive's default
   (reentry denied) and offers `allow_reentry()` per call. That is enough for
   this design.
5. **Registry sessions have no expiry in the reference.** Expiry and burned
   keys are our extension (4.3).
6. **The free-call claim is from July.** `ChargePGAS` covering Revive calls
   and all-Revive batches was checked live on 2026-07-14 by the skill authors.
   M2 checked it again: since 2026-10-08 only v5 general transactions on
   extension pipeline V1 pay in PGAS (any call), and the fee is burned PGAS,
   not zero (M2 status).
7. **Records keyed by alias.** Casual players without personhood have no
   alias, so Records cannot rank them. The design ignores alias-less facts.
8. **Badges per person.** Keying by alias makes badges one per person. The
   current decision is one per account (`docs/NFT_DESIGN.md` §8 item 7).
9. **Collection 30 cannot move.** Arena v2 has no owner handover, so Records
   needs a new collection.

## 16. Open questions

**Decided by Shawn (2026-10-20):**

- **Q1:** house ghosts. Each set in Content publishes designer-made ghost
  boards; a new mode deployment seeds its pools from them.
- **Q2:** OAB's own session registry (in Identity), with expiry and burned
  keys.
- **Q3:** revert. A casual call fails when Identity fails; the contract never
  guesses the player.
- **Q11:** set ids are auto-assigned by Content.

Q4–Q10 and Q13–Q14 are on hold with ranked play and Records. Q12 has a
proposal from the M2 measurement (below); Shawn decides.

- **Q1. Ghost pools after an engine upgrade.** A new mode deployment starts
  with empty pools. Options: (a) accept it; (b) on a bracket miss, read the
  previous deployment's bracket through a view (adds a sub-call only on a
  miss); (c) admin seeds pools at deploy. Ghosts are engine-free data
  (`GhostBoardUnit`), so (b) and (c) are safe when the set is the same.
- **Q2. Own registry or shared registry?** Identity embeds an OAB registry.
  A shared ecosystem registry (bloom's player registry, named in
  `reference-contract.md`) would give one session across games, but OAB
  would lose control of expiry and burn rules.
- **Q3. Casual when Identity fails.** This design reverts. Should casual
  instead treat `msg.sender` as the player?
- **Q4. Badges per person (alias) or per account?** The direction says alias.
  `docs/NFT_DESIGN.md` §8 item 7 recorded "per account" as the integrator's
  request.
- **Q5. Should casual runs reach Records at all?** This design reports them
  and Records ignores them. Option: do not report, save the sub-call.
- **Q6. Ranked cold start.** A sparse ranked pool gives free wins against
  empty boards. Options: house ghosts published with the set in Content; a
  fallback to the casual pool (reopens bot planting); a minimum pool size
  before ranked opens per set.
- **Q7. Abandon and reroll in ranked.** A player can abandon bad starting
  bags until a good one comes. Today abandoned ranked runs are not counted
  (`contract/src/main.rs` 1857–1879). Count an abandon as a loss? Limit one
  active ranked run per alias?
- **Q8. Records upgrades.** Immutable code plus collection handover (this
  design), or an EIP-1967 proxy so storage and the address survive? The proxy
  is not built or tested in this SDK (section 15 item 3). Records is off the
  hot path, so the extra `delegate_call` costs little.
- **Q9. Seasons and tournaments.** Seasons as Records time windows (this
  design), and tournaments as a mode with its own funds. Bring tournaments
  back at all (`BETA_RELEASE_PLAN.md` "Pallet-era features")?
- **Q10. Constructed ownership proof.** Signed purse claim (recommended),
  escrow, or off chain only? Needs a check that a host can sign with a purse
  key.
- **Q11. Set ids.** Auto-assigned (this design, stops squatting) or chosen by
  the curator?
- **Q12. Session storage deposits.** With registry sessions, the session key
  is the origin and pays storage deposits in PGAS (`registry-sessions.md`
  §4). The budget per session must cover them. What budget?

  **Proposal from M2 (measured, section 8 and M2 status):** fund each
  session with **1.5 G PGAS** (3 % of one 50 G personhood claim) in the setup
  batch, and top it up in a later setup-style batch when it falls below
  0.4 G. The parts:

  | Cost | Paid by | PGAS planck |
  | --- | --- | --- |
  | Owner record (first session only; 10 % back on revoke) | product account | 206.4 M |
  | Setup batch fee | product account | 21 M |
  | Key record (at accept; never refunded) | session | 206.4 M |
  | Accept + first call fee | session | 24 M |
  | Each new storage item a mode creates for the player | session | 206.4 M |
  | Each call fee, small call (measured) | session | 14–16 M |
  | Each turn fee, mode turn at 250–750 KB proof (estimated from fee details, not measured) | session | 37–81 M |

  1.5 G covers the key record and accept (0.23 G), two new game items
  (0.41 G), and about 20 turns at 40 M (0.8 G). Recheck after M3 measures a
  real `submitTurn`. Two levers keep the budget small: M3 keeps per-player
  items few and overwrites them in place (an overwrite of the same size adds
  no deposit), and the setup batch can include a product-account
  `mode.initPlayer()` call so that the product account, not the session,
  pays the one-time item deposits.

  **Update from M3 (measured, [M3 status](#m3-status-2026-10-20)).** A turn
  costs 38.1 M fee (not 37–81 M: the proof is 268 KB). The Arena keeps one
  game item per player and overwrites it, so a returning player pays no new
  game deposit (18.7 M byte change at most). The new cost is the **ghost
  bracket**: the first turn in a bracket creates an item, about 206 M, paid
  by the signer. On a fresh deployment most early turns do this, so a 10-turn
  run can cost about 2.4 G (10 × (38 M + 206 M)); on a warm deployment it
  costs about 0.4 G. 1.5 G holds only when brackets exist. Choose one: a
  larger budget (3 G) until pools fill; admin-seeded early brackets; or let
  the mode pay bracket deposits (needs a funded contract). Shawn decides.
- **Q13. Mainnet governance body.** Multisig, OpenGov origin, or a PCF-run
  key?
- **Q14. Derived fallback for badges.** Keep it off (badges wait for a purse)
  or on (every earned badge mints at once, to a keyless key)?
