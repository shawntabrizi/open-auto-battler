# `@oab/arena` version 3 — casual mode (PolkaVM)

The casual game of arena v2 (retired) on the layered contracts
(`docs/CONTRACT_ARCHITECTURE.md` sections 4.4, 4.4.1, 7.1; as-built notes in
section 14, "M3 status"). The rules and the flow do not change: start a game
on a set, play shop turns, fight a ghost of your bracket, keep lives and wins,
reach game over, end the game.

- **The engine is linked.** `oab-engine` runs `startGame` and every
  `submitTurn` in this contract. The arena never calls `@oab/engine`.
  `engineVersion()` is the linked `ENGINE_VERSION`.
- **Identity resolves every game call.** `@oab/identity.resolve(msg.sender)`
  gives the player. A live session key plays for its owner. A plain account
  plays as itself. A dead key, or a failed Identity call, reverts (Q3). Seeds
  come from the player, not from the signer.
- **Content is read once per set.** The admin calls `cacheSet(id)`. It reads
  `getSetBundle`, `setHash`, and `getHouseGhosts` from `@oab/content`, checks
  that keccak256 of the bundle equals `setHash`, and stores the bundle in
  416-byte pages and the house ghosts by round. Turns read only this cache.
- **House ghosts (Q1).** A bracket with fewer than 3 boards is thin. Then the
  house ghosts of the round join the draw, so an empty bracket is not a free
  win. Rounds after the last house round use the last house round.
- **Every failure reverts** with a typed error.

## Storage

SCALE values at `keccak256(domain ++ key)`, written with `set_storage` only
(variable keys; never mixed with the fixed-key calls, see the Identity README).
Every write checks pallet-revive's 416-byte item limit (`ItemTooLarge`). The
test `every_storage_item_fits_416_bytes_at_its_maximum` encodes each type at
its largest value.

| Domain | Key | Value | Largest |
| --- | --- | --- | --- |
| 0 admin | () | `[u8; 20]` | 20 B |
| 1 config | () | `Config { identity, content, engine: [u8;20], draining: bool }` | 61 B |
| 2 next run | () | `u64` | 8 B |
| 3 set meta | set id | `SetMeta { hash, len: u32, pages: u8, house_rounds: u8, allowed: bool }` | 39 B |
| 4 set page | set id ++ page | ≤ 416 bytes of SCALE `SetBundle` (sets 0–2: 5–6 pages) | 416 B |
| 5 house | set id ++ round | `Vec<Vec<GhostBoardUnit>>`, ≤ 10 boards of ≤ 5 units | 311 B |
| 6 ghost | set ++ round ++ wins ++ lives | `Vec<Vec<GhostBoardUnit>>`, the 10 newest boards | 311 B |
| 7 game | player | `Option<ModeGame>` (`oab-protocol`) | 260 B |

A game item is never deleted. `endGame` and `abandonGame` write `None`, so a
returning player overwrites the item and pays no new item deposit (Q12).

## ABI

| Function | Notes |
| --- | --- |
| `startGame(uint16 setId) returns (uint64 runId)` | Player or key. Reverts `Draining`, `InvalidSession(address)`, `IdentityUnavailable`, `NotConfigured`, `GameActive`, `SetUnavailable`, `SetNotAllowed` |
| `submitTurn(bytes action) returns (uint64 battleSeed)` | SCALE `CommitTurnAction`. Reverts `NoGame`, `WrongPhase`, `BadInput`, `InvalidTurn(bytes)` (SCALE `GameError`) |
| `endGame() returns (bool reported)` | Completed games only. The final board joins its bracket. `reported` is false until Records (M4) |
| `abandonGame()` | Any phase |
| `getGame(address player) view returns (bytes)` | SCALE `ModeGame` or empty |
| `getSetBundle(uint16) view returns (bytes)` | The cached SCALE `SetBundle` (for replay) |
| `setInfo(uint16) view returns (bytes32 hash, uint32 len, uint8 pages, uint8 houseRounds, bool allowed)` | |
| `getGhosts(uint16 set, uint8 round, uint8 wins, uint8 lives) view returns (bytes)` | One bracket |
| `getHouseGhosts(uint16 set, uint8 round) view returns (bytes)` | The house boards a thin bracket adds |
| `engineVersion() pure returns (uint32)`, `deps() view returns (address identity, address content, address engine, bool draining)`, `nextRunId()`, `adminAddress()` | |
| `setDeps(address identity, address content, address engine)` | Admin |
| `cacheSet(uint16)` | Admin. Reverts `AlreadyCached`, `SetUnavailable`, `BadContent`, `ContentUnavailable` |
| `setAllowedSet(uint16, bool)`, `setDraining(bool)` | Admin |

Events: `GameStarted(address indexed player, uint64 runId, uint16 setId, uint32 engineVersion, bytes32 setHash)`,
`BattleReported(address indexed player, uint64 indexed runId, bytes report)` (SCALE `BattleReport`),
`GameEnded(address indexed player, uint64 indexed runId, uint8 wins, uint8 lives, uint8 rounds, bool reported)`,
`GameAbandoned(address indexed player, uint64 indexed runId)`, `DepsSet`, `SetCached`, `SetAllowed`, `DrainingSet`.

**Replay (section 7.7).** `BattleReport { engine_version, set_id, round,
result, wins, lives, battle_seed, player_board, opponent }` holds everything
except the card data. `oab_engine::replay_battle(player_board, opponent,
battle_seed, bundle.card_pool(), 5)` gives the combat events, with `bundle`
from `getSetBundle(set_id)` (or Content). `@oab/engine.replayBattle` does the
same on chain.

## Build and test

```bash
cd arena && cargo build --release   # target/release/oab-arena.polkavm (~120 KB) + .abi.json
# native tests, from the repo root:
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path arena/Cargo.toml --features std
```

The tests use a `TestHost` that answers the Identity and Content calls by
selector, the way the deployed M1 and M2 contracts answer. They cover a full
game to game over and replay, a session key that plays for its owner, expired
and revoked keys, house ghosts, the bracket limit, invalid turns, the item
size limit, the set cache checks, and the golden-vector corpus (the arena
gives the engine's, and so arena v2's, seeds, states, and results).

## Deploy and live check (Paseo Next)

```bash
cd arena && cdm deploy -n paseo && cdm i -n paseo @oab/arena   # signer: the cdm paseo account (owns @oab/arena)
cd ../scripts/m2 && npm install                                 # the M3 scripts reuse scripts/m2/chain.mjs
cd ../..
OAB_SIGNER_MNEMONIC="<deployer phrase>" node scripts/m3/wire-arena.mjs <arena> --out /tmp/wire.json
node scripts/m1/check-code.mjs <arena> arena/target/release/oab-arena.polkavm
node scripts/m3/play-arena.mjs <arena> --out /tmp/play.json --state /tmp/key.json
```

`wire-arena.mjs` reads the Identity, Content, and engine addresses from the
CDM registry at exact versions (`@oab/identity` 2, `@oab/content` 0,
`@oab/engine` 0), checks that the engine versions match, then calls
`setDeps`, `cacheSet`, and `setAllowedSet` for sets 0, 1, 2. It skips steps
that are done.

`play-arena.mjs` plays one full game as //Alice (classic V0 transactions,
native fee), lets a fresh session key play a second game for Alice (one turn
on V1 with the fee in PGAS), revokes the key, replays every battle through
`@oab/engine.replayBattle`, and dry-runs arena v2 for comparison.
