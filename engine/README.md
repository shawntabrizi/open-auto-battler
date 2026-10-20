# `oab-engine` — engine facade crate

One source for the game rules that modes, the `@oab/engine` contract, and
the client run (`docs/CONTRACT_ARCHITECTURE.md` section 4.1). `no_std`,
pure, a thin facade over `oab-battle` and `oab-game`.

- `new_game(config, bundle, seed) -> LocalGameState`
- `resolve_turn(TurnInput) -> Result<TurnOutput, GameError>` — arena v2's
  `submit_turn` body without storage, ghost choice, or seed derivation.
- `replay_battle(player, opponent, seed, pool, board_size) -> Vec<CombatEvent>`
  — equals `TurnOutput::events` for `TurnOutput::player_board`.
- `SetBundle { set_id, set, cards }`, `SetBundle::hash()` = keccak256(SCALE).

Seeds and the opponent are mode policy; the caller passes them.

## Version guard

`ENGINE_HISTORY` lists every released `(version, golden-vector hash)`;
`ENGINE_VERSION` and `ENGINE_VECTORS_HASH` are its last entry. The test
`golden_vectors_match_engine_version` hashes the outputs of a fixed corpus
(`vectors`: 12 games on sets 0–2, 71 turns, 1 invalid turn) and fails when
the behaviour changes. Then append a new entry; never edit a released one.

## Proof that version 1 is arena v2

`engine/arena-oracle` compiles `contract/src/main.rs` unchanged (see its
`build.rs`) and drives the real arena methods through the same corpus. Start
seeds, start states, battle seeds, every post-turn state, and every
`BattleReported` payload must be equal. It also runs the arena's own 40
tests.

Two deliberate differences, outside the corpus: the engine uses saturating
arithmetic for `mana_limit_for_round`, `wins`, and `lives`. Arena v2 builds
with `overflow-checks = false` and wraps its mana limit at round 254 and up.

## Tests

```bash
cargo test -p oab-engine
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path engine/arena-oracle/Cargo.toml
```
