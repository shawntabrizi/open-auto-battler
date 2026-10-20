# Open Auto Battler

An auto-battler card game on Polkadot. Draft cards from a bag, build a board
in the shop phase, and battle ghost opponents. Win 10 rounds before you lose
3 lives.

One deterministic Rust engine runs in two places: in a PolkaVM smart contract
on Asset Hub (the authority) and in the browser as WASM (the shop phase and
the battle replay).

Live on Paseo Asset Hub Next: https://oab-arena.paseo.li (product ID
`oab-arena.paseo`). Open it inside a Polkadot host (Polkadot Desktop,
Polkadot Mobile, or dot.li).

## Stack

| Part | Path | Notes |
| ---- | ---- | ----- |
| Engine | `battle/`, `game/`, `assets/` | no_std Rust, SCALE types, card data in `assets/data/` |
| WASM bridge | `client/` | `wasm-bindgen` `GameEngine` |
| Arena contract | `contract/` | `@oab/arena`, `cargo-pvm-contract` rev `d5991131`, polkavm 0.35. Casual and ranked games, leaderboard, badges |
| Claim minter | `nft-minter/` | `@oab/nft-minter`, picks cosmetics for Scarcity credit claims |
| Frontend | `web/` | React 18.3, Zustand, Tailwind, polkadot-api 3.2.2, `@parity/product-sdk` 0.38 |

Deployed addresses: arena v2 `0xA61f803AeEBFfF2c7568157756932D3944EDCa28`,
CDM registry `0xc1a73a4f93fde65b1cb1680baead248073566cb0` (`web/cdm.json`).

## Run

Needs Rust, Node.js 22, and `wasm-pack`.

```bash
./start.sh                 # build the WASM engine and start the dev server
```

Or step by step:

```bash
./build-wasm.sh            # client/ -> web/src/wasm/
cd web
npm install
npm run dev                # http://localhost:5173
```

Chain access goes through the Polkadot host, so contract play needs the app
inside a host. See `docs/QUICKSTART.md`.

## Test

```bash
cargo test -p oab-battle -p oab-game -p oab-client -p oab-contract-tests
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path contract/Cargo.toml --features std
CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path nft-minter/Cargo.toml --features std
cd web && npm test && npm run lint && npm run format:check && npm run build
```

Live chain checks and on-chain E2E scripts: `agents/TESTING_GUIDE.md`.

## Deploy

- Contract: `cdm deploy -n paseo` from `contract/`, then refresh `web/cdm.json`
  with `cdm i -n paseo @oab/arena` in `web/`. See `contract/README.md`.
- Frontend: `DOTNS_MNEMONIC="<owner phrase>" npm run deploy` in `web/`
  (Bulletin + DotNS via `bulletin-deploy` 0.22.0). CI deploys `master` with
  `.github/workflows/deploy-frontend.yml`.

## Docs

- `agents/AGENTS.md` — start here for architecture and conventions
- `docs/CURRENT_ARCHITECTURE.md` — how the pieces fit together
- `contract/README.md` — contract API, ranked play, personhood, badges
- `docs/NFT_DESIGN.md` — NFTs, claim minter, badges
- `BETA_RELEASE_PLAN.md` — roadmap and open items
