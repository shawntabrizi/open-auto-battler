# `@oab/identity` — session registry (PolkaVM)

Answers the question every mode asks on every call: which player does this
caller act for? (`docs/CONTRACT_ARCHITECTURE.md` section 4.3, decisions Q2 and
Q3; as-built notes in section 14, "M2 status".)

- **Two signatures bind a session key.** The player (product account) offers
  a key with an expiry: `registerSession(session, expiresAt)`. The key then
  accepts: `acceptSession(owner)`. Only after the accept does the key act for
  the player. Without the accept, a player could bind another person's
  account as their session key, take over its play, and (after a revoke)
  lock that account out for good.
- **`resolve(account)` is the hot path.** One storage read. A live key gives
  its owner. An account that was never a session key gives itself (casual
  play needs no setup). An expired or revoked key **reverts**
  `InvalidSession(account)`: a mode never guesses the player (Q3).
- **Burned keys.** A key that was ever bound keeps its record for good. It
  can never be bound again, and it never plays as itself.
- **One session per player.** A new offer revokes and burns the player's
  bound key at once (rotation). `revokeSession()` burns it too.
- **Expiry** is unix time in seconds (`block.timestamp`), at most `maxTtl()`
  ahead (7 days at deploy; admin `setMaxTtl`).
- **Personhood is on hold.** `rankedIdentity(account)` resolves the player and
  answers tier 0 and a zero alias, so a ranked mode fails closed. A later
  Identity version adds the precompile check. Storage domains 4 and up are
  kept for it.

Storage: every record is one 32-byte word at the fixed key
`keccak256(domain ++ address)`, read with `get_storage_or_zero` and written
with `set_storage_or_clear` (the zero word deletes the item and frees its
deposit). Far below the 416-byte item limit.

| Domain | Key | Word |
| --- | --- | --- |
| 0 admin | zero address | admin address (20 bytes) |
| 1 max TTL | zero address | `u64` LE, seconds |
| 2 key | session key | `KeyRecord { owner: 20, expiresAt: u64 LE, revoked: u8 }`, never deleted |
| 3 owner | player | `OwnerRecord { session: 20, expiresAt: u64 LE, state: u8 (1 offered, 2 bound) }`, deleted on revoke |

Do not write these keys with `set_storage(key_slice, ...)`: pallet-revive
treats a 32-byte slice as a *variable* key, a different item from the fixed
key (CDM version 1 had this bug; see M2 status).

## ABI

| Function | Notes |
| --- | --- |
| `registerSession(address session, uint64 expiresAt)` | Player. Reverts `SessionKeyCannotOwn()` (caller is or was a key), `InvalidSessionKey()` (zero or self), `SessionKeyInUse()`, `SessionKeyBurned()`, `InvalidExpiry()`, `TtlTooLong()`. Burns the caller's bound key. Emits `SessionOffered` (and `SessionRevoked` for a burned key) |
| `acceptSession(address owner)` | Session key. Reverts `NoOffer()`, `OfferExpired()`, `SessionKeyBurned()`, `OwnerCannotBeSessionKey()`. Emits `SessionRegistered` |
| `revokeSession()` | Player. Burns a bound key; withdraws an offer without burning the key. Reverts `NoActiveSession()` |
| `resolve(address account) view returns (address)` | Hot path. Reverts `InvalidSession(address)` |
| `rankedIdentity(address account) view returns (address player, uint8 tier, bytes32 alias)` | Stub: `(resolve(account), 0, 0)` |
| `sessionOf(address owner) view returns (address session, uint64 expiresAt, uint8 state)` | Client restore check |
| `keyOf(address session) view returns (address owner, uint64 expiresAt, bool revoked)` | Zero owner if never bound |
| `maxTtl() view returns (uint64)`, `setMaxTtl(uint64)` (admin, `NotAdmin()`), `adminAddress() view returns (address)` | |

Events: `SessionOffered(address indexed owner, address indexed session, uint64 expiresAt)`,
`SessionRegistered(address indexed owner, address indexed session, uint64 expiresAt)`,
`SessionRevoked(address indexed owner, address indexed session)`, `MaxTtlSet(uint64)`.

A mode imports only `resolve`:

```rust
pvm_contract_sdk::abi_import! {
    interface IIdentity { function resolve(address account) external view returns (address); }
}
let player = IIdentity::from_address(identity).resolve(caller).call(self).map_err(|_| IdentityFailed)?;
```

## Client flow (Paseo Next, runtime 3004000)

The web client also has a PAS fallback (classic V0, native fee) for a
player without enough PGAS (`docs/CONTRACT_ARCHITECTURE.md`, PAS sessions
status). On the PGAS path, every transaction must be a **v5 general transaction on extension pipeline
V1** (polkadot-api 3 `getVerifyMultiSignatureTxCreator`, option
`extensionVersion: 1`; host signers: `txExtVersion: 1`). Only V1 pays the fee
in PGAS. A classic v4 signed transaction (V0) pays native, and a PGAS-only
account cannot send it at all.

1. Player, one prompt: `Utility.batch_all[ Assets.transfer_keep_alive(PGAS,
   session SS58, budget), Revive.call(registerSession(session, expiresAt)) ]`.
   Fund the session's **SS58 account**: receiving the sufficient asset creates
   and auto-maps it. A PGAS ERC-20 precompile transfer to an unmapped H160
   credits that H160's fallback account instead, and the funds are lost.
2. Session key, silent: `Utility.batch_all[ Revive.call(acceptSession(owner)),
   Revive.call(<first game call>) ]`.
3. Restore: read `sessionOf(owner)`; trust the stored key only if it matches
   and the state is 2 and `expiresAt` is in the future.

## Build, test, deploy

```bash
cd identity && cargo build --release   # target/release/oab-identity.polkavm (~7 KB) + .abi.json
# native tests, from the repo root:
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path identity/Cargo.toml --features std
cd identity && cdm deploy -n paseo && cdm i -n paseo @oab/identity
# from the repo root: compare the deployed code with the local blob
(cd scripts && npm install)
node scripts/check-code.mjs <identity> identity/target/release/oab-identity.polkavm
```

The live check of a registry session is the web E2E spec `sponsored`
(`web/e2e/README.md`).

| | |
| --- | --- |
| Address | `0x7b41368859B67BB5c88500612eDe21AA6b837FBA` (block 2056840) |
| CDM | `@oab/identity` version 2, registry `0xc1a73a4f93fde65b1cb1680baead248073566cb0` |
| Admin | `0x704ead03a0a7c8b06c6ebbde97934adc24f9f5f7` (cdm `paseo` account) |
| Do not use | versions 0 (`0x9546…7b46`, no metadata on Bulletin) and 1 (`0x13Aa…Cc03`, revoke left the owner record) |
