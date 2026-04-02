/**
 * Contract store — manages the PolkaVM contract backend connection and game state.
 *
 * Separate from arenaStore to keep pallet and contract code isolated.
 * Uses the same GameBackend interface and WASM engine as the pallet path.
 */

import { create } from 'zustand';
import type { GameBackend } from '../backends/types';
import { createContractBackend } from '../backends/contract';
import { useGameStore } from './gameStore';

interface ContractStore {
  // Connection
  backend: GameBackend | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  contractAddress: string;
  rpcUrl: string;

  // Account
  selectedAccount: any;
  accounts: any[];

  // Game state
  hasActiveGame: boolean;
  isRefreshing: boolean;

  // Actions
  connect: (useDevAccounts?: boolean) => Promise<boolean>;
  disconnect: () => void;
  selectAccount: (account: any) => void;
  setConfig: (rpcUrl: string, contractAddress: string) => void;
  startGame: (setId: number) => Promise<void>;
  submitTurnOnChain: () => Promise<void>;
  abandonGame: () => Promise<void>;
  refreshGameState: () => Promise<void>;
}

const DEFAULT_RPC = 'http://localhost:8545';
const DEFAULT_CONTRACT = '0xd023de31a4480edb9a16d763793e2af095385347';

export const useContractStore = create<ContractStore>((set, get) => ({
  backend: null,
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  contractAddress: DEFAULT_CONTRACT,
  rpcUrl: DEFAULT_RPC,
  selectedAccount: null,
  accounts: [],
  hasActiveGame: false,
  isRefreshing: false,

  setConfig: (rpcUrl: string, contractAddress: string) => {
    set({ rpcUrl, contractAddress });
  },

  connect: async (useDevAccounts?: boolean) => {
    const { rpcUrl, contractAddress } = get();
    get().disconnect();
    set({ isConnecting: true, connectionError: null });

    try {
      const backend = createContractBackend({
        rpcUrl,
        contractAddress: contractAddress as `0x${string}`,
        skipWallet: useDevAccounts,
      });

      await backend.connect();

      const accounts = await backend.getAccounts();

      set({
        backend,
        isConnected: true,
        isConnecting: false,
        accounts,
        selectedAccount: accounts[0] ?? null,
      });

      // Initialize the WASM engine with baked-in card data
      // (the contract stores cards on-chain, but the engine has them baked in)
      const { engine, init: initEngine } = useGameStore.getState();
      if (!engine) {
        await initEngine();
      }

      return true;
    } catch (err) {
      console.error('Contract connection failed:', err);
      set({
        backend: null,
        isConnected: false,
        isConnecting: false,
        connectionError: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  disconnect: () => {
    const { backend } = get();
    backend?.disconnect();
    set({
      backend: null,
      isConnected: false,
      isConnecting: false,
      connectionError: null,
      selectedAccount: null,
      accounts: [],
      hasActiveGame: false,
    });
  },

  selectAccount: (account) => {
    const { backend } = get();
    if (backend) backend.selectAccount(account);
    set({ selectedAccount: account });
  },

  startGame: async (setId: number) => {
    const { backend } = get();
    if (!backend) {
      console.error('Contract startGame: no backend connected');
      return;
    }

    try {
      console.log(`Contract: starting game with set ${setId}...`);
      const result = await backend.startGame(setId);
      console.log('Contract: game started, seed:', result.seed);
      await get().refreshGameState();
      console.log('Contract: game state refreshed, hasActiveGame:', get().hasActiveGame);
    } catch (err) {
      console.error('Contract start game failed:', err);
    }
  },

  submitTurnOnChain: async () => {
    const { backend } = get();
    const { engine } = useGameStore.getState();
    if (!backend || !engine) return;

    try {
      const actionScale = engine.get_commit_action_scale();

      // Contract selects opponent internally — no enemy board needed
      const turnResult = await backend.submitTurn(actionScale, new Uint8Array());

      // Refresh state from chain first (so we have the updated round/wins/lives)
      await get().refreshGameState();

      // Show a minimal battle result overlay so the UI advances
      const resultLabel = turnResult.result || 'Draw';
      useGameStore.setState({
        battleOutput: {
          events: [
            { type: 'BattleEnd', payload: { result: resultLabel } },
          ],
          initial_player_units: [],
          initial_enemy_units: [],
          round: turnResult.round || 1,
        },
        selection: null,
        showBattleOverlay: true,
        afterBattleCallback: async () => {
          await get().refreshGameState();
        },
      });
    } catch (err) {
      console.error('Contract submit turn failed:', err);
    }
  },

  abandonGame: async () => {
    const { backend } = get();
    if (!backend) return;

    try {
      await backend.abandonGame();
      set({ hasActiveGame: false });
      useGameStore.getState().resetActiveSessionView();
    } catch (err) {
      console.error('Contract abandon game failed:', err);
      throw err;
    }
  },

  refreshGameState: async () => {
    const { backend } = get();
    if (!backend) return;

    set({ isRefreshing: true });

    try {
      const gameState = await backend.getGameState();
      set({ hasActiveGame: !!gameState });

      if (gameState && gameState.stateBytes.length > 0) {
        const { engine } = useGameStore.getState();
        if (engine) {
          engine.init_from_scale(gameState.stateBytes, gameState.cardSetBytes);
          const view = engine.get_view();
          const cardSet = engine.get_card_set();
          useGameStore.setState({
            view,
            cardSet,
            gameStarted: true,
          });
        }
      }
    } catch (err) {
      console.error('Contract refresh game state failed:', err);
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
