# Two-Enum Ability Architecture Specification (v1.0)

Status: Implemented
Owner: Core Engine + Game Design
Last Updated: 2026-02-27

## 1. Decision

Runtime abilities are split into two lanes:
- Shop lane: `ShopAbility`
- Battle lane: `Ability` (battle ability type)

`UnitCard` stores:
- `shop_abilities: Vec<ShopAbility>`
- `battle_abilities: Vec<Ability>`

No legacy single `abilities` lane is supported.

## 2. Why

- Illegal trigger/effect/scope combinations are prevented by type/lane.
- Runtime no-op combinations are reduced.
- Shop and battle execution paths stay simpler and easier to test.

## 3. Lane Contracts

## 3.1 Shop Lane

Trigger enum:
- `ShopTrigger::{OnBuy, OnSell, OnShopStart, AfterLoss, AfterWin, AfterDraw}`

Effect enum (`ShopEffect`):
- `ModifyStatsPermanent`
- `SpawnUnit`
- `Destroy`
- `GainMana`

Target enum:
- `ShopTarget::{Position, Random, Standard, All}`

Scope enum:
- `ShopScope::{SelfUnit, Allies, All, AlliesOther, TriggerSource}`

## 3.2 Battle Lane

Trigger enum:
- `AbilityTrigger::{OnStart, OnFaint, OnAllyFaint, OnHurt, OnSpawn, OnAllySpawn, OnEnemySpawn, BeforeUnitAttack, AfterUnitAttack, BeforeAnyAttack, AfterAnyAttack, AfterAllyAttack, AfterEnemyAttack}`

Effect enum (`AbilityEffect`):
- `Damage`
- `ModifyStats`
- `ModifyStatsPermanent`
- `SpawnUnit`
- `Destroy`
- `GainMana`

The status effects (`GrantStatusThisBattle`, `GrantStatusPermanent`,
`RemoveStatusPermanent`) were removed with the status system (see
[STATUS_SYSTEM_SPEC.md](./STATUS_SYSTEM_SPEC.md)).

Target enum:
- `AbilityTarget::{Position, Adjacent, Random, Standard, All}`

Scope enum:
- `TargetScope::{SelfUnit, Allies, Enemies, All, AlliesOther, TriggerSource, Aggressor}`

## 4. Execution Paths

Shop execution:
- Implemented in `battle/src/commit.rs`
- Only `shop_abilities` are collected and executed.

Battle execution:
- Implemented in `battle/src/battle.rs`
- Only `battle_abilities` are collected and executed.

## 5. Build-Time Validation

`assets/build.rs` enforces lane correctness:
- shop-incompatible targets/scopes/effects are rejected
- battle-incompatible triggers/effects are rejected
- missing required fields (`target`, `amount`, `health`, `attack`, etc.) are rejected
- missing `SpawnUnit` card references are rejected

Cards must declare:
- `shop_abilities`
- `battle_abilities`

## 6. Shared Contracts

This architecture is propagated to:
- `battle/src/types.rs`
- `@oab/content` card publishing (`publishCard`, SCALE `UnitCard`)
- `web/src/types.ts`
- frontend ability authoring/rendering paths

## 7. Compatibility

This is a schema-level change across SCALE/serde boundaries.
The engine, the WASM client, and the contracts should be updated together.
