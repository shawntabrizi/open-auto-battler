import { create } from 'zustand';

const STORAGE_KEY = 'oab-ws-endpoint';
const SET_STORAGE_KEY = 'oab-selected-set';
const ENDPOINTS = {
  local: 'ws://127.0.0.1:9944',
  hosted: 'wss://oab-rpc.shawntabrizi.com',
} as const;

interface SettingsStore {
  endpoint: string;
  setEndpoint: (url: string) => void;
  /** The user's selected set ID for gameplay. Persisted in localStorage. */
  selectedSetId: number | null;
  selectSet: (id: number) => void;
}

export const PRESET_ENDPOINTS = ENDPOINTS;

export const useSettingsStore = create<SettingsStore>((set) => ({
  endpoint: localStorage.getItem(STORAGE_KEY) || ENDPOINTS.hosted,
  setEndpoint: (url: string) => {
    localStorage.setItem(STORAGE_KEY, url);
    set({ endpoint: url });
  },
  selectedSetId: (() => {
    const stored = localStorage.getItem(SET_STORAGE_KEY);
    return stored !== null ? Number(stored) : 0;
  })(),
  selectSet: (id: number) => {
    localStorage.setItem(SET_STORAGE_KEY, String(id));
    set({ selectedSetId: id });
  },
}));
