import { create } from 'zustand';

const STORAGE_KEY = 'oab-ws-endpoint';
const ENDPOINTS = {
  local: 'ws://127.0.0.1:9944',
  hosted: 'wss://51.159.158.173',
} as const;

interface SettingsStore {
  endpoint: string;
  setEndpoint: (url: string) => void;
}

export const PRESET_ENDPOINTS = ENDPOINTS;

export const useSettingsStore = create<SettingsStore>((set) => ({
  endpoint: localStorage.getItem(STORAGE_KEY) || ENDPOINTS.local,
  setEndpoint: (url: string) => {
    localStorage.setItem(STORAGE_KEY, url);
    set({ endpoint: url });
  },
}));
