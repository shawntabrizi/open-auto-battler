import { useEffect } from 'react';
import { useThemeStore } from '../store/themeStore';
import { applyResolvedThemeToDocument } from './themes';

export function ThemeController() {
  const activeTheme = useThemeStore((state) => state.activeTheme);

  useEffect(() => {
    applyResolvedThemeToDocument(activeTheme);
  }, [activeTheme]);

  return null;
}
