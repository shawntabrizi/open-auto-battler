# Serverless P2P Playtest Plan

## Objective
Enable a 2-player "Head-to-Head" mode for `manalimit` that can be hosted entirely on GitHub Pages (static site), allowing developers and testers to play against each other in real-time without a dedicated backend.

## Architecture

We will use **WebRTC** for peer-to-peer data transfer. To simplify the signaling process (finding each other), we will use **PeerJS**, which provides a free public signaling server.

-   **Frontend:** React (TypeScript) + Vite + Zustand.
-   **Game Logic:** `manalimit-core` compiled to WASM.
-   **Networking:** `peerjs` (WebRTC wrapper).
-   **Hosting:** GitHub Pages (Static).

### Networking Flow
1.  **Host** opens the game and clicks "Host Game".
    -   Generates a random 4-letter Room Code (derived from PeerID).
    -   Waits for connection.
2.  **Guest** opens the game, enters Room Code, and clicks "Join".
    -   Connects to Host via PeerJS.
3.  **Connection Established**:
    -   Direct DataChannel opened between browsers.
    -   Ping/Pong to verify latency.

## Core Changes (`core/`)

The Rust core needs to expose the game state and logic to the JavaScript frontend in a serializable format.

1.  **Serialization**: Ensure all main types (`GameState`, `UnitCard`, `BoardUnit`, etc.) derive `Serialize` and `Deserialize` (already done for `std` feature, ensure it works for `wasm`).
2.  **WASM Bindings**:
    -   Update `lib.rs` (or a new `wasm.rs`) to expose a `GameWrapper` struct.
    -   Methods to `get_state() -> JsValue` (JSON object).
    -   Methods to `apply_action(json)` -> updates state.
    -   Methods to `resolve_battle(player_board, opponent_board, seed) -> BattleResult`.

## Web Changes (`web/`)

### 1. Dependencies
Add `peerjs` to `web/package.json`.
```bash
npm install peerjs
npm install -D @types/peerjs
```

### 2. State Management (Zustand)
Create a `useMultiplayerStore` to handle:
-   `peer`: The PeerJS instance.
-   `conn`: The active data connection.
-   `isHost`: Boolean.
-   `status`: 'disconnected' | 'connecting' | 'connected' | 'in-game'.
-   `logs`: Array of debug messages.

### 3. P2P Protocol (Messages)
Define a simple JSON protocol for messages sent between peers:
```typescript
type Message = 
  | { type: 'HANDSHAKE', version: string }
  | { type: 'START_GAME', seed: number }
  | { type: 'END_TURN_COMMIT', hash: string } // Commit to board state
  | { type: 'END_TURN_REVEAL', board: BoardState } // Reveal board
  | { type: 'EMOTE', id: string }
```

### 4. Game Loop (Synchronous)

**Phase A: Setup**
-   Host sends `START_GAME` with a global random seed (for shop rolls).
-   Both initialize `GameState`.

**Phase B: Shop (Parallel)**
-   Players interact with their local Shop.
-   Actions (Buy/Sell) are local-only.
-   When done, player clicks "Ready".
-   Client sends `END_TURN_COMMIT(hash(board))`.

**Phase C: Synchronization**
-   Wait until `END_TURN_COMMIT` is received from opponent.
-   Send `END_TURN_REVEAL(board)`.
-   Wait until `END_TURN_REVEAL` is received.
-   Verify `hash(received_board) === committed_hash`.

**Phase D: Battle**
-   Both clients compute `resolve_battle(my_board, enemy_board, shared_seed_for_round)`.
-   *Note:* `shared_seed_for_round` can be derived from the initial game seed + round number.
-   Play out battle animations.
-   Apply damage locally.
-   Check Win/Loss.
-   Proceed to next Shop Phase.

## Implementation Steps

1.  **WASM Exposure**: Ensure `manalimit-core` exports `GameState` as a JSON-serializable object via `wasm-bindgen`.
2.  **Basic Connection**: Implement `NetworkManager` in React. Test "Hello World" between two browser tabs.
3.  **Game State Sync**: Implement the `COMMIT` / `REVEAL` pattern for dummy data.
4.  **Integration**: Hook up the real `manalimit-core` WASM logic.
    -   Player A's board becomes Player B's "Enemy Board".
5.  **UI**: Add "Host" and "Join" buttons to the main menu.

## Security Note
Since this is client-authoritative P2P, hacked clients can cheat (e.g., send a board they couldn't afford).
For **Playtesting**, this is acceptable.
For **Production**, the "Optimistic Verification" on-chain (Pallet) is the solution.
This P2P mode is strictly for fun and testing game balance.
