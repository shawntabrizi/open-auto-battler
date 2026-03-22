import { create } from 'zustand';
import { DEFAULT_WARM_THEME, type ResolvedThemeDefinition } from '../theme/themes';
import type { NftItem } from './customizationStore';

const THEME_STORAGE_KEY = 'oab-selected-theme';

interface ThemeStore {
  activeTheme: ResolvedThemeDefinition;
  activeThemeNft: NftItem | null;
  setNftTheme: (theme: ResolvedThemeDefinition, nft: NftItem) => void;
  resetToWarm: () => void;
}

function loadCachedTheme(): { theme: ResolvedThemeDefinition; nft: NftItem | null } {
  if (typeof window === 'undefined') return { theme: DEFAULT_WARM_THEME, nft: null };
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.theme && parsed.nft) {
        return { theme: parsed.theme, nft: parsed.nft };
      }
    }
  } catch {}
  return { theme: DEFAULT_WARM_THEME, nft: null };
}

const cached = loadCachedTheme();

export const useThemeStore = create<ThemeStore>((set) => ({
  activeTheme: cached.theme,
  activeThemeNft: cached.nft,
  setNftTheme: (theme, nft) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme, nft }));
    } catch {}
    set({ activeTheme: theme, activeThemeNft: nft });
  },
  resetToWarm: () => {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {}
    set({ activeTheme: DEFAULT_WARM_THEME, activeThemeNft: null });
  },
}));
