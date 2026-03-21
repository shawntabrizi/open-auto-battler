import { useEffect } from 'react';
import { useThemeStore } from '../store/themeStore';
import { applyThemeToDocument } from './themes';

export function ThemeController() {
  const selectedThemeId = useThemeStore((state) => state.selectedThemeId);

  useEffect(() => {
    applyThemeToDocument(selectedThemeId);
  }, [selectedThemeId]);

  return null;
}
