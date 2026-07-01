import { create } from 'zustand';
import { storageService } from '../services/storage';
import { isInHost } from '../services/hostEnvironment';

// Chain access is host-routed via @parity/product-sdk-chain-client, so there is
// no user-configurable RPC endpoint any more (the old local/hosted WS presets
// were removed in the product-sdk migration).
const SET_STORAGE_KEY = 'oab-selected-set';

interface SettingsStore {
  /** The user's selected set ID for gameplay. Persisted via storageService. */
  selectedSetId: number | null;
  selectSet: (id: number) => void;
}

// In host mode, init with defaults — initHostStorage() hydrates before first render.
// In standalone mode, read sync from localStorage as before.
function syncRead(key: string): string | null {
  if (isInHost()) return null;
  return localStorage.getItem(key);
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  selectedSetId: (() => {
    const stored = syncRead(SET_STORAGE_KEY);
    return stored !== null ? Number(stored) : 0;
  })(),
  selectSet: (id: number) => {
    void storageService.writeString(SET_STORAGE_KEY, String(id));
    set({ selectedSetId: id });
  },
}));
