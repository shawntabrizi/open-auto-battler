/**
 * Unified storage service that wraps hostLocalStorage (host mode) or
 * browser localStorage (standalone mode) behind a common async API.
 */

import { getHostLocalStorage, type HostLocalStorage } from '@parity/product-sdk-host';
import { isInHost } from './hostEnvironment';
import { ignoreError } from '../utils/safe';
import type { ResolvedThemeDefinition } from '../theme/themes';
import type { NftItem } from '../store/customizationStore';

interface StoredThemeData {
  theme?: ResolvedThemeDefinition;
  nft?: NftItem | null;
}

let _hostLocalStorage: HostLocalStorage | null = null;
async function getHostStorage(): Promise<HostLocalStorage | null> {
  if (!_hostLocalStorage) {
    _hostLocalStorage = await getHostLocalStorage();
  }
  return _hostLocalStorage;
}

export const storageService = {
  async readString(key: string): Promise<string | null> {
    if (isInHost()) {
      try {
        const hs = await getHostStorage();
        if (!hs) return null;
        const val = await hs.readString(key);
        return val ?? null;
      } catch {
        return null;
      }
    }
    return localStorage.getItem(key);
  },

  async writeString(key: string, value: string): Promise<void> {
    if (isInHost()) {
      try {
        const hs = await getHostStorage();
        if (hs) await hs.writeString(key, value);
      } catch (error) {
        ignoreError(error);
      }
      return;
    }
    localStorage.setItem(key, value);
  },

  async readJSON<T = unknown>(key: string): Promise<T | null> {
    if (isInHost()) {
      try {
        const hs = await getHostStorage();
        if (!hs) return null;
        const val = await hs.readJSON(key);
        return (val ?? null) as T | null;
      } catch {
        return null;
      }
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async writeJSON(key: string, value: unknown): Promise<void> {
    if (isInHost()) {
      try {
        const hs = await getHostStorage();
        if (hs) await hs.writeJSON(key, value);
      } catch (error) {
        ignoreError(error);
      }
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      ignoreError(error);
    }
  },

  async remove(key: string): Promise<void> {
    if (isInHost()) {
      try {
        const hs = await getHostStorage();
        if (hs) await hs.clear(key);
      } catch (error) {
        ignoreError(error);
      }
      return;
    }
    localStorage.removeItem(key);
  },
};

/**
 * Hydrate all Zustand stores from host storage before first render.
 * Only called when isInHost() is true.
 */
export async function initHostStorage(): Promise<void> {
  const { useSettingsStore } = await import('../store/settingsStore');
  const { useGameStore } = await import('../store/gameStore');
  const { useThemeStore } = await import('../store/themeStore');

  const [
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
  ] = await Promise.all([
    storageService.readString('oab-selected-set'),
    storageService.readJSON<boolean>('showRawJson'),
    storageService.readJSON<boolean>('showCardNames'),
    storageService.readJSON<string>('showGameCardDetailsPanel'),
    storageService.readJSON<boolean>('showBoardHelper'),
    storageService.readJSON<boolean>('showAddress'),
    storageService.readJSON<boolean>('showBalance'),
    storageService.readJSON<number>('defaultBattleSpeed'),
    storageService.readJSON<boolean>('reducedAnimations'),
    storageService.readJSON<StoredThemeData>('oab-selected-theme'),
  ]);

  if (selectedSet !== null) useSettingsStore.setState({ selectedSetId: Number(selectedSet) });

  const gameUpdates: Record<string, unknown> = {};
  if (showRawJson !== null) gameUpdates.showRawJson = showRawJson;
  if (showCardNames !== null) gameUpdates.showCardNames = showCardNames;
  if (showGameCardDetailsPanel !== null)
    gameUpdates.showGameCardDetailsPanel = showGameCardDetailsPanel;
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
}
