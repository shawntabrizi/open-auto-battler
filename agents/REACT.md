# React & Web Frontend Best Practices

The frontend is a React 18 application built with Vite and Tailwind CSS. It
runs inside a Polkadot host (Polkadot Desktop, Polkadot Mobile, dot.li) and
talks to the arena contract through the Polkadot Product SDK.

## State Management
- **Zustand**: Primary state management.
  - `gameStore.ts`: Local game state, WASM engine instance, and UI states (modals, selections).
  - `contractStore.ts`: Contract connection, account selection, arena turns, and sponsored-play status.
- **WASM Bridge**: The `gameStore` initializes the `GameEngine`. All heavy game logic is delegated to the WASM module.

## UI/UX
- **Tailwind CSS**: Use utility classes for styling. Follow the theme variables in `web/src/index.css` and the existing theme classes (for example `theme-panel`, `theme-button`).
- **Component Structure**:
  - `GameShell.tsx`: Game layout with DndContext, GameTopBar, Arena, ManaBar, Shop, and overlays.
  - `Arena.tsx`: Main game board rendering.
  - `Shop.tsx`: Card purchasing and turn preparation.
  - `UnitCard.tsx`: Reusable card component with drag-and-drop support.
- **Feedback**: Use `react-hot-toast` (via `ThemedToaster`) for validation errors, and `TransactionOverlay` (driven by `txStore`) for transaction status.

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

- **`*Page`**: Route-level entry points (e.g., `ContractMenuPage`, `ContractArenaPage`)
- **`*Shell`**: The actual UI shell/container (e.g., `GameShell`)
- **`*Overlay`**: Modal/overlay components (e.g., `BattleOverlay`, `BagOverlay`)
- **`*Panel`**: Sections inside a page (e.g., `CardDetailPanel`)
- **No prefix**: Generic reusable UI components (e.g., `Arena`, `Shop`, `UnitCard`)

## Component Architecture

```
GameShell (generic)
├── GameTopBar
├── CardDetailPanel
├── Arena
├── ManaBar
├── Shop
├── BattleOverlay
├── BagOverlay
├── KeyboardShortcutsOverlay
└── RotatePrompt

ContractMenuPage (/contract)
├── Connect / account selection
└── Link: Contract Arena

ContractArenaPage (/contract/arena)
└── Start Game (casual)

ContractArenaGamePage (/contract/arena/game)
├── GameShell (while the game is active)
└── ContractGameOverScreen (when the run is over)
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

**Current guards:**
- `gameStore.initEngine()` keeps one shared init promise and returns early when the engine exists. Pages call it from an effect only when `engine` is null (`ContractArenaPage.tsx`, `ContractArenaGamePage.tsx`).
- `contractStore.refreshGameState()` has a reentrancy guard, because a concurrent `init_from_mode_game` on the shared engine is not safe.

**Rule:** Any new initialization that calls into the WASM engine MUST be idempotent: go through `initEngine()`, or wrap it in `useInitGuard`.

## CardDetailPanel

`CardDetailPanel` takes `card`, `isVisible`, an optional `layout` (`'fixed'` or `'contained'`), `onClose`, and the card's rarity weights. It reads card names and the raw-JSON setting from `gameStore`.
