import { Toaster } from 'react-hot-toast';
import { useThemeStore } from '../store/themeStore';
import { getTheme } from '../theme/themes';

/**
 * Themed toast notifications.
 * Reads palette and font from the active theme so toasts match the UI.
 */
export function ThemedToaster() {
  const theme = getTheme(useThemeStore((s) => s.selectedThemeId));

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: theme.palette.base900,
          color: theme.palette.base100,
          border: `1px solid ${theme.palette.base700}`,
          borderRadius: theme.shape.panelRadius,
          fontFamily: theme.fonts.body,
          fontSize: '0.875rem',
          boxShadow: theme.effects.shadowLifted,
        },
        success: {
          iconTheme: {
            primary: theme.palette.victory,
            secondary: theme.palette.base900,
          },
          style: {
            borderColor: theme.palette.victory + '40',
          },
        },
        error: {
          iconTheme: {
            primary: theme.palette.defeat,
            secondary: theme.palette.base900,
          },
          style: {
            borderColor: theme.palette.defeat + '40',
          },
        },
      }}
    />
  );
}
