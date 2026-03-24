# OAB Server

HTTP game server for AI agents to play Open Auto Battler.

Exposes the game engine as a REST API with a gym-like `reset`/`step` interface, designed for reinforcement learning training and AI agent development.

## Quick Start

```bash
# Build and run (local mode, no blockchain needed)
cargo run -p oab-server --no-default-features -- --port 3000

# Start a game
curl -X POST localhost:3000/reset -d '{"seed": 42}'

# Submit a turn (burn card 0 for mana, play card 1 to board slot 0)
curl -X POST localhost:3000/step -d '{
  "actions": [
    {"type": "BurnFromHand", "hand_index": 0},
    {"type": "PlayFromHand", "hand_index": 1, "board_slot": 0}
  ]
}'

# Do nothing this turn
curl -X POST localhost:3000/step -d '{"actions": []}'
```

## API

### `POST /reset`

Start a new game. Returns the initial game state.

**Request body** (all fields optional):

```json
{
  "seed": 42,
  "set_id": 0
}
```

- `seed` — Deterministic game seed. Omit for random.
- `set_id` — Card set to use. Default: `0` (Starter Pack).

**Response:** `GameState` (see below).

### `POST /step`

Submit turn actions, resolve the battle, and advance to the next round.

**Request body:**

```json
{
  "actions": [
    {"type": "BurnFromHand", "hand_index": 0},
    {"type": "PlayFromHand", "hand_index": 1, "board_slot": 0},
    {"type": "SwapBoard", "slot_a": 0, "slot_b": 1},
    {"type": "MoveBoard", "from_slot": 2, "to_slot": 0},
    {"type": "BurnFromBoard", "board_slot": 3}
  ]
}
```

Actions are executed in order. An empty `"actions": []` skips the shop phase and goes straight to battle.

**Action types:**

| Action | Fields | Description |
|--------|--------|-------------|
| `BurnFromHand` | `hand_index` | Burn a hand card for mana |
| `PlayFromHand` | `hand_index`, `board_slot` | Play a hand card to the board (costs mana) |
| `BurnFromBoard` | `board_slot` | Sell a board unit for mana |
| `SwapBoard` | `slot_a`, `slot_b` | Swap two board positions |
| `MoveBoard` | `from_slot`, `to_slot` | Shift a unit to another occupied slot |

**Response:**

```json
{
  "battle_result": "Victory",
  "game_over": false,
  "game_result": null,
  "reward": 1,
  "state": { "round": 2, "lives": 3, "wins": 1, ... }
}
```

- `battle_result` — `"Victory"`, `"Defeat"`, or `"Draw"`
- `game_over` — `true` when the game has ended
- `game_result` — `"victory"` or `"defeat"` when `game_over` is true, otherwise `null`
- `reward` — RL reward signal: `+1` (win), `-1` (loss), `0` (draw)
- `state` — The game state for the next round (or final state if game over)

### `GET /state`

Get the current game state without taking any action.

**Response:** `GameState`.

### Game State

All state responses share this shape:

```json
{
  "round": 1,
  "lives": 3,
  "wins": 0,
  "mana": 3,
  "mana_limit": 3,
  "phase": "shop",
  "bag_count": 45,
  "hand": [
    {"id": 5, "name": "Militia", "attack": 2, "health": 3, "play_cost": 2, "burn_value": 1, "shop_abilities": [], "battle_abilities": []},
    null,
    null,
    null,
    null
  ],
  "board": [null, null, null, null, null],
  "can_afford": [true, false, false, false, false]
}
```

- `hand` — 5 slots. Each is a card object or `null` (empty/used).
- `board` — 5 slots (index 0 is front). Each is a unit object or `null`.
- `can_afford` — Whether you have enough mana to play each hand card.
- `bag_count` — Cards remaining in the draw bag.

### Errors

Invalid requests return HTTP 400 with:

```json
{
  "error": "NotEnoughMana { have: 1, need: 3 }"
}
```

## Game Rules

- **Shop phase**: Each round you get 5 cards in hand. Burn cards for mana, spend mana to play cards to your 5-slot board. Index 0 is the front line.
- **Battle phase**: Your board auto-battles an opponent. Front units clash each round. Abilities trigger based on events (OnStart, OnFaint, OnHurt, etc.).
- **Win condition**: Reach 10 wins.
- **Lose condition**: Lose all 3 lives (one life lost per battle defeat).
- **Mana**: Starts at 3, increases by 1 each round (max 10). Burning a card gives its `burn_value` as mana.

## CLI Options

```
oab-server [OPTIONS]

--port <N>   Server port (default: 3000)
--set <N>    Default card set ID (default: 0)
--help       Print help
```

## Python Example

```python
import requests

BASE = "http://localhost:3000"

# Start a new game
state = requests.post(f"{BASE}/reset", json={"seed": 42}).json()

while True:
    # Simple strategy: burn cheapest cards, play the most expensive affordable one
    actions = []
    mana = state["mana"]

    hand = [(i, c) for i, c in enumerate(state["hand"]) if c is not None]
    hand.sort(key=lambda x: x[1]["play_cost"])

    # Burn cheap cards for mana
    for i, card in hand[:-1]:
        actions.append({"type": "BurnFromHand", "hand_index": i})
        mana += card["burn_value"]

    # Play the most expensive card we can afford
    for i, card in reversed(hand):
        if mana >= card["play_cost"]:
            empty_slot = next(
                (s for s, b in enumerate(state["board"]) if b is None), None
            )
            if empty_slot is not None:
                actions.append({"type": "PlayFromHand", "hand_index": i, "board_slot": empty_slot})
                break

    result = requests.post(f"{BASE}/step", json={"actions": actions}).json()
    print(f"Round {state['round']}: {result['battle_result']} (reward={result['reward']})")

    if result["game_over"]:
        print(f"Game over: {result['game_result']}")
        break

    state = result["state"]
```
