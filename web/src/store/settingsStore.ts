import { create } from 'zustand';
import { storageService } from '../services/storage';
import { isInHost } from '../services/hostEnvironment';

const STORAGE_KEY = 'oab-ws-endpoint';
const SET_STORAGE_KEY = 'oab-selected-set';
const ENDPOINTS = {
  local: 'ws://127.0.0.1:9944',
  hosted: 'wss://oab-rpc.shawntabrizi.com',
} as const;

interface SettingsStore {
  endpoint: string;
  setEndpoint: (url: string) => void;
  /** The user's selected set ID for gameplay. Persisted via storageService. */
  selectedSetId: number | null;
  selectSet: (id: number) => void;
}

export const PRESET_ENDPOINTS = ENDPOINTS;

// In host mode, init with defaults — initHostStorage() hydrates before first render.
// In standalone mode, read sync from localStorage as before.
function syncRead(key: string): string | null {
  if (isInHost()) return null;
  return localStorage.getItem(key);
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  endpoint: syncRead(STORAGE_KEY) || ENDPOINTS.hosted,
  setEndpoint: (url: string) => {
    storageService.writeString(STORAGE_KEY, url);
    set({ endpoint: url });
  },
  selectedSetId: (() => {
    const stored = syncRead(SET_STORAGE_KEY);
    return stored !== null ? Number(stored) : 0;
  })(),
  selectSet: (id: number) => {
    storageService.writeString(SET_STORAGE_KEY, String(id));
    set({ selectedSetId: id });
  },
}));
