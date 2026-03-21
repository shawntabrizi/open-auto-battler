import { create } from 'zustand';
import { DEFAULT_THEME_ID, THEMES, type ThemeId } from '../theme/themes';

const THEME_STORAGE_KEY = 'oab-selected-theme';

interface ThemeStore {
  selectedThemeId: ThemeId;
  setTheme: (themeId: ThemeId) => void;
}

function loadStoredTheme(): ThemeId {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_ID;
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    if (stored && stored in THEMES) {
      return stored;
    }
  } catch {}

  return DEFAULT_THEME_ID;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  selectedThemeId: loadStoredTheme(),
  setTheme: (themeId) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {}
    set({ selectedThemeId: themeId });
  },
}));
