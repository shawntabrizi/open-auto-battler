# `@oab/engine` — pure engine contract (PolkaVM)

The `oab-engine` crate (`engine/`) over ABI. Third parties, tools, and
auditors call it to check a game result on chain. Game modes link the crate
and never call this contract (`docs/CONTRACT_ARCHITECTURE.md` section 4.1).

- **Pure.** No storage, no admin, no fallback, no outgoing calls. The caller
  passes the content as a SCALE `SetBundle`.
- **One deployment per engine version.** A behaviour change is a new
  `ENGINE_VERSION`, a new deployment, and a new CDM version.

## ABI

All game values are SCALE inside ABI `bytes`.

| Function | Input (SCALE) | Output (SCALE) |
| --- | --- | --- |
| `engineVersion() pure returns (uint32)` | — | `oab_engine::ENGINE_VERSION` |
| `vectorsHash() pure returns (bytes32)` | — | `oab_engine::ENGINE_VECTORS_HASH` |
| `newGame(bytes) pure returns (bytes)` | `(GameConfig, SetBundle, u64 seed)` | `LocalGameState` |
| `resolveTurn(bytes) pure returns (bytes)` | `(GameConfig, SetBundle, LocalGameState, CommitTurnAction, Vec<GhostBoardUnit> opponent, u64 battleSeed, u64 nextShopSeed)` | `TurnOutput { state, result, player_board, events }` |
| `replayBattle(bytes) pure returns (bytes)` | `(Vec<GhostBoardUnit> player, Vec<GhostBoardUnit> opponent, u64 seed, SetBundle, u8 boardSize)` | `Vec<CombatEvent>` |

Errors: `BadInput()` (input is not the expected SCALE value),
`InvalidTurn(bytes error)` (`error` = SCALE `oab_battle::GameError`).

## Build and test

```bash
cd engine-contract && cargo build --release      # target/release/oab-engine-contract.polkavm (~98 KB) + .abi.json
# native tests, from the repo root:
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path engine-contract/Cargo.toml --features std
```

The native tests send ABI calldata through the generated router and require
the same bytes as the crate for the whole golden-vector corpus.

## Deployment (Paseo Next)

| | |
| --- | --- |
| Address | `0xb63d4a8DdAcB30a3E181C98a6008a2Be4fC6CCb0` |
| CDM | `@oab/engine` version 0, registry `0xc1a73a4f93fde65b1cb1680baead248073566cb0` |
| Engine | `ENGINE_VERSION` 1, vectors hash `0xd8d7c21e3b7ef1f67befb155370cfe55a7840de2259c4d4ec8b98517aee68b5c` |
| Deployed | 2026-10-20 by the cdm `paseo` account (`cdm deploy -n paseo`) |

Check a deployment against the crate (dry-runs only, no signer):

```bash
cargo run -p oab-plan -- engine /tmp/engine-plan.json
(cd scripts && npm install)
node scripts/check-engine.mjs /tmp/engine-plan.json 0xb63d4a8DdAcB30a3E181C98a6008a2Be4fC6CCb0
node scripts/check-code.mjs 0xb63d4a8DdAcB30a3E181C98a6008a2Be4fC6CCb0 engine-contract/target/release/oab-engine-contract.polkavm
```
