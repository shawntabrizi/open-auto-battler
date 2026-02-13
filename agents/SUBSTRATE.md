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

## Performance
- Battles are resolved on-chain during `submit_turn`. Keep battle complexity bounded via `MaxAbilities` and `MaxConditions` constants.
