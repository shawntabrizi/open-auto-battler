# Web UI Guide

This document is derived from `web/src/*`.

## Entry Points
- `web/src/main.tsx` initializes the React app with routing and global Toaster.
- Routes:
  - `/` → redirects to `/contract`
  - `/contract` → `ContractMenuPage`
  - `/contract/arena` → `ContractArenaPage`
  - `/contract/arena/game` → `ContractArenaGamePage`
  - `/customize`, `/customize/:category` — cosmetic customization
  - `/settings` — settings panel

## State Management
- `web/src/store/gameStore.ts` owns the `GameEngine` lifecycle and core UI state (the WASM engine used for local battle replay).
- `web/src/store/contractStore.ts` owns the contract connection, submits arena turns, and holds the sponsored-play (session) state.
- `web/src/store/customizationStore.ts` manages cosmetic customization state.
- `web/src/store/themeStore.ts` manages the active visual theme.
- `web/src/store/menuStore.ts` manages the hamburger menu open/close state.
- `web/src/store/settingsStore.ts` manages user settings.
- `web/src/store/cardInspectStore.ts` drives the card inspect overlay.
- `web/src/store/tutorialStore.ts` and `shortcutHelpStore.ts` drive in-game help.
- `web/src/store/txStore.ts` tracks transaction status.

## Contract Client
- `web/src/contract/index.ts` exposes `createContractBackend`, the only place that talks to the arena.
  It builds a host-routed chain client (`@parity/product-sdk-chain-client`),
  binds the arena with `@parity/product-sdk-contracts`' `createContract`, and
  signs via `@parity/product-sdk-signer`'s `SignerManager` (`HostProvider`
  with the `oab-arena.paseo` product account inside a Polkadot host,
  `DevProvider` dev accounts standalone).
- The addresses and ABIs of `@oab/arena`, `@oab/identity`, and
  `@oab/content` come from the inline manifest in `web/cdm.json` (written by
  `cdm install`, versions pinned). There is no runtime registry lookup and no
  generated bindings module; `index.ts` keeps a small typed `ArenaContract`
  view.
- `web/src/contract/registrySession.ts` — sponsored play: an `@oab/identity`
  registry session key, funded in PGAS (pipeline V1) or else PAS (V0).
- `web/src/contract/session.ts` — the chain-free sponsor policy: when to set
  up a session, and the fallback to normal signing.
- `web/src/contract/v1.ts` — options for v5 general transactions on
  extension pipeline V1.
- `web/src/contract/arenaFlows.ts` — chain-free rules of the arena calls (gas
  headroom), unit-tested.
- `web/src/contract/codec.ts` — SCALE decoders for `ModeGame` and
  `BattleReport`.
- `web/src/contract/errors.ts` — typed arena reverts and their messages.
- `BattleReported` events are extracted from the substrate `Revive.ContractEmitted`
  events surfaced in `TxResult.events`.

## Services
- `web/src/services/hostEnvironment.ts` — `isInHost()`, detected once at load.
- `web/src/services/storage.ts` — key-value storage: host local storage inside a host, browser `localStorage` otherwise.
- `web/src/services/nftOwnership.ts` — reads OAB Collectibles (collection 29)
  item metadata. The owned-items source is a disabled stub until the host
  NftPurse API ships.

## Shared Types
- Frontend types mirror Rust view structs in `web/src/types.ts`.
- `GameView`, `CardView`, and `BattleOutput` are consumed by UI components.

## Custom Hooks
- `web/src/hooks/useDragAndDrop.ts` — shared drag-and-drop logic.
- `web/src/hooks/useInitGuard.ts` — prevents double-execution in StrictMode.
- `web/src/hooks/useCardTilt.ts` — 3D tilt effect for card hover interactions.
- `web/src/hooks/useFocusTrap.ts` — focus trap for overlays/menus.

## Component Map

### Shell
- `TopBar.tsx` — navigation bar (back/title/hamburger).
- `GameTopBar.tsx` — in-game HUD bar (stats, actions, hamburger).
- `HamburgerMenu.tsx` — slide-out menu opened via `menuStore`.
- `ParticleBackground.tsx` — animated background.
- `ThemedToaster.tsx` — global toast container.
- `TransactionOverlay.tsx` — transaction signing/broadcasting overlay.

### Game
- `GameShell.tsx` — game layout with DndContext.
- `Arena.tsx` — board (shop phase).
- `BattleArena.tsx` — battle animation arena.
- `Shop.tsx` — hand/card area.
- `ManaBar.tsx`, `CardDetailPanel.tsx`, `UnitCard.tsx`, `CardFan.tsx`,
  `DndComponents.tsx`, `CardFilterBar.tsx`, `CardGallery.tsx` — primitives.

### Overlays
- `BattleOverlay.tsx` — battle animation playback.
- `BagOverlay.tsx` — bag contents viewer.
- `GameOverScreen.tsx` — game over screen (use the `onNewRun` prop to integrate with backend lifecycle).
- `CardInspectOverlay.tsx` — card detail inspection.
- `KeyboardShortcutsOverlay.tsx` — in-game shortcut help.
- `RotatePrompt.tsx`, `DesktopRecommendedBanner.tsx` — environment helpers.

### Pages
- `ContractMenuPage.tsx` — connect wallet / choose dev account.
- `ContractArenaPage.tsx` — set selection.
- `ContractArenaGamePage.tsx` — active arena game.
- `ContractGameOverScreen.tsx` — wraps `GameOverScreen` for the contract path.
- `CustomizePage.tsx`, `CustomizeCategoryPage.tsx` — cosmetic customization.
- `SettingsPage.tsx` — display/battle settings.

### Tutorials
- `tutorials/TutorialOverlay.tsx` — generic tutorial overlay; the `how-to-play` tutorial lives in `tutorials/how-to-play/`.

## Responsive Design
- Pages and components must work on desktop and mobile from the start.
- Use Tailwind responsive prefixes (`lg:`, `sm:`, etc.) for font sizes, padding, spacing, grid columns, and border radii.
- Use `min-h-svh` alongside `min-h-screen` for full-height layouts.

## Styling
- Base styles are in `web/src/index.css`.
- Utility config is in `web/tailwind.config.js` and `web/postcss.config.js`.

## Naming Conventions
- **`*Page`**: route-level entry points.
- **`*Shell`**: UI shell/container.
- **`*Overlay`**: modal/overlay components.
- **No prefix**: generic reusable UI components.
