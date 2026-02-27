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
- `ShopTrigger::{OnBuy, OnSell, OnShopStart}`

Effect enum (`ShopEffect`):
- `ModifyStatsPermanent`
- `SpawnUnit`
- `Destroy`
- `GainMana`
- `GrantStatusPermanent`
- `RemoveStatusPermanent`

Target enum:
- `ShopTarget::{Position, Random, Standard, All}`

Scope enum:
- `ShopScope::{SelfUnit, Allies, All, AlliesOther, TriggerSource}`

## 3.2 Battle Lane

Trigger enum:
- `AbilityTrigger::{OnStart, OnFaint, OnAllyFaint, OnHurt, OnSpawn, OnAllySpawn, OnEnemySpawn, BeforeUnitAttack, AfterUnitAttack, BeforeAnyAttack, AfterAnyAttack}`

Effect enum (`AbilityEffect`):
- `Damage`
- `ModifyStats`
- `ModifyStatsPermanent`
- `SpawnUnit`
- `Destroy`
- `GainMana`
- `GrantStatusThisBattle`
- `GrantStatusPermanent`
- `RemoveStatusPermanent`

Target enum:
- `AbilityTarget::{Position, Adjacent, Random, Standard, All}`

Scope enum:
- `TargetScope::{SelfUnit, Allies, Enemies, All, AlliesOther, TriggerSource, Aggressor}`

## 4. Execution Paths

Shop execution:
- Implemented in `core/src/commit.rs`
- Only `shop_abilities` are collected and executed.

Battle execution:
- Implemented in `core/src/battle.rs`
- Only `battle_abilities` are collected and executed.

## 5. Build-Time Validation

`core/build.rs` enforces lane correctness:
- shop-incompatible targets/scopes/effects are rejected
- battle-incompatible triggers/effects are rejected
- missing required fields (`target`, `amount`, `health`, `attack`, `status`, etc.) are rejected
- missing `SpawnUnit` card references are rejected

Cards must declare:
- `shop_abilities`
- `battle_abilities`

## 6. Shared Contracts

This architecture is propagated to:
- `core/src/types.rs`
- `core/src/bounded.rs`
- pallet user card data and conversions
- `web/src/types.ts`
- frontend ability authoring/rendering paths

## 7. Compatibility

This is a schema-level change across SCALE/serde boundaries.
Runtime/client/pallet should be updated together.
