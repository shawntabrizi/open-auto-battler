declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}

export function getPlatform(): 'browser' | 'desktop' {
  return isTauri() ? 'desktop' : 'browser';
}
