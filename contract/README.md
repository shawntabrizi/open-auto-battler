# OAB Smart Contract (PolkaVM)

The OAB arena game runs as a PolkaVM smart contract on Polkadot Asset Hub
(`pallet-revive`). It is built with the
[`cargo-pvm-contract` / `pvm-contract-sdk`](https://github.com/paritytech/cargo-pvm-contract)
framework (git `main`) for automatic dispatch, ABI generation, and CDM metadata.

The frontend talks to it through the **Polkadot Product SDK**
(`@parity/product-sdk-contracts` + `@parity/product-sdk-chain-client`), which
routes every chain call through the host — no direct WebSocket, no Ethereum
JSON-RPC proxy.

## Toolchain

The `contract/rust-toolchain.toml` pins the nightly the PolkaVM target needs
(`rust-src` builds `core`/`std` from source for `riscv64…-polkavm`):

```toml
[toolchain]
channel = "nightly-2026-02-01"
components = ["rust-src"]
```

- **Rust** — installed automatically from the pin above.
- **`cdm` CLI** — the contract build/deploy/install tool. Install per its
  upstream `install.sh`; `cdm --version` should report ≥ 0.1.0.
- **`playground` CLI** — for deploying the frontend to Bulletin + DotNS.

No sibling `contract-dependency-manager` clone, no `bun`, and no local
Preview-Network zombienet are required any more — those were part of the
pre-SDK prototype loop and have been retired.

## Build the contract

```bash
cd contract
cargo build --release          # build.rs (PvmBuilder) links the PolkaVM blob + ABI
# or, equivalently, via the CLI:
# cargo pvm-contract build
```

Outputs (under `contract/target/release/`):
- `oab-contract.polkavm` — PolkaVM bytecode (~112 KB)
- `oab-contract.abi.json` — Solidity-style ABI (camelCase selectors)

The `build.rs` recursion guard means an outer host build re-enters the PVM
build once; set `CARGO_PVM_CONTRACT_INTERNAL=1` to skip the PVM step when you
only want a host compile (e.g. for fast test iteration — see below).

## Native tests

The contract compiles as a normal std crate off the PolkaVM target, so its
logic is unit-tested natively against a `MockHost` — no deployment, no node:

```bash
cd contract
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --features std
```

This drives the real contract methods (`startGame`/`submitTurn`/`endGame`/…)
through the arena flow. The `contract/tests-native/` crate additionally
mirrors the game-engine logic for parity with the original pallet behaviour.

> Note: `contract/.cargo/config.toml` pins the riscv target for the on-chain
> build, so run native tests with a host target — the `CARGO_PVM_CONTRACT_INTERNAL=1
> cargo test --features std` invocation above builds for the host by default
> when that config is not forcing riscv. If a `cargo test` picks up the riscv
> target, temporarily move `.cargo/config.toml` aside.

## Deploy (paseo)

Deployment uses the standard `cdm` flow (same as the Rock-Paper-Scissors
reference app). It requires a funded paseo Asset Hub account (faucet) and a
one-time account mapping:

```bash
cdm account map -n paseo              # once per deploy account
cdm deploy -n paseo                   # from contract/: deploys + registers @oab/arena
(cd ../web && cdm i -n paseo @oab/arena)  # refresh web/cdm.json (registry + address + ABI)
cdm i -n paseo @oab/arena             # refresh contract/cdm.json
```

Deploys need PAS on Asset Hub and a Bulletin allowance (for the metadata);
`cdm account bal -n paseo` shows both.

`cdm install` writes the registry-pointer manifest the frontend consumes at
runtime; `web/src/contract/index.ts` resolves the live address/ABI from the
on-chain CDM registry via `ContractManager.fromLiveClient` (a redeploy is
picked up without shipping a new `cdm.json`). It also still accepts the legacy
inline `@dotdm/cdm` manifest for backward compatibility.

After the contract is deployed, register the cards and sets as the deployer
(the contract admin), then check the deployment end to end:

```bash
(cd ../register-cards && cargo run -- --dump /tmp/cards-dump.json)
cd ../web
OAB_MNEMONIC="<deployer phrase>" bun run scripts/register-cards.ts /tmp/cards-dump.json
DUMP=/tmp/cards-dump.json node scripts/e2e-onchain.mjs
```

Then, as the admin: `setPersonhoodContext(<context>)` (value below), fund the
arena, and `initAchievements()` (see Achievement badges).

Then deploy the frontend to a host (`playground deploy`) so it can reach Asset
Hub through the Polkadot host.

## Contract API

Rust method names are exposed through the generated ABI as `camelCase`. All
game data is SCALE-encoded inside ABI `bytes` parameters.

| Function                     | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `registerCard(bytes)`        | Admin: store a card definition                  |
| `registerSet(uint16, bytes)` | Admin: store a card set                         |
| `startGame(uint16)`          | Start a casual arena game (set ID); open to anyone |
| `startRankedGame(uint16)`    | Start a ranked game; caller needs personhood Lite or Full |
| `submitTurn(bytes)`          | Submit shop actions and resolve battle on-chain |
| `getGameState()`             | Read current game state (view call)             |
| `abandonGame()`              | Forfeit the current game                        |
| `endGame()`                  | Finalize a completed game                       |
| `getCard(uint16)`            | Read a card definition                          |
| `getSet(uint16)`             | Read a card set                                 |
| `getRankedAlias()`           | Personhood alias of the caller's ranked game (zero if casual/none) |
| `setPersonhoodContext(bytes32)` | Admin: set the personhood context for aliases |
| `getPersonhoodContext()`     | Read the configured context (zero if unset)     |
| `getLeaderboard(uint16, uint32, uint32)` | SCALE `Vec<LeaderboardEntry>` for a set, best first (set ID, offset, limit) |
| `getPlayerRank(uint16, bytes32)` | 1-based place of an alias on a set's board; 0 if absent |
| `getBestRun(uint16, bytes32)` | SCALE `LeaderboardEntry` of an alias's best run on a set; empty if none |
| `initAchievements()`         | Admin, once: create the arena-owned "OAB Achievements" Scarcity collection and its badge items; returns the collection id |
| `getBadgeConfig()`           | SCALE `BadgeConfig { collection: u32, items: Vec<u32> }`; empty before init |
| `getBadges(address)`         | SCALE `Vec<BadgeRecord>` of a player's badges (`token: None` = pending) |
| `claimPendingBadges()`       | Retry the caller's pending badge mints; returns how many minted |

The contract also emits `BadgeMinted` / `BadgePending` from `endGame` and
`claimPendingBadges` (see Achievement badges).

The contract emits a `BattleReported` event after each `submitTurn` with the
battle result and opponent board for client-side replay. The frontend reads it
from the `Revive.ContractEmitted` substrate event in the tx's events list.

## Ranked play and personhood

Casual games (`startGame`) are open to every account. Ranked games
(`startRankedGame`) need personhood **Lite (1) or Full (2)**. The contract
reads it from the individuality personhood precompile at
`0x000000000000000000000000000000000a010000`
(`personhoodStatus(address account, bytes32 context) returns (uint8 status, bytes32 contextAlias)`).

- The ranked identity is the `contextAlias`, not the account. All accounts of
  one person that are bound in the same context share one leaderboard entry.
- The precompile only returns an alias for an account that is bound (pallet
  `AliasAccounts`) in the **same** context the contract queries. One account
  holds one binding at a time. The admin must call `setPersonhoodContext`
  after deploy; until then ranked play is closed.
- Ranked play fails closed: no context, a missing precompile, status None, or
  an unknown tier all make `startRankedGame` return `0`.
- `endGame` of a ranked game records `LeaderboardEntry { alias: [u8; 32],
  set_id: u16, wins: u8, lives: u8, rounds: u8, block: u64 }` (SCALE). The
  contract keeps the best run per (set, alias) and a top-100 board per set,
  ordered by wins, then lives left, then the earlier block. Abandoned and
  casual games never reach the board.

### Personhood context (Paseo Next)

The live arena uses context
`0x51dccb5fc990cce21a58dcecc3334babcea01f0f034567f0d64ca4c423356012`
(set 2026-10-20). It is OAB's product-scoped context for derivation index 0,
built per truapi RFC-0004 / RFC-0024 and the host's `DerivationIndex32`:

```
magic   = blake2b_256("product-account-index")[..28]
suffix  = u32_le(0) ++ magic                       // 32 bytes
context = blake2b_256("product/" ++ "oab-arena.paseo" ++ "/" ++ suffix)
```

`oab-arena.paseo` is the dotNS product id on Paseo (`oab-arena.dot` on
Polkadot, so mainnet needs a new value). Index 0 is the product account the
web app signs with (`derivationIndex: 0` in `web/src/contract/index.ts`), so a
player binds that account as their alias account in this context. The value
matches the product-sdk `productContext` for `oab-arena.paseo` and the
context stored in the live arena (`getPersonhoodContext`).

## Achievement badges

`endGame` of a **ranked** run mints a soulbound badge NFT into the arena-owned
"OAB Achievements" Scarcity collection (id 30 on Paseo Next):

| Badge | Value | Condition |
| ----- | ----- | --------- |
| Victory | 0 | `wins >= 10` |
| Flawless | 1 | `wins >= 10` and no life lost |

- One badge per (account, badge, set), recorded in contract storage. Casual
  runs never earn badges, because the arena pays a deposit (about 0.21 PAS)
  for each badge and casual play is open to unlimited accounts.
- Scarcity holds one NFT per key, so each badge goes to its own derived key:
  `keccak256("oab/badge-purse/" ++ arena ++ player ++ badge ++ set_id_le)[12..]`.
- A failed mint never fails `endGame`. The badge is stored as pending
  (`BadgePending` event), and `claimPendingBadges()` retries it.
- Setup after a deploy: send PAS to the arena's substrate account (its H160
  followed by twelve `0xEE` bytes), then call `initAchievements()` as the
  admin. It reverts with `BadgeSetupFailed()` if anything fails.

Full design and the deployment record: `docs/NFT_DESIGN.md` section 9.

## Project structure

```
contract/
  src/main.rs        # Contract source (pvm-contract-sdk macros; raw host storage
                     # of SCALE game blobs at keccak-derived keys) + native tests
  build.rs           # PvmBuilder: PolkaVM linking + ABI + CDM metadata
  rust-toolchain.toml
  .cargo/config.toml # riscv target + build-std for the on-chain build
  tests-native/      # game-logic parity tests (std)
  Cargo.toml         # deps pinned to cargo-pvm-contract @ df613d48
```

## Storage model

Persistent state is stored as SCALE-encoded blobs via raw host storage
(`self.host().set_storage`/`get_storage`) at keys derived from
`keccak256(domain_prefix ++ key)`. The shared `oab-battle`/`oab-game` engine
types are SCALE (`parity-scale-codec`), so they stay out of the framework's
typed `Mapping`/`Lazy` (Solidity `SolStorage`) layer.
