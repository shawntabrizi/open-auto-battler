# Open Auto Battler

An auto-battler card game on Polkadot. Draft cards from a bag, build a board
in the shop phase, and battle ghost opponents. Win 10 rounds before you lose
3 lives.

One deterministic Rust engine runs in two places: in PolkaVM contracts on
Asset Hub (the authority) and in the browser as WASM (the shop phase and the
battle replay).

Live on Paseo Asset Hub Next: https://oab-arena.paseo.li (product ID
`oab-arena.paseo`). Open it inside a Polkadot host (Polkadot Desktop,
Polkadot Mobile, or dot.li).

## Layout

| Path | What |
| ---- | ---- |
| `battle/`, `game/`, `assets/` | no_std Rust engine: types, battle, turn rules, card data (`assets/data/`) |
| `engine/` | `oab-engine`: the game pipeline that the contracts and the client share, golden vectors |
| `protocol/` | `oab-protocol`: SCALE types that the contracts and the client share |
| `client/` | `wasm-bindgen` bridge (`GameEngine`) for the browser |
| `engine-contract/` | `@oab/engine`: the pure engine as a contract, for third parties |
| `content/` | `@oab/content`: cards, sets, and house ghosts (immutable after publish) |
| `identity/` | `@oab/identity`: registry session keys |
| `arena/` | `@oab/arena` (CDM version 4): the casual game mode |
| `nft-minter/` | `@oab/nft-minter`: picks the cosmetic for a Scarcity credit claim (collection 29) |
| `scripts/` | deploy and check tools (`oab-plan`, `publish-content`, `wire-arena`, `check-code`, and more) |
| `web/` | React frontend (Polkadot Product SDK, registry sessions) |

Each contract folder has a README with its API, deploy steps, and address.
The design and the measurements are in `docs/CONTRACT_ARCHITECTURE.md`.

## Run

You need Rust, Node.js 22, and `wasm-pack`.

```bash
./build-wasm.sh            # client/ -> web/src/wasm/
cd web
npm ci
npm run dev                # http://localhost:5173
```

Outside a host, the app uses dev accounts. Chain play with a product
account needs the app inside a host.

## Test

```bash
cargo test --workspace
# each contract, from the repo root (also identity, content, engine-contract, nft-minter):
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path arena/Cargo.toml --features std
cd web && npm test && npm run lint && npm run format:check && npm run build
npm run test:e2e           # Playwright with a test host on Paseo Next (web/e2e/README.md)
```

## Deploy

- Contracts: `cdm deploy -n paseo` in the contract folder, then the steps in
  its README. Then refresh `web/cdm.json` in `web/` with
  `cdm i -n paseo @oab/arena:4 @oab/identity:2 @oab/content:0` (change the
  versions to the new ones).
- Frontend: `DOTNS_MNEMONIC="<owner phrase>" npm run deploy` in `web/`
  (Bulletin + DotNS with `bulletin-deploy` 0.22.0). CI deploys `master`
  with `.github/workflows/deploy-frontend.yml`.

## Docs

- `AGENTS.md`: conventions for contributors and agents
- `docs/README.md`: index of the design docs
