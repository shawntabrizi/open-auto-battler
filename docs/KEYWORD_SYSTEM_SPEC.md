# Keyword System Specification (v1.0)

Status: Proposed for implementation  
Owner: Game Design + Core Engine  
Last Updated: 2026-02-27

## 1. Purpose

Define a small, deterministic keyword/status system for units that is:

- common across card battlers (`Shield`, `Poison`, `Taunt/Guard`)
- cheap to execute on-chain
- explicit enough for replay/UI
- compatible with current `core` battle + shop architecture

This document is normative for implementation.

## 2. Goals and Non-Goals

### Goals

- Add exactly 3 v1 keywords:
  - `Shield` (Divine Shield / Melon-like)
  - `Poison`
  - `Guard` (UI label may show as `Taunt`)
- Support keywords as:
  - static card traits
  - permanently granted in shop (until sold)
  - optionally granted during battle (this battle only)
- Preserve deterministic outcomes for identical seeds + inputs.
- Keep complexity low (bitflags, O(1)/O(n board size)).

### Non-Goals (v1)

- No broad status framework (stun, freeze, silence, stealth, ward stacks, etc.).
- No continuous layer system (MTG-like dependency stack).
- No keyword durations beyond:
  - permanent on board (shop state)
  - transient in current battle.

## 3. Terminology

- Permanent keyword: persists on `BoardUnit` until sold/removed.
- Battle keyword: runtime keyword active only in battle simulation.
- Consumed keyword: runtime keyword removed after use (e.g. `Shield`).

## 4. Keyword Set

## 4.1 `Shield`

Rule:

- When unit would take **positive damage**, prevent all that damage once.
- Remove `Shield` from that unit (battle state).
- If all damage is prevented, unit is **not considered hurt**.

Scope:

- Applies to clash damage and `AbilityEffect::Damage`.
- Does **not** prevent `Destroy` (destroy is unconditional removal).

## 4.2 `Poison`

Rule:

- When a unit with `Poison` deals **positive clash/attack damage** to a unit without active shield, target becomes lethal (`health = 0`).

Scope:

- v1 applies poison to clash attack damage only.
- v1 does not apply poison to arbitrary ability damage.

## 4.3 `Guard` (Taunt)

Rule:

- When choosing enemy targets for single/limited enemy targeting, if any enemy has `Guard`, only guarded enemies are valid candidates.

Applies to enemy-targeting selectors:

- `Position { scope: Enemies }`
- `Random { scope: Enemies }`
- `Standard { scope: Enemies }`

Does not apply to:

- `All { scope: Enemies }` (AOE still hits all enemies)
- normal front-vs-front clash targeting

## 5. Data Model

## 5.1 Types

Add:

- `enum Keyword { Shield, Poison, Guard }`
- `struct KeywordMask(u16)` with bit operations

Bit allocation:

- bit 0: `Shield`
- bit 1: `Poison`
- bit 2: `Guard`

Reserve remaining bits for future keywords.

## 5.2 Card and Unit State

`UnitCard`:

- add `base_keywords: KeywordMask`

`BoardUnit`:

- add `perm_keywords: KeywordMask`

`CombatUnit`:

- add `keywords: KeywordMask` (active battle keywords)

Initialization at battle start:

- `CombatUnit.keywords = card.base_keywords | board_unit.perm_keywords`

## 5.3 Serialization Requirements

Update SCALE/serde mappings in all shared structs:

- `core/src/types.rs`
- `core/src/bounded.rs`
- `web/src/types.ts`
- relevant blockchain pallet conversion paths

Default for missing fields:

- empty keyword mask (`0`)

## 6. Ability System Extensions

Add effects:

- `GrantKeywordPermanent { keyword: Keyword, target: AbilityTarget }`
- `GrantKeywordThisBattle { keyword: Keyword, target: AbilityTarget }`
- `RemoveKeywordPermanent { keyword: Keyword, target: AbilityTarget }` (optional in v1, recommended to include for completeness)

For minimal v1, required:

- `GrantKeywordPermanent`
- `GrantKeywordThisBattle`

## 7. Battle Resolution Semantics

## 7.1 Damage Pipeline (normative order)

For each damage application:

1. Compute raw damage.
2. If raw damage <= 0: no-op.
3. Check target shield:
   - if shield active: consume shield, damage prevented, stop.
4. Apply damage to health.
5. If source has poison and this is clash attack damage: set target health to 0.
6. Emit events.
7. `OnHurt` eligible only if health was actually reduced at step 4.

## 7.2 `Destroy`

- `Destroy` ignores shield and sets target to dead directly.

## 7.3 Guard Filtering

Before final target selection for enemy scope (Position/Random/Standard):

1. Build candidate list.
2. If candidate list contains any guarded enemies, drop all non-guarded.
3. Continue with existing target selection logic (position, random shuffle, stat sort).

## 8. Shop Phase Semantics

Permanent keyword effects are valid in shop:

- `GrantKeywordPermanent` updates `BoardUnit.perm_keywords`.
- `RemoveKeywordPermanent` clears bits from `BoardUnit.perm_keywords`.

`GrantKeywordThisBattle` is a no-op in shop by design.

## 9. Event Model (for replay/UI/debug)

Add combat events:

- `KeywordApplied { target_instance_id, keyword, permanent: bool }`
- `KeywordRemoved { target_instance_id, keyword, permanent: bool }`
- `KeywordConsumed { target_instance_id, keyword }` (used for shield)

These events are required for precise replay and UX.

## 10. Determinism and Complexity

Determinism:

- No new RNG sources.
- Guard filtering must happen before existing random choice; same seed => same outcome.

Complexity impact:

- `Shield`/`Poison`: O(1) bit checks per damage event.
- `Guard`: O(n) filter over candidate enemies (n <= board size).
- Memory overhead: small fixed-size mask per unit.

This is acceptable for current on-chain constraints.

## 11. Compatibility and Migration

Because shared SCALE structs change:

- existing serialized sessions/ghosts may become incompatible.
- acceptable approach for pre-v1: state reset / migration gate.

Mandatory:

- bump/coordinate runtime + client + core together.
- ensure bounded conversions compile and round-trip.

## 12. Test Specification

Minimum required tests:

1. Shield blocks first incoming damage and is consumed.
2. Shield-blocked hit does not trigger `OnHurt`.
3. Destroy kills shielded unit.
4. Poison lethal on clash damage.
5. Poison + shield interaction (shield consumed, no lethal).
6. Guard restricts enemy random target pool.
7. Guard restricts enemy standard target pool.
8. AOE ignores guard restriction.
9. Permanent keyword granted in shop persists into next battle.
10. Battle-only keyword does not persist to shop state.
11. Deterministic random outcome unchanged across identical seeds.
12. SCALE encode/decode roundtrip for new keyword fields and events.

## 13. Suggested Implementation Order

1. Add `Keyword` + `KeywordMask` types and serialization.
2. Extend `UnitCard`, `BoardUnit`, `CombatUnit`.
3. Implement damage pipeline changes (`Shield`, `Poison`).
4. Implement guard filtering in battle target selection.
5. Add new ability effects and shop/battle handlers.
6. Add combat events for keyword transitions.
7. Update JSON/build parser + web types/UI.
8. Add tests and deterministic replay validation.

## 14. v1 Design Constraints

To keep v1 stable:

- No stacked shield charges (boolean only).
- Poison is binary.
- Guard is binary.
- No timed durations beyond battle/permanent split.
- No cross-turn battle damage persistence.

## 15. Open Decisions (must be locked before coding)

1. Should `Poison` apply to ability damage in v1?  
   Recommendation: No.

2. Should `RemoveKeywordPermanent` ship in v1?  
   Recommendation: Yes, low cost, future-proofs design.

3. Naming in UI: `Guard` vs `Taunt`  
   Recommendation: internal `Guard`, UI label `Taunt`.

