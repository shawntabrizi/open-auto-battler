# Agent Instructions

Read `README.md` for the layout, and `docs/CONTRACT_ARCHITECTURE.md` for the
contract design. The guides in `agents/` give detail:

- `agents/CORE_ENGINE.md`: game rules and engine structure
- `agents/WASM_BRIDGE.md`: the Rust-to-WASM boundary
- `agents/WEB_UI.md`: frontend routes, state, and the contract client
- `agents/REACT.md`: frontend patterns and the WASM init rules

## Rules

- **The game is in development.** Do not keep backward compatibility. Delete
  superseded code; git history keeps it. Do not hide old code behind flags.
- **One engine, two places.** The engine (`battle/`, `game/`, `engine/`) runs
  in the contracts and in the browser. A change to a SCALE type must reach the
  engine, `protocol/`, the contracts, the WASM bridge (`client/`), and the
  frontend decoders (`web/src/contract/codec.ts`, `web/src/types.ts`).
- **Deployed contracts are fixed.** A change to `battle/`, `game/`, `engine/`,
  `protocol/`, or `assets/` can change a contract blob. The blob also depends
  on the absolute build path. Compare a rebuild with the chain
  (`node scripts/check-code.mjs <address> <blob>`) before you say that it
  did not change. A change in engine behaviour needs a new `ENGINE_HISTORY`
  entry (`engine/README.md`).
- **No engine panics.** Engine and contract code must not use `panic!`,
  `unwrap()`, or `expect()` for normal control flow.
- **Formatting.** Run `cargo fmt` for Rust and `npx prettier --write` (in
  `web/`) for the web files you change.

## Tests

- Rust workspace: `cargo test --workspace`. Engine rule changes need tests in
  the crate's `src/tests/`.
- Contracts (not workspace members; run from the repo root so that the riscv
  config in each crate does not apply):
  `CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path <contract>/Cargo.toml --features std`
  for `arena`, `identity`, `content`, `engine-contract`, and `nft-minter`.
- Web: `npm test` (Vitest, files next to each module), `npm run lint`,
  `npm run build`, `npm run test:e2e`, `npm run test:perf`. The E2E specs
  run against Paseo Next (`web/e2e/README.md`).

## Chain safety

- Use PAS for live tests and return leftovers to //Alice.
- Never touch the DOT<->PGAS pool. Never send PGAS to an unmapped H160 (the
  funds go to a fallback account and are lost).
- Read and wait at the best block. Give every chain read a timeout.
