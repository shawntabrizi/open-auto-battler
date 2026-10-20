/**
 * Contract store — manages the PolkaVM contract backend connection and game state.
 */

import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import {
  createContractBackend,
  isHostTimeout,
  type Account,
  type ContractBackend,
} from '../contract';
import { useGameStore } from './gameStore';
import { useTxStore } from './txStore';

/** Toast text for a failed contract action; a host timeout gets a clear hint. */
function txErrorMessage(err: unknown, fallback: string): string {
  if (isHostTimeout(err)) return 'The host did not answer in time. Please try again.';
  return err instanceof Error ? err.message : fallback;
}

/** Show the TransactionOverlay while `fn` (a signing + submitting flow) runs. */
async function withTxOverlay<T>(label: string, isHostSigner: boolean, fn: () => Promise<T>) {
  useTxStore.setState({ status: 'signing', label, isExtensionSigner: isHostSigner });
  try {
    return await fn();
  } finally {
    useTxStore.setState({ status: 'idle', label: null });
  }
}

/**
 * True when the next transaction will show a host signing prompt: a host
 * account, unless sponsored play is live (the session key signs silently).
 */
function expectsHostPrompt(state: {
  backend: ContractBackend | null;
  selectedAccount: Account | null;
}): boolean {
  return state.selectedAccount?.source === 'host' && state.backend?.sponsorStatus !== 'active';
}

interface ContractStore {
  // Connection
  backend: ContractBackend | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Account
  selectedAccount: Account | null;
  accounts: Account[];

  // Game state
  hasActiveGame: boolean;
  isRefreshing: boolean;
  isSubmitting: boolean;
  /** Set when the last refreshGameState failed to load/decode chain state. */
  refreshError: string | null;

  // Actions
  connect: (useDevAccounts?: boolean) => Promise<boolean>;
  disconnect: () => void;
  selectAccount: (account: Account) => void;
  startGame: (setId: number) => Promise<void>;
  submitTurnOnChain: () => Promise<void>;
  endGame: () => Promise<void>;
  abandonGame: () => Promise<void>;
  refreshGameState: () => Promise<void>;
}

export const useContractStore = create<ContractStore>((set, get) => ({
  backend: null,
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  selectedAccount: null,
  accounts: [],
  hasActiveGame: false,
  isRefreshing: false,
  isSubmitting: false,
  refreshError: null,

  connect: async (useDevAccounts?: boolean) => {
    get().disconnect();
    set({ isConnecting: true, connectionError: null });

    let backend: ContractBackend | null = null;
    try {
      backend = createContractBackend({
        useDevAccounts,
        // Advance the overlay as the tx moves on. Actions resolve at best
        // block, so 'finalized' never reaches an open overlay.
        onTxStatus: (status) => {
          if (status === 'signing' || status === 'broadcasting' || status === 'in-block') {
            useTxStore.setState({ status });
          }
        },
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
      const { engine, initEngine } = useGameStore.getState();
      if (!engine) {
        await initEngine();
      }

      return true;
    } catch (err) {
      console.error('Contract connection failed:', err);
      // Release the half-connected signer, or it keeps reconnecting.
      backend?.disconnect();
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
      const result = await withTxOverlay('Starting Game...', expectsHostPrompt(get()), () =>
        backend.startGame(setId)
      );
      console.log('Contract: game started, seed:', result.seed);
      await get().refreshGameState();
      console.log('Contract: game state refreshed, hasActiveGame:', get().hasActiveGame);
    } catch (err) {
      console.error('Contract start game failed:', err);
      toast.error(txErrorMessage(err, 'Failed to start contract game'));
    }
  },

  submitTurnOnChain: async () => {
    const { backend, isSubmitting } = get();
    const { engine } = useGameStore.getState();
    if (!backend || !engine || isSubmitting) return;

    set({ isSubmitting: true });
    try {
      // Capture player board BEFORE submitting
      const playerBoard = engine.get_board();
      const actionScale = engine.get_commit_action_scale();

      // Submit turn — contract selects opponent and emits BattleReported event
      const turnResult = await withTxOverlay('Committing Turn...', expectsHostPrompt(get()), () =>
        backend.submitTurn(actionScale)
      );

      // Replay locally whenever the contract gave us a deterministic battle seed,
      // even if the opponent board is empty because no ghost existed yet.
      if (turnResult.battleSeed) {
        const battleOutput = engine.resolve_battle_p2p(
          playerBoard,
          turnResult.opponentBoard,
          turnResult.battleSeed
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
        // No replay data — fall back to a synthetic one-screen result.
        useGameStore.setState({
          battleOutput: {
            events: [{ type: 'BattleEnd', payload: { result: turnResult.result || 'Draw' } }],
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
      }
    } catch (err) {
      console.error('Contract submit turn failed:', err);
      toast.error(txErrorMessage(err, 'Failed to submit contract turn'));
      // The failure may have happened after broadcast (e.g. the tx landed but
      // the battle report couldn't be decoded), in which case the chain has
      // already advanced past our local shop state. Resync so the player
      // isn't stuck replaying a stale turn.
      await get().refreshGameState();
    } finally {
      set({ isSubmitting: false });
    }
  },

  endGame: async () => {
    const { backend } = get();
    if (!backend) return;

    try {
      await withTxOverlay('Ending Run...', expectsHostPrompt(get()), () => backend.endGame());
      set({ hasActiveGame: false });
      useGameStore.getState().resetActiveSessionView();
    } catch (err) {
      console.error('Contract end game failed:', err);
      throw err;
    }
  },

  abandonGame: async () => {
    const { backend } = get();
    if (!backend) return;

    try {
      await withTxOverlay('Abandoning Run...', expectsHostPrompt(get()), () =>
        backend.abandonGame()
      );
      set({ hasActiveGame: false });
      useGameStore.getState().resetActiveSessionView();
    } catch (err) {
      console.error('Contract abandon game failed:', err);
      throw err;
    }
  },

  refreshGameState: async () => {
    const { backend, isRefreshing } = get();
    // Reentrancy guard: StrictMode double-fires the page effects, and a
    // concurrent init_from_scale on the shared WASM engine is not safe.
    if (!backend || isRefreshing) return;

    set({ isRefreshing: true, refreshError: null });

    try {
      const gameState = await backend.getGameState();
      set({ hasActiveGame: !!gameState });

      if (!gameState || gameState.stateBytes.length === 0) {
        useGameStore.getState().resetActiveSessionView();
        return;
      }

      const { engine } = useGameStore.getState();
      if (engine) {
        const activeSetId = gameState.setId ?? 0;

        // Ensure the card pool is loaded before init_from_scale
        try {
          engine.load_card_set(activeSetId);
        } catch {
          // Card set may already be loaded; init_from_scale handles the state.
        }
        engine.init_from_scale(gameState.stateBytes, gameState.cardSetBytes);
        const view = engine.get_view();
        const cardSet = engine.get_card_set();
        useGameStore.setState({
          view,
          cardSet,
          currentSetId: view?.set_id ?? activeSetId,
          gameStarted: true,
          startingLives: engine.get_starting_lives(),
          winsToVictory: engine.get_wins_to_victory(),
        });
      }
    } catch (err) {
      console.error('Contract refresh game state failed:', err);
      set({
        refreshError: err instanceof Error ? err.message : 'Failed to load game state from chain',
      });
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
