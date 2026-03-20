import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';
import { AuthGate } from './components/AuthGate.tsx';
import { HomePage } from './components/HomePage.tsx';
import { PlayPage } from './components/PlayPage.tsx';
import { HistoryPage } from './components/HistoryPage.tsx';
import { AchievementsPage } from './components/AchievementsPage.tsx';
import { StatsPage } from './components/StatsPage.tsx';
import { BattleHistoryPage } from './components/BattleHistoryPage.tsx';
import { LocalGamePage } from './components/LocalGamePage.tsx';
import { SandboxPage } from './components/SandboxPage.tsx';
import { MultiplayerPage } from './components/MultiplayerPage.tsx';
import { MultiplayerGame } from './components/MultiplayerGame.tsx';
import { BlockchainPage } from './components/BlockchainPage.tsx';
import { CreateSetPage } from './components/CreateSetPage.tsx';
import { CreateCardPage } from './components/CreateCardPage.tsx';
import { CustomizePage } from './components/CustomizePage.tsx';
import { CustomizeCategoryPage } from './components/CustomizeCategoryPage.tsx';
import { MintNftPage } from './components/MintNftPage.tsx';
import { GhostBrowserPage } from './components/GhostBrowserPage.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
import { NetworkPage } from './components/NetworkPage.tsx';
import { AccountPage } from './components/AccountPage.tsx';
import { ShopPage } from './components/ShopPage.tsx';
import { HamburgerMenu } from './components/HamburgerMenu.tsx';
import { DevPage } from './components/DevPage.tsx';
import { SetPage } from './components/SetPage.tsx';
import { GameOverPreview } from './components/GameOverPreview.tsx';
import { TransactionOverlay } from './components/TransactionOverlay.tsx';
import { ArenaGamePage } from './components/ArenaGamePage.tsx';
import { PracticeGamePage } from './components/PracticeGamePage.tsx';
import { SetsPage } from './components/SetsPage.tsx';
import { CreatorPage } from './components/CreatorPage.tsx';
import { VersusRedirect } from './components/VersusRedirect.tsx';
import { TournamentRedirect } from './components/TournamentRedirect.tsx';
import { TournamentLobbyPage } from './components/TournamentLobbyPage.tsx';
import { TournamentGamePage } from './components/TournamentGamePage.tsx';

// Lazy-loaded features (code-split, no impact on main bundle)
import { PresentationsPage, PresentationViewer, EmbedPage } from './features/presentations';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Toaster position="top-right" />
    <TransactionOverlay />
    <HashRouter>
      <AuthGate>
        <HamburgerMenu />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/cards" element={<SandboxPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/achievements" element={<AchievementsPage />} />
          <Route path="/history/stats" element={<StatsPage />} />
          <Route path="/history/battles" element={<BattleHistoryPage />} />
          <Route path="/sets" element={<SetsPage />} />
          <Route path="/practice" element={<LocalGamePage />} />
          <Route path="/practice/game" element={<PracticeGamePage />} />
          <Route path="/versus" element={<VersusRedirect />} />
          <Route path="/versus/lobby" element={<MultiplayerPage />} />
          <Route path="/versus/game" element={<MultiplayerGame />} />
          <Route path="/arena" element={<BlockchainPage />} />
          <Route path="/arena/game" element={<ArenaGamePage />} />
          <Route path="/tournament" element={<TournamentRedirect />} />
          <Route path="/tournament/lobby" element={<TournamentLobbyPage />} />
          <Route path="/tournament/game" element={<TournamentGamePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/marketplace" element={<ShopPage />} />
          <Route path="/customize" element={<CustomizePage />} />
          <Route path="/customize/:category" element={<CustomizeCategoryPage />} />
          <Route path="/sets/:setId" element={<SetPage />} />
          <Route path="/dev" element={<DevPage />} />
          <Route path="/dev/game-over" element={<GameOverPreview />} />
          <Route path="/creator" element={<CreatorPage />} />
          <Route path="/creator/card" element={<CreateCardPage />} />
          <Route path="/creator/set" element={<CreateSetPage />} />
          <Route path="/creator/mint" element={<MintNftPage />} />
          <Route path="/history/ghosts" element={<GhostBrowserPage />} />
          <Route
            path="/embed"
            element={
              <Suspense fallback={<div className="min-h-screen bg-warm-900" />}>
                <EmbedPage />
              </Suspense>
            }
          />
          <Route
            path="/presentations"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen bg-warm-900 text-white flex items-center justify-center">
                    Loading...
                  </div>
                }
              >
                <PresentationsPage />
              </Suspense>
            }
          />
          <Route
            path="/presentations/:id"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen bg-warm-900 text-white flex items-center justify-center">
                    Loading...
                  </div>
                }
              >
                <PresentationViewer />
              </Suspense>
            }
          />
          <Route
            path="/presentations/:id/:slideNum"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen bg-warm-900 text-white flex items-center justify-center">
                    Loading...
                  </div>
                }
              >
                <PresentationViewer />
              </Suspense>
            }
          />
        </Routes>
      </AuthGate>
    </HashRouter>
  </StrictMode>
);
