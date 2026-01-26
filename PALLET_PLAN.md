# Substrate Pallet Implementation Plan

## Overview

Build a Substrate pallet (`pallet-auto-battle`) that acts as a decentralized server for the auto-battler. The pallet verifies all game state transitions on-chain, provides deterministic RNG, and coordinates PvP matchmaking via saved "ghost boards."

## Architecture

```
manalimit-core (no_std library)
    |
    v
pallet-auto-battle (Substrate pallet)
    |-- uses manalimit-core for turn verification (every turn)
    |-- uses manalimit-core for battle resolution (only during disputes)
    |-- stores game state, cards, sets, bags on-chain
    |-- provides deterministic hand derivation via game_seed
    |-- matches players against ghost boards
    |-- manages prize pools and token economics
    |-- OPTIMISTIC: players report battle results, chain verifies only on dispute
```

## Terminology

- **Card**: A unique game-mechanic definition (stats + abilities), identified by its content hash.
- **Set**: A curated collection of card hashes, used to generate a bag.
- **Bag**: The unordered pool of cards a player owns during a run.
- **Hand**: A deterministic selection of 7 cards from the bag, unique to each round.
- **CommitTurnAction**: A single object containing all moves made during a planning phase (pitched cards, played cards, board reordering).
- **Ghost Board**: A snapshot of a player's board at end-of-turn, saved on-chain for asynchronous PvP.
- **Optimistic Verification**: Players compute battles off-chain and report results. The chain accepts them tentatively.
- **Dispute**: Any user can challenge a reported result. The chain runs the battle logic to verify the truth and slashes liars.

---

## Feature Breakdown

### Phase 1: Optimistic Game Loop

The minimum viable pallet: a single-player run where turn legality is verified on-chain, but battles are reported optimistically.

#### Storage

```rust
/// Active game session per player
#[pallet::storage]
ActiveGame<T> = StorageMap<_, Blake2_128Concat, T::AccountId, GameSession<T>>;

/// Data required to verify the last reported battle for a player
#[pallet::storage]
LastBattleProof<T> = StorageMap<_, Blake2_128Concat, T::AccountId, BattleProof<T>>;
```

```rust
/// A game session stored on-chain
pub struct GameSession<T: Config> {
    pub state: GameState,          // bag, board, wins, lives, round, game_seed
    pub set_hash: H256,            // which set this run uses
    pub entry_fee: BalanceOf<T>,   // tokens locked for this run
    pub started_at: BlockNumberFor<T>,
}

/// Snapshot to allow verification of both turn and battle
pub struct BattleProof<T: Config> {
    pub round: i32,
    pub action: CommitTurnAction,      // The moves the player made
    pub start_state: GameState,       // State BEFORE the turn
    pub opponent_board: BoundedVec<BoardUnit, ConstU32<5>>,
    pub claimed_result: BattleResult,
}
```

#### Extrinsics

| Extrinsic | Description |
|-----------|-------------|
| `start_game(set_hash)` | Lock entry fee, initialize bag from set, generate `game_seed`. |
| `commit_turn(action, result)` | Submit all planning moves + claimed battle result. Chain calls `verify_and_apply_turn()` immediately. Updates state (wins/lives) optimistically based on `result`. |
| `dispute_battle(target_player)` | Challenger claims `target_player` lied about battle result. Chain runs `resolve_battle`. Slashes liar. |
| `forfeit()` | Abandon current run. |

#### Deterministic Hand Derivation

The pallet (and core engine) derives the hand for each round using:
`XorShiftRng::seed_from_u64(game_seed ^ round)`
This ensures that both the player and the chain know exactly which 7 cards were available to be played/pitched without storing the hand in state.

#### Turn & Battle Flow

**1. Planning (Off-chain)**
- Player sees their hand (derived from `game_seed` and `round`).
- Player reorders board, pitches cards for mana, and plays cards to the board.
- Player records these moves in a `CommitTurnAction`.

**2. Submission (`commit_turn`)**
- Player submits `commit_turn(action, claimed_result)`.
- **Turn Verification (Synchronous):** Chain calls `manalimit_core::verify_and_apply_turn(state, action)`.
    - If `action` is illegal (e.g., played a card not in hand, not enough mana), the transaction fails.
- **State Update (Optimistic):** If turn is legal, chain updates `state.wins` or `state.lives` based on the `claimed_result`.
- **Opponent Selection:** Chain selects a ghost board for the *next* round (or uses it to verify the current `claimed_result` in a dispute).
- Stores `BattleProof` for the round.

**3. Dispute (`dispute_battle`)**
- Challenger calls `dispute_battle(target)`.
- Chain loads `BattleProof`.
- Chain re-runs `verify_and_apply_turn` (to get the exact board state after the turn) and then `resolve_battle`.
- **If Chain Result != Claimed Result:** Target is slashed.
- **If Chain Result == Claimed Result:** Challenger is slashed.

---

### Phase 2: Card Registry

Identical to original plan. Cards are identified by content hash.

---

### Phase 3: Sets & Bag Generation

Sets are used to populate the initial `bag` in `start_game`.
- Bags are unordered (unlike the original "deck" model).
- `start_game` samples cards from the set to fill the `bag` (e.g., 30 cards).

---

### Phase 4: Ghost Boards & PvP Matchmaking

- When `commit_turn` is called, the *new* board state (after `action` is applied) is saved as a ghost board.
- Matchmaking uses these saved boards for future players.

---

## Key Design Decisions

### Single-Extrinsic Planning Phase
By submitting the entire turn at once, we drastically reduce on-chain transaction volume (1 extrinsic per round instead of 5-10). It also makes verification much simpler as the chain only needs to check the transition from "Start of Turn" to "End of Turn".

### Deterministic Hands
Deriving the hand from a seed ensures the player cannot "roll" for a better hand by calling different extrinsics. The cards in their hand are fixed the moment the `game_seed` is generated at `start_game`.

### Two-Layer Verification
1. **Turn Legality**: Verified immediately on every `commit_turn`. Cheap and prevents most forms of cheating (e.g., playing 10 legendaries).
2. **Battle Correctness**: Verified optimistically via disputes. Expensive logic only runs when someone is accused of lying.

---

## Implementation Order

1. **Core Verification**: Ensure `manalimit_core::verify_and_apply_turn` is robust.
2. **Pallet Scaffold**: Basic storage and `start_game` with `game_seed`.
3. **Commit Turn**: Implement `commit_turn` extrinsic with synchronous turn verification.
4. **Optimistic Battle**: Implement result reporting and `BattleProof` storage.
5. **Dispute System**: Implement on-chain battle resolution for disputes.
6. **Ghost Boards**: Add automated ghost saving on `commit_turn`.
