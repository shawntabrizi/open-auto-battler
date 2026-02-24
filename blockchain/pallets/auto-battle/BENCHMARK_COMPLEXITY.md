# Auto Battle Pallet Benchmark Complexity Notes

This file documents the algorithmic complexity assumptions used by
`blockchain/pallets/auto-battle/src/benchmarking.rs`.

## Complexity Model

- `A`: number of turn actions (`MaxHandActions`)
- `B`: number of board slots (`MaxBoardSize`)
- `N`: number of cards in a set (`MaxSetSize`)
- `S`: bounded string length (`MaxStringLen`)
- `Ab`: number of abilities in a user card (`MaxAbilities`)
- `E`: battle event count produced by combat resolution

## Dispatchables

| Extrinsic | Big O | Most complex path exercised by benchmark | Important details |
|---|---:|---|---|
| `start_game` | `O(1)` | Initialize and store one active game session | Depends on bounded hand/bag initialization from engine |
| `submit_turn` | `O(A + B + E)` | Verify/apply max actions, resolve battle, store ghost + archive, advance round | Benchmark pre-fills board and uses max action count |
| `submit_card` | `O(Ab)` | Hash card data, write `UserCards`, `UserCardHashes`, metadata, and next ID | Benchmark uses max ability payload when available |
| `set_card_metadata` | `O(S)` | Read metadata entry, creator check, write updated bounded metadata | Name, emoji, and description all max-length bounded strings |
| `create_card_set` | `O(N)` | Verify each card ID exists, sum rarities, hash and store set | Benchmark uses max-size bounded set input |
| `set_set_metadata` | `O(S)` | Read and overwrite set metadata | Benchmark uses max-length bounded set name |
| `create_tournament` | `O(1)` | Validate schedule/prize config, write tournament config/state | Fixed-size config payload |
| `join_tournament` | `O(1)` | Transfer entry fee, update counters, initialize and store tournament session | One currency transfer plus bounded state writes |
| `submit_tournament_turn` | `O(A + B + E)` | Verify/apply max actions, resolve battle, update tournament session/stats | Benchmark pre-fills board and uses max action count |
| `abandon_game` | `O(1)` | Check and remove active regular session | Single map remove |
| `abandon_tournament` | `O(1)` | Read tournament session, update player stats, remove session | Single stats mutate + remove |
| `claim_prize` | `O(N)` | Compute player/set/card-creator shares, including full card-set scan | Benchmark forces all prize branches and max-size set scan |

## Notes on Bounded Inputs

- `create_card_set` now accepts `BoundedVec<CardSetEntryInput, MaxSetSize>`.
- `set_set_metadata` now accepts `BoundedVec<u8, MaxStringLen>`.
- These changes remove unbounded decode paths and remove silent truncation in dispatchables.
