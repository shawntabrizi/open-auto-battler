# Status System Specification (v1.0)

Status: Implemented
Owner: Game Design + Core Engine
Last Updated: 2026-02-27

## 1. Purpose

Define a small, deterministic, on-chain friendly status system for units.

v1 statuses:
- `Shield`
- `Poison`
- `Guard` (UI label may show `Taunt`)

## 2. Data Model

## 2.1 Core Types

- `enum Status { Shield, Poison, Guard }`
- `struct StatusMask([u8; 32])`

`StatusMask` is a fixed 256-bit mask.
- Supports up to 256 statuses without changing storage shape.
- SCALE encoding size is fixed and deterministic.

## 2.2 State Fields

`UnitCard`
- `base_statuses: StatusMask`

`BoardUnit`
- `perm_statuses: StatusMask`

`CombatUnit`
- `base_statuses: StatusMask`
- `permanent_statuses: StatusMask`
- `battle_statuses: StatusMask`
- `consumed_statuses: StatusMask`

Active battle statuses are computed as:
- `(base_statuses | permanent_statuses | battle_statuses) - consumed_statuses`

## 3. Ability Effects

Battle (`AbilityEffect`):
- `GrantStatusThisBattle { status, target }`
- `GrantStatusPermanent { status, target }`
- `RemoveStatusPermanent { status, target }`

Shop (`ShopEffect`):
- `GrantStatusPermanent { status, target }`
- `RemoveStatusPermanent { status, target }`

## 4. Battle Semantics

## 4.1 Shield

- On incoming positive damage (`Clash` or `AbilityEffect::Damage`):
  - consume `Shield`
  - prevent all damage
- `Destroy` ignores shield.

## 4.2 Poison

- Applies only on clash attack damage.
- If source has `Poison`, dealt positive clash damage, and target did not shield-block that hit:
  - target health becomes `0`.

## 4.3 Guard

When resolving enemy-targeted selectors:
- `Position { scope: Enemies }`
- `Random { scope: Enemies }`
- `Standard { scope: Enemies }`

If at least one enemy has `Guard`, only guarded enemies remain valid targets.

`All { scope: Enemies }` is not guard-filtered.

## 4.4 OnHurt Rule

`OnHurt` is queued only when health was actually reduced (not shield-blocked).

## 5. Replay / Event Model

New battle events:
- `StatusApplied { target_instance_id, status, permanent }`
- `StatusRemoved { target_instance_id, status, permanent }`
- `StatusConsumed { target_instance_id, status }`

`UnitView` includes:
- `statuses: StatusMask`

## 6. Persistence Across Battles

Permanent status changes produced in battle are extracted from events and applied back to board units.

Engine and pallet both apply:
- permanent stat deltas
- permanent status deltas

in deterministic post-battle reconciliation.

## 7. JSON / Build Contract

Card JSON supports:
- `base_statuses: ["Shield" | "Poison" | "Guard", ...]`

Ability effects support:
- `GrantStatusThisBattle`
- `GrantStatusPermanent`
- `RemoveStatusPermanent`

with `status` + lane-appropriate `target`.

## 8. Determinism and Complexity

- No additional RNG sources.
- Guard filtering happens before random/stat-based enemy selection.
- Status checks are O(1) bit operations per interaction.
- Guard filtering is O(n) over enemy candidates (n <= board size).
