# OAB Player Agent Guide

You are an AI agent playing Open Auto Battler via an HTTP API. This document contains everything you need to make strategic decisions.

## How to Play

You interact with `oab-server` running on a local HTTP endpoint. Each game is a series of rounds. Each round has two phases:

1. **Shop phase** — You receive the game state and respond with actions (burn cards, play cards, arrange board).
2. **Battle phase** — Your board auto-fights an opponent. You don't control the battle.

### API Calls

```
POST /reset              Start a new game. Returns initial state.
POST /step  {actions}    Submit your turn. Returns battle result + next state.
GET  /state              Check current state without acting.
```

### Your Turn

Each turn, you POST to `/step` with a JSON body:

```json
{
  "actions": [
    {"type": "BurnFromHand", "hand_index": 0},
    {"type": "PlayFromHand", "hand_index": 1, "board_slot": 0}
  ]
}
```

Actions execute in order. You can submit an empty list `{"actions": []}` to skip the shop and go straight to battle.

## Game State

When you receive a game state, it looks like this:

```json
{
  "round": 1,
  "lives": 3,
  "wins": 0,
  "mana": 3,
  "mana_limit": 3,
  "bag_count": 45,
  "hand": [<card or null>, ...],   // 5 slots
  "board": [<unit or null>, ...],  // 5 slots, index 0 = front
  "can_afford": [true, false, ...]  // one per hand slot
}
```

Each card in your hand has:
- `id` — unique card type identifier
- `name` — display name
- `attack` / `health` — combat stats
- `play_cost` — mana required to place on board
- `burn_value` — mana gained when burned
- `battle_abilities` — abilities that trigger during combat
- `shop_abilities` — abilities that trigger during the shop phase

## Available Actions

| Action | Fields | What it does |
|--------|--------|-------------|
| `BurnFromHand` | `hand_index` | Destroy a hand card to gain its `burn_value` as mana |
| `PlayFromHand` | `hand_index`, `board_slot` | Place a hand card on the board (costs `play_cost` mana) |
| `BurnFromBoard` | `board_slot` | Sell a board unit to gain its `burn_value` as mana |
| `SwapBoard` | `slot_a`, `slot_b` | Swap two board positions |
| `MoveBoard` | `from_slot`, `to_slot` | Shift a unit to another occupied slot (slides units between) |

### Index Rules
- `hand_index`: 0-4, references slots in the `hand` array
- `board_slot`: 0-4, where index 0 is the **front line** (gets attacked first)

## Win and Lose Conditions

- **Win**: Accumulate 10 victories.
- **Lose**: Lose all 3 lives. You lose 1 life per battle defeat.
- Draws don't change wins or lives.

## Mana Economy

- Each round your mana refills to `mana_limit` (but shop_mana starts at 0 on round 1).
- `mana_limit` starts at 3 and increases by 1 per round (max 10).
- **Burning a card** adds its `burn_value` to your mana (capped at `mana_limit`).
- **Playing a card** costs its `play_cost`.
- Unspent mana is lost at the end of each shop phase.
- Some battle abilities grant mana for the next round via `GainMana`.

## Battle Mechanics

Battles are automatic. Here's how they work:

1. **Start phase**: `OnStart` abilities trigger for all units.
2. **Each round of combat**:
   - `BeforeAnyAttack` and `BeforeUnitAttack` abilities trigger.
   - Front units (index 0) clash — both deal their attack as damage to each other.
   - `AfterUnitAttack` and `AfterAnyAttack` abilities trigger.
   - Units with health <= 0 die. `OnFaint` and `OnAllyFaint` abilities trigger.
3. **Battle ends** when one side has no units left, or a round/trigger limit is hit.

### Board Position Strategy

- **Slot 0 (front)**: Gets hit every round. Put high-health units here.
- **Slots 1-4 (back)**: Only enter combat after units in front die. Put fragile/support units here.
- Units advance forward as front units die (slot 1 becomes the new front, etc.).

## Key Ability Triggers

| Trigger | When it fires |
|---------|--------------|
| `OnStart` | Once at battle start |
| `BeforeAnyAttack` | Before each clash (all units) |
| `BeforeUnitAttack` | Before each clash (front unit only) |
| `AfterUnitAttack` | After the front unit attacks |
| `AfterAnyAttack` | After any attack resolves |
| `OnHurt` | When a unit takes damage |
| `OnFaint` | When the unit itself dies |
| `OnAllyFaint` | When a friendly unit dies |
| `OnSpawn` | When a unit is spawned by an ability |
| `OnAllySpawn` | When a friendly unit spawns |
| `OnEnemySpawn` | When an enemy unit spawns |

## Key Ability Effects

| Effect | What it does |
|--------|-------------|
| `Damage` | Deal damage to target(s) |
| `ModifyStats` | Temporarily buff/debuff attack and/or health |
| `ModifyStatsPermanent` | Permanently change stats (persists across rounds) |
| `SpawnUnit` | Create a new unit on the board |
| `Destroy` | Instantly kill a target |
| `GainMana` | Add mana for the next shop phase |

## Strategic Principles

1. **Mana efficiency**: Burn cards you don't need to afford better ones. Every card has burn_value, so nothing is wasted.

2. **Board before hand**: A card on the board fights for you. A card in hand does nothing. Prioritize getting units onto the board.

3. **Front line matters most**: Your slot 0 unit takes all the damage. Prioritize health there. Units with `OnStart` health buffs targeting position 0 (like Shield Bearer) are very strong.

4. **Synergies**: Look for ability combos:
   - Units that buff allies + many small allies = strong
   - `OnFaint` spawners in front buy time for back-line units
   - `BeforeAnyAttack` healers keep your front alive longer

5. **Round scaling**: Early rounds have weak opponents (1-2 units). Later rounds have 4-5 strong units. Plan for scaling — invest in permanent stat buffs and strong late-game cards.

6. **Don't overburn**: Burning all 5 cards means an empty hand and nothing to play next round if you can't fill your board this turn. Unplayed hand cards return to the bag.

## Step Response

After each `/step`, you receive:

```json
{
  "battle_result": "Victory",
  "game_over": false,
  "game_result": null,
  "reward": 1,
  "state": { ... }
}
```

- `reward`: +1 for victory, -1 for defeat, 0 for draw. Use this as your feedback signal.
- `state`: The game state for your next turn (or final state if game_over).
- When `game_over` is true, call `POST /reset` to start a new game.

## Example Turn

Given this state:
```
Round 1, Mana 0/3, Lives 3, Wins 0
Hand: [Militia(cost=2,burn=2), Goblin Scout(cost=1,burn=2), Shield Bearer(cost=2,burn=2), ...]
Board: [empty, empty, empty, empty, empty]
```

Good actions:
```json
{
  "actions": [
    {"type": "BurnFromHand", "hand_index": 0},
    {"type": "PlayFromHand", "hand_index": 2, "board_slot": 0},
    {"type": "PlayFromHand", "hand_index": 1, "board_slot": 1}
  ]
}
```

Reasoning: Burn Militia (+2 mana, now at 2). Play Shield Bearer to front (cost 2, now at 0) — it has high health and buffs the front. Play Goblin Scout behind it (cost 1 — wait, we have 0 mana). Better plan:

```json
{
  "actions": [
    {"type": "BurnFromHand", "hand_index": 0},
    {"type": "BurnFromHand", "hand_index": 1},
    {"type": "PlayFromHand", "hand_index": 2, "board_slot": 0}
  ]
}
```

Burn Militia (+2) and Goblin Scout (+2) = 4 mana. Play Shield Bearer to front (cost 2, 2 remaining). Could play another 1-cost or 2-cost card if available.
