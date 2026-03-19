# React & Web Frontend Best Practices

The frontend is a React application built with Vite and Tailwind CSS.

## State Management
- **Zustand**: Primary state management.
  - `gameStore.ts`: Local game state, WASM engine instance, and UI states (modals, selections).
  - `blockchainStore.ts`: Wallet connection, account management, and on-chain syncing.
- **WASM Bridge**: The `gameStore` initializes the `GameEngine`. All heavy game logic is delegated to the WASM module.

## UI/UX
- **Tailwind CSS**: Use utility classes for styling. Follow the "monospace/retro-tech" aesthetic established in the `BlockchainPage` and `Arena` components.
- **Component Structure**:
  - `GameShell.tsx`: Generic game layout with DndContext, GameTopBar, Arena, ManaBar, Shop, and overlays.
  - `GameLayout.tsx`: Generic game wrapper that handles loading/error states and initialization, uses GameShell.
  - `Arena.tsx`: Main game board rendering.
  - `Shop.tsx`: Card purchasing and turn preparation.
  - `UnitCard.tsx`: Reusable card component with drag-and-drop support.
- **Feedback**: Use `react-hot-toast` for transaction feedback and validation errors.

## Custom Hooks

The `web/src/hooks/` directory contains shared hooks:

### `useDragAndDrop`
Encapsulates all drag-and-drop logic in one place:
- Sensor configuration (MouseSensor, TouchSensor)
- `restrictToContainer` modifier
- `handleDragStart` / `handleDragEnd` handlers
- Body scroll prevention effect
- `getActiveCard` helper
- `autoScroll={false}` (critical for mobile)

```tsx
import { useDragAndDrop } from '../hooks';

function MyGameComponent() {
  const {
    activeId,
    sensors,
    restrictToContainer,
    containerRef,
    handleDragStart,
    handleDragEnd,
    getActiveCard,
  } = useDragAndDrop();

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToContainer]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      autoScroll={false}
    >
      <div ref={containerRef}>...</div>
    </DndContext>
  );
}
```

### `useInitGuard`
Prevents double-execution in React StrictMode:

```tsx
import { useInitGuard } from '../hooks';

function MyComponent() {
  const init = useGameStore((state) => state.init);

  useInitGuard(() => {
    init();
  }, [init]);
}
```

## Naming Conventions

- **`*Page`**: Route-level entry points with mode-specific setup (e.g., `BlockchainPage`, `SandboxPage`, `MultiplayerPage`)
- **`*Layout`**: Layout wrappers that handle state/structure (e.g., `GameLayout`)
- **`*Shell`**: The actual UI shell/container (e.g., `GameShell`)
- **`*Overlay`**: Modal/overlay components (e.g., `BattleOverlay`, `BagOverlay`)
- **`*Manager`**: Non-visual coordination components (e.g., `MultiplayerManager`)
- **No prefix**: Generic reusable UI components (e.g., `Arena`, `Shop`, `UnitCard`)

## Component Architecture

```
GameShell (generic)
├── GameTopBar
├── Arena
├── ManaBar
├── Shop
├── CardDetailPanel
├── BattleOverlay
├── BagOverlay
└── RotatePrompt

GameLayout (generic wrapper)
├── init() via useInitGuard
├── Loading/error states
└── GameShell

LocalGamePage (local game route)
└── GameLayout

MultiplayerGame (multiplayer route)
├── Connection guard
├── MultiplayerManager
└── GameLayout

BlockchainPage (blockchain mode)
├── Connection UI (when not connected)
├── Session Setup UI (when no chain state)
└── GameShell (when game is active)
```

## IMPORTANT: DndContext autoScroll Must Be Disabled

The `useDragAndDrop` hook handles this automatically. If you create a custom DndContext, ensure `autoScroll={false}` is set to prevent scroll issues on mobile and touch devices.

**Components using DndContext via `useDragAndDrop`:**
- `GameShell.tsx` - the single source of truth for game DnD

**Rule:** Use the `useDragAndDrop` hook instead of duplicating DndContext setup.

## CRITICAL: Preventing WASM Memory Issues

React's StrictMode (enabled in development) intentionally double-invokes effects to help detect side effects. This causes serious problems with WASM initialization because:

1. The WASM module allocates memory on each call
2. Double-execution leads to memory leaks and corruption
3. These bugs are hard to debug and may only appear intermittently

**Use the `useInitGuard` hook:**

```tsx
import { useInitGuard } from '../hooks';

function MyComponent() {
  const init = useGameStore((state) => state.init);

  useInitGuard(() => {
    init();
  }, [init]);
}
```

**Examples in codebase:**
- `GameLayout.tsx` - guards `init()` call (used by LocalGamePage.tsx and MultiplayerGame.tsx)
- `LocalGamePage.tsx` - guards initialization
- `SandboxPage.tsx` - guards `init()` call
- `BlockchainPage.tsx` - guards `init()` and `refresh()` calls
- `AuthGate.tsx` - guards blockchain connection on mount
- `LoginPage.tsx` - guards session restore
- `AchievementsPage.tsx` - guards achievement data fetch
- `TournamentPage.tsx` - guards tournament state initialization
- `CardsPage.tsx`, `SetPage.tsx`, `GhostBrowserPage.tsx` - guard data fetches

**Rule:** Any initialization that calls into the WASM engine MUST use `useInitGuard`.

## CardDetailPanel Modes

The `CardDetailPanel` supports a discriminated union for different modes:

```tsx
type CardDetailPanelMode =
  | { type: 'standard' }
  | { type: 'sandbox' }
  | { type: 'readOnly' }
  | { type: 'blockchain'; blockNumber: number | null; accounts: BlockchainAccount[]; ... }
```

Use the `mode` prop for new code. Legacy props (`isSandbox`, `isReadOnly`, `blockchainMode`) are still supported for backwards compatibility.
