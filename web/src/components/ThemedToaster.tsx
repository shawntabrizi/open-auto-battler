import { Toaster } from 'react-hot-toast';
import { useThemeStore } from '../store/themeStore';

/**
 * Themed toast notifications.
 * Reads base colors and fonts from the active theme so toasts match the UI.
 */
export function ThemedToaster() {
  const theme = useThemeStore((s) => s.activeTheme);

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: theme.base.base900,
          color: theme.base.base100,
          border: `1px solid ${theme.base.base700}`,
          borderRadius: theme.base.panelRadius,
          fontFamily: theme.base.body,
          fontSize: '0.875rem',
          boxShadow: theme.base.shadowLifted,
        },
        success: {
          iconTheme: {
            primary: theme.base.victory,
            secondary: theme.base.base900,
          },
          style: {
            borderColor: theme.toast.successBorder,
          },
        },
        error: {
          iconTheme: {
            primary: theme.base.defeat,
            secondary: theme.base.base900,
          },
          style: {
            borderColor: theme.toast.errorBorder,
          },
        },
      }}
    />
  );
}
