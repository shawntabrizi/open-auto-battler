# Core Engine Guide

This document summarizes the engine model from `battle/src/*` and `game/src/*`.

## Modules
- `game/src/state.rs` defines `GameState`, `LocalGameState`, and phase tracking (`GamePhase`).
- `game/src/lib.rs` defines `GameConfig` (lives, wins to victory, mana, board, hand, and bag sizes).
- `battle/src/types.rs` defines abilities, targets, matchers, and fundamental types.
- `battle/src/battle.rs` resolves combat flow.
- `battle/src/limits.rs` defines battle limit reasons and constraints.
- `battle/src/commit.rs` validates and applies turn actions (`verify_and_apply_turn`).
- `game/src/view.rs` produces UI-facing views.

## State Model
- `GameState` contains `card_pool` and `LocalGameState` in `game/src/state.rs`.
- Sizes and limits like `board_size`, `hand_size`, and `starting_mana_limit` are `GameConfig` fields in `game/src/lib.rs`. The defaults are in `game/src/sealed.rs` and `game/src/constructed.rs`; the arena uses `arena_config()` in `arena/src/main.rs`.
- Phase progression is modeled with `GamePhase`.

## Battle Resolution

### Phase Structure
The battle loop runs three phases per round:
1. **Start** (once) — `OnStart` triggers fire.
2. **BeforeAttack** — `BeforeAnyAttack` (all units) and `BeforeUnitAttack` (front unit only) fire.
3. **Attack** — Front units clash, then all triggers are resolved eagerly:
   - `OnHurt`, `AfterUnitAttack`, `AfterAnyAttack` captured before death check.
   - Death check removes dead units (moved to graveyard).
   - `OnFaint`, `OnAllyFaint` captured from dead/survivor lists.
   - All triggers resolved in one priority-sorted queue.

There is no separate AfterAttack phase — all post-clash triggers fire within the Attack phase.

### Stack Semantics
All captured triggers fire regardless of source liveness. Once a trigger is captured onto the queue, it resolves even if its source unit is killed during resolution. This ensures:
- Mutual deathtouch (both scorpions kill each other).
- OnFaint abilities always fire.
- No special-case dead-unit handling needed.

### Trigger Priority
Triggers are sorted by: attack (highest first) > health (highest first) > position (front first) > random tiebreaker > ability order. All abilities from one unit resolve before the next unit's abilities.

### Graveyard
Dead units are moved (not cloned) to a graveyard `Vec<CombatUnit>`. Condition evaluation looks up the source unit on the board first, then in the graveyard. This provides full unit data (attack, health, buffs, mana cost) for conditions on dead units without any cloning or temp unit construction.

### Trigger Capture Helper
All trigger collection uses `capture_triggers_for_unit()`, a single helper that builds `PendingTrigger` entries from a unit's abilities filtered by trigger type. No manual `PendingTrigger` construction anywhere in the codebase.

## Abilities and Effects
- Abilities are defined in `battle/src/types.rs` with `AbilityTrigger`, `AbilityEffect`, and `AbilityTarget`.
- `AbilityTrigger` is `Copy` (simple fieldless enum).
- Conditions use `Matcher` and `Condition` for targeting and comparisons.

### Effect Types
- **Damage** — Deals damage, triggers `OnHurt` on targets.
- **ModifyStats / ModifyStatsPermanent** — Buff/debuff stats. Does NOT trigger `OnHurt` (stat loss is not damage).
- **Destroy** — Sets health to 0, emits `AbilityDestroy` event (distinct from `AbilityDamage`). Immune to future damage reduction mechanics.
- **SpawnUnit** — Creates a unit, triggers `OnSpawn`/`OnAllySpawn`/`OnEnemySpawn`.
- **GainMana** — Adds mana for the next shop phase.

### Target Types
- **Position** — Absolute or relative (SelfUnit scope uses relative: -1=ahead, 0=self, 1=behind).
- **Adjacent** — Units at position ±1. Scope controls inclusion:
  - `Allies` — Same-team neighbors only.
  - `All` — Same-team neighbors + enemy front (if source is at position 0).
  - `Enemies` — Enemy front only (if source is at position 0).
- **Random** — N random units from scope, shuffled via RNG.
- **Standard** — Top N units sorted by stat (attack/health/mana) in ascending/descending order.
- **All** — Every unit in scope.

### Target Scopes
- `SelfUnit`, `Allies`, `Enemies`, `All`, `AlliesOther` — board-relative.
- `TriggerSource` / `Aggressor` — References the unit that caused the trigger (e.g., clash opponent for attack triggers, damage dealer for `OnHurt`).

## CombatUnit
`CombatUnit` carries only engine-relevant data: `instance_id`, `team`, `attack`, `health`, `abilities`, `card_id`, `attack_buff`, `health_buff`, `play_cost`, `ability_trigger_counts`. Display metadata like `name` is resolved from the card pool via `card_id` when building `UnitView`.

## Determinism and RNG
- Deterministic hand derivation uses seeded RNG in `game/src/state.rs` and `battle/src/rng.rs`.
- RNG is threaded through all battle functions including condition evaluation (for Random target resolution).
- Opponent selection is on chain: the arena picks a ghost board from a pool per bracket, with house ghosts for thin brackets (`pick_opponent` in `arena/src/main.rs`).

## Invariants to Respect
- Board size and hand size come from `GameConfig` (`game/src/lib.rs`).
- Battle limits (`MAX_TRIGGERS_PER_PHASE`, `MAX_SPAWNS_PER_BATTLE`, `MAX_BATTLE_ROUNDS`, etc.) are in `battle/src/limits.rs`.
