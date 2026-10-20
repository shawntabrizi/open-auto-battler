import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemedToaster } from './components/ThemedToaster.tsx';
import './index.css';
import { CustomizePage } from './components/CustomizePage.tsx';
import { CustomizeCategoryPage } from './components/CustomizeCategoryPage.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
import { HamburgerMenu } from './components/HamburgerMenu.tsx';
import { TransactionOverlay } from './components/TransactionOverlay.tsx';
import { ContractMenuPage } from './components/ContractMenuPage.tsx';
import { ContractArenaPage } from './components/ContractArenaPage.tsx';
import { ContractArenaGamePage } from './components/ContractArenaGamePage.tsx';
import { ThemeController } from './theme/ThemeController.tsx';
import { ParticleBackground } from './components/ParticleBackground.tsx';
import { applyResolvedThemeToDocument } from './theme/themes.ts';
import { useThemeStore } from './store/themeStore.ts';
import { isInHost } from './services/hostEnvironment.ts';
import { initHostStorage } from './services/storage.ts';

import { TutorialOverlay } from './components/tutorials/TutorialOverlay';
import { CardInspectOverlay } from './components/CardInspectOverlay';

async function boot() {
  if (isInHost()) {
    await initHostStorage();
  }

  applyResolvedThemeToDocument(useThemeStore.getState().activeTheme);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemedToaster />
      <TransactionOverlay />
      <TutorialOverlay />
      <CardInspectOverlay />
      <HashRouter>
        <ThemeController />
        <ParticleBackground />
        <HamburgerMenu />
        <Routes>
          <Route path="/" element={<Navigate to="/contract" replace />} />
          <Route path="/contract" element={<ContractMenuPage />} />
          <Route path="/contract/arena" element={<ContractArenaPage />} />
          <Route path="/contract/arena/game" element={<ContractArenaGamePage />} />
          <Route path="/customize" element={<CustomizePage />} />
          <Route path="/customize/:category" element={<CustomizeCategoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/contract" replace />} />
        </Routes>
      </HashRouter>
    </StrictMode>
  );
}

void boot();
