# Two-Enum Ability Architecture Specification (v1.0)

Status: Proposed  
Owner: Core Engine + Game Design  
Last Updated: 2026-02-27

## 1. Purpose

This specification defines a **two-enum ability system** that separates:

- shop-phase abilities
- battle-phase abilities

The primary goal is to eliminate invalid/no-op combinations by construction and improve long-term engine stability.

## 2. Decision

Adopt **two runtime ability trees**:

- `ShopAbility` (executed only in shop flow)
- `BattleAbility` (executed only in battle flow)

Do not keep a single runtime `Ability` enum with all trigger/effect combinations.

## 3. Why This Approach

## 3.1 Benefits

1. Illegal states are unrepresentable in runtime types.
2. Eliminates silent no-op card behavior from invalid combinations.
3. Reduces branch complexity inside core execution loops.
4. Improves test coverage granularity (shop tests vs battle tests).
5. Better future growth for adding mechanics without exploding validation matrix.

## 3.2 Accepted Tradeoff

Some structural duplication exists between shop and battle trees.  
Mitigation: share leaf payload structs and utility types.

## 4. Scope

In scope:

- Rust core type model changes
- JSON/build schema changes
- runtime execution path separation
- validation and migration strategy

Out of scope:

- full card rebalance
- UI redesign
- non-ability game systems

## 5. Runtime Type Model

## 5.1 New Top-Level Types

In `core/src/types.rs`, replace single `Ability` usage on cards with:

- `pub struct ShopAbility`
- `pub struct BattleAbility`

And in `UnitCard`:

- `pub shop_abilities: Vec<ShopAbility>`
- `pub battle_abilities: Vec<BattleAbility>`

## 5.2 Shop Ability Types

- `enum ShopTrigger`
  - `OnBuy`
  - `OnSell`
  - `OnShopStart`

- `enum ShopEffect`
  - `ModifyStatsPermanent { health, attack, target }`
  - `GainMana { amount }`
  - `SpawnUnit { card_id }` (optional; keep if desired for design space)
  - `Destroy { target }` (optional; recommend disabling in v1 card set)
  - keyword effects if keyword feature ships:
    - `GrantKeywordPermanent`
    - `RemoveKeywordPermanent`

- `enum ShopTarget`
  - `Position`
  - `Random`
  - `Standard`
  - `All`
  - No `Adjacent` in v1.

- `enum ShopScope`
  - `SelfUnit`
  - `Allies`
  - `AlliesOther`
  - `TriggerSource`
  - No `Enemies`, no `Aggressor`.

- `enum ShopMatcher` (minimal)
  - `StatValueCompare`
  - `UnitCount`
  - `IsPosition`
  - No `StatStatCompare` in shop v1.

## 5.3 Battle Ability Types

- `enum BattleTrigger`
  - `OnStart`
  - `OnFaint`
  - `OnAllyFaint`
  - `OnHurt`
  - `OnSpawn`
  - `OnAllySpawn`
  - `OnEnemySpawn`
  - `BeforeUnitAttack`
  - `AfterUnitAttack`
  - `BeforeAnyAttack`
  - `AfterAnyAttack`

- `enum BattleEffect`
  - `Damage { amount, target }`
  - `ModifyStats { health, attack, target }` (battle-lifetime)
  - `ModifyStatsPermanent { health, attack, target }` (persists to board/shop)
  - `SpawnUnit { card_id }`
  - `Destroy { target }`
  - `GainMana { amount }` (next-shop mana carryover semantics)
  - keyword effects if keyword feature ships:
    - `GrantKeywordThisBattle`
    - `GrantKeywordPermanent`
    - `RemoveKeywordPermanent`

- `enum BattleTarget`
  - `Position`
  - `Adjacent`
  - `Random`
  - `Standard`
  - `All`

- `enum BattleScope`
  - `SelfUnit`
  - `Allies`
  - `Enemies`
  - `All`
  - `AlliesOther`
  - `TriggerSource`
  - `Aggressor`

## 5.4 Shared Leaf Types (to reduce duplication)

Keep shared:

- `StatType`
- `SortOrder`
- `CompareOp`
- `StatDelta` (new helper struct: `health`, `attack`)
- `CardId`
- `max_triggers` semantics

Use separate top-level enums but shared payload structs where shape is identical.

## 6. Execution Model

## 6.1 Shop Path

`core/src/commit.rs`:

- shop trigger collection only iterates `UnitCard.shop_abilities`
- shop target/matcher evaluators accept only shop enums
- remove fallback/no-op branches that exist solely to tolerate battle-only shapes

## 6.2 Battle Path

`core/src/battle.rs`:

- trigger collection only iterates `UnitCard.battle_abilities`
- battle target/matcher evaluators accept only battle enums
- remove guard code for shop-only triggers/effects

## 7. Validation Rules (Build-Time)

In `core/build.rs`, reject cards that violate runtime constraints:

1. Unknown trigger/effect/target for lane.
2. Shop ability using battle-only scope.
3. Shop ability using `Adjacent`.
4. Shop condition using `StatStatCompare`.
5. Missing target where effect requires one.
6. Spawn references to missing card IDs.

Build should fail fast with card id + ability name in error message.

## 8. JSON Authoring Contract

Preferred v1.0 card schema:

- `shop_abilities: [...]`
- `battle_abilities: [...]`

Transitional compatibility (optional):

- accept legacy `abilities: [...]` and lower by trigger lane in build script
- emit warning and a deprecation notice

Target end-state:

- only split fields remain in authored JSON.

## 9. Compatibility and Migration

This is a shared-struct change affecting SCALE and JSON contracts.

Required updates:

- `core/src/types.rs`
- `core/src/bounded.rs`
- `core/build.rs`
- `web/src/types.ts`
- pallet conversion boundaries

Runtime compatibility:

- existing serialized sessions/ghosts may need reset or explicit migration.
- pre-v1 acceptable strategy: state reset.

## 10. Testing Requirements

Minimum mandatory tests:

1. Shop trigger executes only shop ability list.
2. Battle trigger executes only battle ability list.
3. Invalid cross-lane JSON card fails build.
4. Shop scope restrictions enforced.
5. Battle trigger ordering unchanged from current behavior.
6. Permanent stat application across battle->shop unchanged.
7. SCALE round-trip with split ability fields.
8. Deterministic random behavior unchanged for fixed seed.

## 11. Rollout Plan

Phase 1:

- add new types and adapters
- keep legacy parser fallback
- ensure all tests pass

Phase 2:

- migrate all cards to split schema
- remove fallback parser

Phase 3:

- remove legacy single-ability references from UI/editor and runtime

## 12. Design Constraints for v1.0

1. No runtime fallback no-ops for invalid ability combinations.
2. Every card in shipped sets must pass strict build validation.
3. If a mechanic is unsupported in a lane, it must be rejected at build time.
4. Preserve deterministic battle/shop outcomes.

## 13. Open Decisions (must be locked before implementation)

1. Keep or disable `Destroy` in shop lane for v1 card design?
2. Keep or disable `BeforeAnyAttack/AfterAnyAttack` in shipped sets for cost control?
3. Keep transitional legacy `abilities` parser or cut immediately?

## 14. Summary

For long-term engine stability and growth, use:

- **Two runtime enums (shop + battle)**
- **Shared leaf payload structs**
- **Strict build-time validation**

This gives strong correctness guarantees without requiring a fully duplicated implementation surface.

