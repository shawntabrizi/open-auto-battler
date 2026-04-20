/**
 * Triangle host environment detection.
 * Runs once at module load — before any store initializes.
 */

export type HostMode = 'desktop-webview' | 'web-iframe' | 'standalone';

type HostMarkedWindow = Window & {
  __HOST_WEBVIEW_MARK__?: boolean;
};

function detect(): HostMode {
  if (typeof window === 'undefined') return 'standalone';
  if ((window as HostMarkedWindow).__HOST_WEBVIEW_MARK__) return 'desktop-webview';
  try {
    if (window !== window.top) return 'web-iframe';
  } catch {
    return 'web-iframe'; // SecurityError → cross-origin iframe → host
  }
  return 'standalone';
}

export const HOST_MODE: HostMode = detect();
export const isInHost = (): boolean => HOST_MODE !== 'standalone';
