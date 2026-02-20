# Substrate & Polkadot-SDK Best Practices

The blockchain layer is built using Substrate (Polkadot-SDK).

## Pallet Development
- **Bounded Types**: Every storage item must be bounded. Use `BoundedVec` instead of `Vec`.
- **TypeInfo & MaxEncodedLen**: Ensure all custom structs derive these traits for compatibility with SCALE and weights.
- **Game Logic Decoupling**: The pallet acts as a thin wrapper around the `oab-core` engine. Avoid duplicating logic; instead, use `GameState::reconstruct` to run calculations.
- **NextId Pattern**: Use `StorageValue<_, u32, ValueQuery>` to track IDs for cards, sets, and ghosts.

## Storage Layout
- `UserCards`: Stores immutable game logic data.
- `CardMetadataStore`: Stores mutable display data (Name, Emoji).
- `ActiveGame`: Maps `AccountId` to `GameSession`.
- `GhostOpponents`: Multi-keyed map for matchmaking brackets.

## Pallet Design Principles
- **Single-purpose extrinsics**: Each extrinsic should do one specific end-to-end thing. Do not add optional parameters that branch into different behaviors. If a new mode needs different logic, create a new extrinsic.
- **Use `BalanceOf<T>`**: Never use raw `u128` for balance fields in storage structs. Always use the pallet's `BalanceOf<T>` type alias.
- **Use Substrate arithmetic types**: For percentages, use `Perbill`, `Permill`, or `Percent` from `sp_runtime` instead of raw basis points or integer ratios.

## Performance
- Battles are resolved on-chain during `submit_turn`. Keep battle complexity bounded via `MaxAbilities` and `MaxConditions` constants.
