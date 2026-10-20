# OAB end-to-end and performance harness

Two Playwright suites live here:

- **`npm run test:e2e`** drives the real app inside a TrUAPI test host
  (`@parity/host-api-test-sdk`) against the live casual arena
  (`@oab/arena` CDM version 4, pinned in `cdm.json`) on Paseo Asset Hub
  Next. Dev accounts sign every request automatically.
- **`npm run test:perf`** measures the battle replay at a phone viewport
  under CPU throttling. It uses no chain and no host.

Both suites build the app in production mode (`vite build`) first.

## Before you run

```bash
cd web
npm ci
npx playwright install chromium
../build-wasm.sh          # only if src/wasm is missing
```

The E2E suite needs network access to
`wss://paseo-asset-hub-next-rpc.polkadot.io`. It tops up the test product
accounts from `//Alice` (testnet dev key). Each casual run costs a few PAS.

Do not give PGAS to an account that plays with native fees: on runtime
3004000 the contract storage deposits (18.7 M for a game start, about 206 M
for a new ghost bracket) are taken in PGAS when the account holds PGAS, even
on a classic V0 transaction (M5 finding, 2026-10-20).

## Run

```bash
npm run test:e2e                      # all UI specs
npm run test:e2e -- casual-run        # one spec file
OAB_E2E_SKIP_BUILD=1 npm run test:e2e # reuse the last build
npm run test:perf                     # 1x, 4x and 6x CPU throttle
OAB_PERF_RATES=4 OAB_PERF_TRACE=0 npm run test:perf
npm run typecheck:e2e                 # tsc for this folder
```

Results go to `e2e/results/` (gitignored):

| Path                                                     | Content                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `results/screens/`                                       | Screenshots of the arena, shop, battle, game over, leaderboard and badges |
| `results/html/`                                          | Playwright HTML report (`npx playwright show-report e2e/results/html`)    |
| `results/artifacts/`                                     | Trace, video and screenshot of each failed test                           |
| `results/perf/summary.json`                              | Perf numbers for every throttle rate                                      |
| `results/perf/battle-<variant>-<rate>x.json`             | One run, with the battle that was measured                                |
| `results/perf/trace-<variant>-<rate>x.json`              | Chrome trace (open in DevTools > Performance)                             |
| `results/perf/battle.webm`, `battle.gif`, `battle-*.png` | Recording of the replay                                                   |

## E2E specs

| Spec         | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect`    | CONNECT gets a host account, every permission request is approved, and nothing is signed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `casual-run` | A full casual run through the UI: buy and place units, commit each turn on chain, see each replay and the game-over screen, New Run (`endGame`). After each turn the spec reads `getGame` from the chain: the turn stayed in the same run, the round moved on, and the replay the player saw ends in the result the chain applied (wins or lives changed). `getGame` is empty after New Run.                                                                                                                                                                |
| `on-hold`    | Ranked, personhood, leaderboard, and badges are on hold (no Records yet): the app shows no entry point for them, and their old links go to the menu.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sponsored`  | Registry sessions on the PAS path (V0, native fee), with fresh product accounts funded with PAS only. (1) Too little PAS: the setup refuses before it builds a transaction, and play falls back to normal signing. (2) PAS only: one setup prompt; a full casual game to game over with no prompt, the chain agreeing and the replay matching each round; logout (one revoke prompt, the key returns its PAS); normal signing after logout; a key revoked outside the app falls back to one normal prompt. Gated (`OAB_E2E_SESSION=1`): the PGAS path (V1). |
| `guard`      | Self-test: an error and a cross-origin load inside the product iframe are caught.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Every spec runs under a guard fixture (`fixtures.ts`). The guard fails the
test on an uncaught page error or a CSP violation. The product document gets
a strict same-origin CSP, so any load from another origin fails the test.

### Accounts

The host signs as product `oab-arena.paseo` (it must match `PRODUCT_ID`).
The core derives the product account from the subtree
`//<Dev>//oab-arena.paseo`, so each dev account gives a different OAB
account:

| Dev account | Used by                       | Notes                                                                                                                                                                                                                 |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alice       | `casual-run`                  | Topped up with PAS. Must hold no PGAS.                                                                                                                                                                                |
| Bob         | `connect`, `on-hold`, `guard` | Never signs.                                                                                                                                                                                                          |
| Dave        | `sponsored`                   | The PAS specs replace the OAB subtree with a fresh `//Alice//oabpas<run>` (or `oabpoor<run>`): PAS only, returned to Alice at the end. The gated PGAS spec uses Dave's own OAB account and gives it about 1.8 G PGAS. |

A spec that dies in the middle of a run leaves a game on chain. The next run
resumes it from the game page.

### Registry sessions: PGAS and PAS

A session is funded in PGAS (pipeline V1) when the player can pay the PGAS
budget, else in PAS (pipeline V0). The PAS specs run every time. The spec
derives each fresh product account in Node (`productAccount` in `chain.ts`)
and checks it against the address the app shows, so it can revoke a session
from outside the app and return the PAS to //Alice.

The PGAS spec needs about 1.8 G PGAS: 1.5 G session budget (decision Q12),
the 206.4 M owner record, and fees. On 2026-10-20 //Alice holds about 0.05 G
and no dev account holds more, so the spec is skipped. Run it when an
account with PGAS can fund it:

```bash
OAB_E2E_SESSION=1 npm run test:e2e -- sponsored
```

It never uses the DOT<->PGAS pool. PGAS goes to SS58 accounts with
`Assets.transfer_keep_alive` only.

`scripts/check-v1-session.mjs` checks, for free, that the setup batch and
the session key's first call are valid V1 transactions (fee in PGAS), built
with the app's own code path. Nothing is submitted.

## Perf harness

`perf/bench/` is a small page built from the app's own components: the
`BattleOverlay` (with `BattleArena` inside it) over the `ParticleBackground`.
The battle comes from the WASM engine's sandbox path (`run_sandbox_battle`),
not from the chain. On load, the page tries 600 random 5v5 boards with a
fixed seed and keeps the battle with the most combat events. Battles that hit
the battle limit (a stalemate, about 1100 events) are left out.

The bench build is `src/` as it is (variant `shipped`). An earlier `depsfix`
variant measured the fix for the replay effect loop; that fix is now in `src/`.

For each variant and rate, the test sets a 390x844 viewport at DPR 3 and
`Emulation.setCPUThrottlingRate`. It records every `requestAnimationFrame`
timestamp, long task, JS heap sample and the CDP task time, and plays the
battle at the default 1x speed. A busy battle plays for several minutes, so
the measured window stops at `OAB_PERF_MAX_S` (default 120 s). A separate,
short pass records one Chrome trace per variant and rate, so that tracing
does not change the measured numbers.

| Env                   | Default   | Meaning                                             |
| --------------------- | --------- | --------------------------------------------------- |
| `OAB_PERF_RATES`      | `1,4,6`   | CPU throttle rates                                  |
| `OAB_PERF_VARIANTS`   | `shipped` | Bench builds to measure                             |
| `OAB_PERF_CANDIDATES` | `600`     | Boards to try when searching for the busiest battle |
| `OAB_PERF_MAX_S`      | `120`     | Cap on the measured window                          |
| `OAB_PERF_TRACE_S`    | `15`      | Length of each trace; `0` skips traces              |
| `OAB_PERF_VIDEO`      | `1`       | `0` skips the video test                            |

Read the numbers with these facts:

- Headless Chromium has no real display. FPS has an upper limit of the
  `requestAnimationFrame` rate (60 Hz).
- CPU throttling slows the main thread only. It does not slow the GPU or the
  compositor, and most battle effects are CSS animations on the compositor.
- `log rows` is the replay progress: the battle log lines shown at the end
  of the window. A high FPS with few log rows means the replay is stuck.
- `busy %` is main-thread task time per wall-clock second.

## Limits

- The test host cannot claim PGAS. That needs a real personhood proof, so
  the PGAS session path needs PGAS from Alice to run. The PAS path does not.
- The test host signs every host transaction as a classic v4 (pipeline V0,
  native fee) and ignores `txExtVersion`
  (`@parity/host-api-test-sdk` 0.17 CHANGELOG). The setup batch of a
  registry session is V1 in a real host and V0 here. The session key's V1
  transactions are built in the app, so the test host does not change them.
- `@parity/host-api-test-sdk@0.17.0` speaks truapi 0.24. The app uses
  truapi 0.25 through `@parity/product-sdk-host@0.27`. Everything used here
  works, but a newer test SDK is the safe match.
- The SDK's `PASEO_ASSET_HUB` constant has a stale genesis hash.
  `global-setup.ts` reads the live one from the node.
