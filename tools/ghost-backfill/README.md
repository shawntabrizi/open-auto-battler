# Ghost Backfill Tool

Standalone tooling for seeding blockchain ghost brackets from a checked-in JSON dataset.

## What it does

- Generates a JSON file with at least 3 boards for every non-terminal round / wins / losses bracket through round 10
- Stores the dataset under set `0` for now
- Emits no board statuses; all submitted `perm_statuses` masks are empty
- Submits `AutoBattle.backfill_ghost_board` calls wrapped in `Sudo.sudo(...)`

The JSON uses `losses`, not `lives`. The submitter converts `losses` into `lives` with:

`lives = starting_lives - losses`

Each board unit uses `card_ref`, which is resolved against the target on-chain set by modulo:

`resolved_card_id = set_cards[card_ref % set_cards.length]`

That keeps the same JSON reusable even if the exact card IDs in the set change.

## Files

- `ghost-board-backfill.json`: checked-in dataset for set `0`
- `src/generate-dataset.ts`: regenerates the JSON deterministically
- `src/backfill-boards.ts`: parses the JSON and submits transactions
- `src/dataset.ts`: shared dataset types

## Usage

```bash
cd tools/ghost-backfill
npm install
npm run generate
npm run backfill -- --ws ws://127.0.0.1:9944 --set-id 0
```

Optional flags for `backfill-boards.ts`:

- `--ws <url>`: websocket endpoint, default `ws://127.0.0.1:9944`
- `--config <path>`: dataset path, default `./ghost-board-backfill.json`
- `--set-id <id>`: filter to a single set in the JSON, default `0`
- `--account <name>`: dev derivation path, default `Alice`
- `--mnemonic "<phrase>"`: override the mnemonic, default `DEV_PHRASE`
- `--limit <n>`: only submit the first `n` boards
- `--dry-run`: validate and print what would be submitted without sending transactions

## Dataset shape

```json
{
  "version": 1,
  "starting_lives": 3,
  "max_round": 10,
  "sets": [
    {
      "set_id": 0,
      "brackets": [
        {
          "round": 1,
          "wins": 0,
          "losses": 0,
          "boards": [
            {
              "name": "tempo",
              "units": [
                {
                  "card_ref": 0,
                  "perm_attack": 1,
                  "perm_health": 0
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```
