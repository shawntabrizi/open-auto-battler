import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';
import { HomePage } from './components/HomePage.tsx';
import { LocalGamePage } from './components/LocalGamePage.tsx';
import { SandboxPage } from './components/SandboxPage.tsx';
import { MultiplayerPage } from './components/MultiplayerPage.tsx';
import { MultiplayerGame } from './components/MultiplayerGame.tsx';
import { BlockchainPage } from './components/BlockchainPage.tsx';
import { CreateSetPage } from './components/CreateSetPage.tsx';
import { CreateCardPage } from './components/CreateCardPage.tsx';

// Lazy-loaded features (code-split, no impact on main bundle)
import { PresentationsPage, PresentationViewer, EmbedPage } from './features/presentations';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Toaster position="top-right" />
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/local" element={<LocalGamePage />} />
        <Route path="/sandbox" element={<SandboxPage />} />
        <Route path="/multiplayer" element={<MultiplayerPage />} />
        <Route path="/multiplayer/game" element={<MultiplayerGame />} />
        <Route path="/blockchain" element={<BlockchainPage />} />
        <Route path="/blockchain/create-card" element={<CreateCardPage />} />
        <Route path="/blockchain/create-set" element={<CreateSetPage />} />
        <Route path="/embed" element={<Suspense fallback={<div className="min-h-screen bg-gray-900" />}><EmbedPage /></Suspense>} />
        <Route path="/presentations" element={<Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>}><PresentationsPage /></Suspense>} />
        <Route path="/presentations/:id" element={<Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>}><PresentationViewer /></Suspense>} />
        <Route path="/presentations/:id/:slideNum" element={<Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>}><PresentationViewer /></Suspense>} />
      </Routes>
    </HashRouter>
  </StrictMode>
);
