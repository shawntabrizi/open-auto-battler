import { create } from 'zustand';
import { DEFAULT_WARM_THEME, type ResolvedThemeDefinition } from '../theme/themes';
import type { NftItem } from './customizationStore';
import { storageService } from '../services/storage';
import { isInHost } from '../services/hostEnvironment';
import { ignoreError } from '../utils/safe';

const THEME_STORAGE_KEY = 'oab-selected-theme';

interface ThemeStore {
  activeTheme: ResolvedThemeDefinition;
  activeThemeNft: NftItem | null;
  setNftTheme: (theme: ResolvedThemeDefinition, nft: NftItem) => void;
  resetToWarm: () => void;
}

function loadCachedTheme(): { theme: ResolvedThemeDefinition; nft: NftItem | null } {
  // In host mode, return defaults — initHostStorage() hydrates before first render.
  if (typeof window === 'undefined' || isInHost()) return { theme: DEFAULT_WARM_THEME, nft: null };
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.theme && parsed.nft) {
        return { theme: parsed.theme, nft: parsed.nft };
      }
    }
  } catch (error) {
    ignoreError(error);
  }
  return { theme: DEFAULT_WARM_THEME, nft: null };
}

const cached = loadCachedTheme();

export const useThemeStore = create<ThemeStore>((set) => ({
  activeTheme: cached.theme,
  activeThemeNft: cached.nft,
  setNftTheme: (theme, nft) => {
    void storageService.writeJSON(THEME_STORAGE_KEY, { theme, nft });
    set({ activeTheme: theme, activeThemeNft: nft });
  },
  resetToWarm: () => {
    void storageService.remove(THEME_STORAGE_KEY);
    set({ activeTheme: DEFAULT_WARM_THEME, activeThemeNft: null });
  },
}));
