# Web UI Guide

This document is derived from `web/src/*`.

## Entry Points
- `web/src/main.tsx` initializes the React app with routing and global Toaster.
- Route components live in `web/src/components/` and follow `*Page` or `*Game` naming convention.

## State Management
- `web/src/store/gameStore.ts` owns the `GameEngine` lifecycle and core UI state.
- `web/src/store/arenaStore.ts` and `web/src/store/versusStore.ts` manage other modes.
- `web/src/store/sandboxStore.ts` manages sandbox play.
- `web/src/store/menuStore.ts` manages the hamburger menu open/close state.
- `web/src/store/achievementStore.ts` manages achievement data.
- `web/src/store/tournamentStore.ts` manages tournament state.
- `web/src/store/customizationStore.ts` manages cosmetic customization state.
- `web/src/store/settingsStore.ts` manages user settings.

## Shared Types
- Frontend types mirror Rust view structs in `web/src/types.ts`.
- `GameView`, `CardView`, and `BattleOutput` are consumed by UI components.

## Custom Hooks
- `web/src/hooks/useDragAndDrop.ts` - Shared drag-and-drop logic (sensors, handlers, scroll prevention).
- `web/src/hooks/useInitGuard.ts` - Prevents double-execution in React StrictMode.
- `web/src/hooks/useCardTilt.ts` - 3D tilt effect for card hover interactions.
- `web/src/hooks/index.ts` - Re-exports `useDragAndDrop` and `useInitGuard`.

## Component Map

### Navigation Components
- `web/src/components/TopBar.tsx` - Standard navigation bar (back button, title, hamburger trigger) for all non-game pages.
- `web/src/components/GameTopBar.tsx` - In-game navigation bar with stats, actions, and hamburger trigger.
- `web/src/components/HamburgerMenu.tsx` - Slide-out menu, mounted once at app root. Opened via `menuStore`.
- `web/src/components/AuthGate.tsx` - Login gate wrapping the entire app. Renders `LoginPage` when not logged in.
- `web/src/components/LoginPage.tsx` - Account selection, connection, and login screen.

### Core Game Components
- `web/src/components/GameShell.tsx` - Generic game layout with DndContext, used by all game modes.
- `web/src/components/GameLayout.tsx` - Generic game wrapper with loading/error states and init().
- `web/src/components/Arena.tsx` - Game board rendering (shop phase).
- `web/src/components/BattleArena.tsx` - Battle animation arena with speed controls.
- `web/src/components/Shop.tsx` - Hand/card area.
- `web/src/components/ManaBar.tsx` - Mana display between board and hand.
- `web/src/components/CardDetailPanel.tsx` - Side panel for card details, rules, and settings.
- `web/src/components/UnitCard.tsx` - Reusable card component with drag-and-drop support.
- `web/src/components/DndComponents.tsx` - Drag-and-drop helper components.

### Overlays
- `web/src/components/BattleOverlay.tsx` - Battle animation playback.
- `web/src/components/BagOverlay.tsx` - Bag contents viewer.
- `web/src/components/GameOverScreen.tsx` - Game over screen.
- `web/src/components/RotatePrompt.tsx` - Mobile orientation prompt.
- `web/src/components/TransactionOverlay.tsx` - Transaction signing/broadcasting overlay.

### Mode-Specific Pages
- `web/src/components/PracticePage.tsx` - Practice mode pre-game.
- `web/src/components/PracticeGamePage.tsx` - Active practice game.
- `web/src/components/ArenaPage.tsx` - Arena mode pre-game.
- `web/src/components/ArenaGamePage.tsx` - Active arena game.
- `web/src/components/TournamentLobbyPage.tsx` - Tournament lobby.
- `web/src/components/TournamentGamePage.tsx` - Active tournament game.
- `web/src/components/VersusPage.tsx` - P2P versus lobby.
- `web/src/components/VersusGame.tsx` - Active versus game.

### Menu & Hub Pages
- `web/src/components/HomePage.tsx` - Main menu.
- `web/src/components/PlayPage.tsx` - Play mode selection.
- `web/src/components/SetsPage.tsx` - Set browser and selection.
- `web/src/components/SetPage.tsx` - Single set preview.
- `web/src/components/SandboxPage.tsx` - Card Sandbox (browse all cards, test battles).
- `web/src/components/HistoryPage.tsx` - History hub.
- `web/src/components/AchievementsPage.tsx` - Achievement tracking.
- `web/src/components/StatsPage.tsx` - Player stats.
- `web/src/components/BattleHistoryPage.tsx` - Battle history (placeholder).
- `web/src/components/CustomizePage.tsx` - Customization hub.
- `web/src/components/CustomizeCategoryPage.tsx` - Per-category customization.
- `web/src/components/SettingsPage.tsx` - Settings.
- `web/src/components/AccountPage.tsx` - Account info.
- `web/src/components/NetworkPage.tsx` - Network/endpoint picker.
- `web/src/components/MarketplacePage.tsx` - Marketplace (placeholder).
- `web/src/components/GhostBrowserPage.tsx` - Ghost opponent browser.

### Creator Studio
- `web/src/components/CreatorPage.tsx` - Creator Studio landing page.
- `web/src/components/CreateCardPage.tsx` - Card creator.
- `web/src/components/CreateSetPage.tsx` - Set creator.
- `web/src/components/MintNftPage.tsx` - NFT minting.
- `web/src/components/MintNftPage.tsx` - NFT minting.
- `web/src/components/DevPage.tsx` - Dev preview page.
- `web/src/components/GameOverPreview.tsx` - Game over screen preview.

### Shared UI Components
- `web/src/components/NftGrid.tsx` - NFT tile grid for customization pages.
- `web/src/components/CustomizationPreview.tsx` - Live preview of cosmetic customizations.
- `web/src/components/IpfsImage.tsx` - IPFS image loader.
- `web/src/components/ParticleBackground.tsx` - Animated particle background.
- `web/src/components/Icons.tsx` - SVG icon components.

## Responsive Design
- All new pages and components must be designed for both desktop and mobile from the start.
- Use Tailwind responsive prefixes (`lg:`, `sm:`, etc.) for font sizes, padding, spacing, grid columns, and border radii.
- Use `min-h-svh` alongside `min-h-screen` for full-height layouts.
- Hide non-essential text on small screens with `hidden lg:block` when appropriate.
- Reference existing pages like `ArenaPage.tsx` for the responsive patterns used in this project.

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
