# Web UI Guide

This document is derived from `web/src/*`.

## Entry Points
- `web/src/main.tsx` initializes the React app.
- `web/src/App.tsx` is the top-level component.

## State Management
- `web/src/store/gameStore.ts` owns the `GameEngine` lifecycle and core UI state.
- `web/src/store/blockchainStore.ts` and `web/src/store/multiplayerStore.ts` manage other modes.
- `web/src/store/sandboxStore.ts` manages sandbox play.

## Shared Types
- Frontend types mirror Rust view structs in `web/src/types.ts`.
- `GameView`, `CardView`, and `BattleOutput` are consumed by UI components.

## Component Map
- Game flow components include `web/src/components/GameLayout.tsx`, `BattleArena.tsx`, `Shop.tsx`, `HUD.tsx`, and overlays.
- Multiplayer flow: `web/src/components/MultiplayerPage.tsx` and `MultiplayerManager.tsx`.
- Sandbox flow: `web/src/components/SandboxPage.tsx`.

## Styling
- Base styles are in `web/src/index.css`.
- Utility config is in `web/tailwind.config.js` and `web/postcss.config.js`.
