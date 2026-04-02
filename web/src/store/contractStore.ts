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
  connect: () => Promise<boolean>;
  disconnect: () => void;
  selectAccount: (account: any) => void;
  setConfig: (rpcUrl: string, contractAddress: string) => void;
  startGame: (setId: number) => Promise<void>;
  submitTurnOnChain: () => Promise<void>;
  abandonGame: () => Promise<void>;
  refreshGameState: () => Promise<void>;
}

const DEFAULT_RPC = 'http://localhost:8545';
const DEFAULT_CONTRACT = '0x' + '0'.repeat(40); // Placeholder — set via UI or config

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

  connect: async () => {
    const { rpcUrl, contractAddress } = get();
    get().disconnect();
    set({ isConnecting: true, connectionError: null });

    try {
      const backend = createContractBackend({
        rpcUrl,
        contractAddress: contractAddress as `0x${string}`,
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
    if (!backend) return;

    try {
      await backend.startGame(setId);
      await get().refreshGameState();
    } catch (err) {
      console.error('Contract start game failed:', err);
    }
  },

  submitTurnOnChain: async () => {
    const { backend } = get();
    const { engine } = useGameStore.getState();
    if (!backend || !engine) return;

    try {
      const playerBoard = engine.get_board();
      const actionScale = engine.get_commit_action_scale();

      // Contract selects opponent internally — no enemy board needed
      const turnResult = await backend.submitTurn(actionScale, new Uint8Array());

      // If we got a battle seed and opponent board, replay locally
      if (turnResult.battleSeed && turnResult.opponentBoard.length > 0) {
        const battleOutput = engine.resolve_battle_p2p(
          playerBoard,
          turnResult.opponentBoard,
          turnResult.battleSeed,
        );

        useGameStore.setState({
          battleOutput,
          selection: null,
          showBattleOverlay: true,
          afterBattleCallback: async () => {
            await get().refreshGameState();
          },
        });
      } else {
        // No local replay available — just refresh state
        await get().refreshGameState();
      }
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
