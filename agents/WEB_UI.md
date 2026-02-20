# Web UI Guide

This document is derived from `web/src/*`.

## Entry Points
- `web/src/main.tsx` initializes the React app with routing and global Toaster.
- Route components live in `web/src/components/` and follow `*Page` or `*Game` naming convention.

## State Management
- `web/src/store/gameStore.ts` owns the `GameEngine` lifecycle and core UI state.
- `web/src/store/blockchainStore.ts` and `web/src/store/multiplayerStore.ts` manage other modes.
- `web/src/store/sandboxStore.ts` manages sandbox play.

## Shared Types
- Frontend types mirror Rust view structs in `web/src/types.ts`.
- `GameView`, `CardView`, and `BattleOutput` are consumed by UI components.

## Custom Hooks
- `web/src/hooks/useDragAndDrop.ts` - Shared drag-and-drop logic (sensors, handlers, scroll prevention).
- `web/src/hooks/useInitGuard.ts` - Prevents double-execution in React StrictMode.
- `web/src/hooks/index.ts` - Re-exports all hooks.

## Component Map

### Core Game Components
- `web/src/components/GameShell.tsx` - Generic game layout with DndContext, used by all game modes.
- `web/src/components/GameLayout.tsx` - Generic game wrapper with loading/error states and init().
- `web/src/components/Arena.tsx` - Game board rendering.
- `web/src/components/Shop.tsx` - Hand/card area.
- `web/src/components/HUD.tsx` - Top bar with stats and actions.
- `web/src/components/ManaBar.tsx` - Mana display between board and hand.
- `web/src/components/CardDetailPanel.tsx` - Side panel for card details, rules, and settings.

### Overlays
- `web/src/components/BattleOverlay.tsx` - Battle animation playback.
- `web/src/components/BagOverlay.tsx` - Bag contents viewer.
- `web/src/components/GameOverScreen.tsx` - Victory/defeat screen.
- `web/src/components/RotatePrompt.tsx` - Mobile orientation prompt.

### Mode-Specific Pages
- `web/src/components/BlockchainPage.tsx` - Blockchain game mode (wallet, on-chain turns).
- `web/src/components/MultiplayerPage.tsx` - P2P multiplayer lobby.
- `web/src/components/MultiplayerGame.tsx` - Active multiplayer game.
- `web/src/components/SandboxPage.tsx` - Unit testing sandbox.
- `web/src/components/HomePage.tsx` - Main menu.

## Responsive Design
- All new pages and components must be designed for both desktop and mobile from the start.
- Use Tailwind responsive prefixes (`lg:`, `sm:`, etc.) for font sizes, padding, spacing, grid columns, and border radii.
- Use `min-h-svh` alongside `min-h-screen` for full-height layouts.
- Hide non-essential text on small screens with `hidden lg:block` when appropriate.
- Reference existing pages like `BlockchainPage.tsx` for the responsive patterns used in this project.

## Styling
- Base styles are in `web/src/index.css`.
- Utility config is in `web/tailwind.config.js` and `web/postcss.config.js`.

## Naming Conventions
- **`*Page`**: Route-level entry points with mode-specific setup.
- **`*Layout`**: Layout wrappers that handle state/structure.
- **`*Shell`**: The actual UI shell/container.
- **`*Overlay`**: Modal/overlay components.
- **`*Manager`**: Non-visual coordination components.
- **No prefix**: Generic reusable UI components.
