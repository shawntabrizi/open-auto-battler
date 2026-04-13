/**
 * Unified storage service backed by @polkadot-apps/storage.
 * Automatically routes to host storage (Triangle mode) or browser localStorage.
 */

import { createKvStore, type KvStore } from '@polkadot-apps/storage';

// Singleton KvStore instance, lazily initialized
let _store: KvStore | null = null;
let _storePromise: Promise<KvStore> | null = null;

async function getStore(): Promise<KvStore> {
  if (_store) return _store;
  if (!_storePromise) {
    _storePromise = createKvStore().then((s) => {
      _store = s;
      return s;
    });
  }
  return _storePromise;
}

export const storageService = {
  async readString(key: string): Promise<string | null> {
    const store = await getStore();
    return store.get(key);
  },

  async writeString(key: string, value: string): Promise<void> {
    const store = await getStore();
    await store.set(key, value);
  },

  async readJSON<T = any>(key: string): Promise<T | null> {
    const store = await getStore();
    return store.getJSON<T>(key);
  },

  async writeJSON(key: string, value: any): Promise<void> {
    const store = await getStore();
    await store.setJSON(key, value);
  },

  async remove(key: string): Promise<void> {
    const store = await getStore();
    await store.remove(key);
  },
};

/**
 * Hydrate all Zustand stores from host storage before first render.
 * Called during boot when running in a host container.
 */
export async function initHostStorage(): Promise<void> {
  const { useSettingsStore } = await import('../store/settingsStore');
  const { useGameStore } = await import('../store/gameStore');
  const { useThemeStore } = await import('../store/themeStore');

  const [
    endpoint,
    selectedSet,
    showRawJson,
    showCardNames,
    showGameCardDetailsPanel,
    showBoardHelper,
    showAddress,
    showBalance,
    defaultBattleSpeed,
    reducedAnimations,
    themeData,
    loggedIn,
  ] = await Promise.all([
    storageService.readString('oab-ws-endpoint'),
    storageService.readString('oab-selected-set'),
    storageService.readJSON<boolean>('showRawJson'),
    storageService.readJSON<boolean>('showCardNames'),
    storageService.readJSON<string>('showGameCardDetailsPanel'),
    storageService.readJSON<boolean>('showBoardHelper'),
    storageService.readJSON<boolean>('showAddress'),
    storageService.readJSON<boolean>('showBalance'),
    storageService.readJSON<number>('defaultBattleSpeed'),
    storageService.readJSON<boolean>('reducedAnimations'),
    storageService.readJSON<any>('oab-selected-theme'),
    storageService.readString('oab-logged-in'),
  ]);

  if (endpoint) useSettingsStore.setState({ endpoint });
  if (selectedSet !== null) useSettingsStore.setState({ selectedSetId: Number(selectedSet) });

  const gameUpdates: Record<string, any> = {};
  if (showRawJson !== null) gameUpdates.showRawJson = showRawJson;
  if (showCardNames !== null) gameUpdates.showCardNames = showCardNames;
  if (showGameCardDetailsPanel !== null) gameUpdates.showGameCardDetailsPanel = showGameCardDetailsPanel;
  if (showBoardHelper !== null) gameUpdates.showBoardHelper = showBoardHelper;
  if (showAddress !== null) gameUpdates.showAddress = showAddress;
  if (showBalance !== null) gameUpdates.showBalance = showBalance;
  if (defaultBattleSpeed !== null) gameUpdates.defaultBattleSpeed = defaultBattleSpeed;
  if (reducedAnimations !== null) gameUpdates.reducedAnimations = reducedAnimations;
  if (Object.keys(gameUpdates).length > 0) useGameStore.setState(gameUpdates);

  if (themeData?.theme) {
    useThemeStore.setState({
      activeTheme: themeData.theme,
      activeThemeNft: themeData.nft ?? null,
    });
  }

  // Mark session restoration hint so arenaStore.connect() knows to look for saved login
  if (loggedIn) {
    const { useArenaStore } = await import('../store/arenaStore');
    useArenaStore.setState({ isRestoringSession: true });
  }
}
