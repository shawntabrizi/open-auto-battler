/**
 * Contract store — manages the PolkaVM contract backend connection and game state.
 */

import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import {
  chainErrorMessage,
  createContractBackend,
  isHostTimeout,
  type Account,
  type ContractBackend,
} from '../contract';
import { useGameStore } from './gameStore';
import { useTxStore } from './txStore';

/** Toast text for a failed contract action: typed reverts and host timeouts get clear text. */
function txErrorMessage(err: unknown, fallback: string): string {
  if (isHostTimeout(err)) return 'The host did not answer in time. Please try again.';
  return chainErrorMessage(err) ?? (err instanceof Error ? err.message : fallback);
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

      // The WASM engine (card art and names are baked in; game cards come
      // from the chain's set bundle at refresh).
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
      const result = await withTxOverlay('Starting Game...', expectsHostPrompt(get()), () =>
        backend.startGame(setId)
      );
      console.log('Contract: game started, run', result.runId);
    } catch (err) {
      console.error('Contract start game failed:', err);
      toast.error(txErrorMessage(err, 'Failed to start contract game'));
    }
    // Also after a failure: a `GameActive` revert means a game is on chain,
    // and the refresh takes the player to it.
    await get().refreshGameState();
  },

  submitTurnOnChain: async () => {
    const { backend, isSubmitting } = get();
    const { engine } = useGameStore.getState();
    if (!backend || !engine || isSubmitting) return;

    set({ isSubmitting: true });
    try {
      const actionScale = engine.get_commit_action_scale();

      // The contract picks the opponent and emits BattleReported.
      const turn = await withTxOverlay('Committing Turn...', expectsHostPrompt(get()), () =>
        backend.submitTurn(actionScale)
      );

      // Replay the chain's battle (its boards and seed) with the engine for
      // the report's engine version. It throws if the replay does not end in
      // the reported result.
      const battleOutput: unknown = engine.replay_report(
        turn.reportBytes,
        turn.bundleBytes,
        turn.boardSize
      );

      useGameStore.setState({
        battleOutput: battleOutput as ReturnType<typeof engine.get_battle_output>,
        selection: null,
        showBattleOverlay: true,
        afterBattleCallback: async () => {
          await get().refreshGameState();
        },
      });
    } catch (err) {
      console.error('Contract submit turn failed:', err);
      toast.error(txErrorMessage(err, 'Failed to submit contract turn'));
      // The failure may have happened after broadcast (e.g. the tx landed but
      // the battle report couldn't be read or replayed), in which case the
      // chain has already advanced past our local shop state. Resync so the
      // player isn't stuck replaying a stale turn.
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
      throw Object.assign(new Error(txErrorMessage(err, 'Failed to end the run')), { cause: err });
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
      throw Object.assign(new Error(txErrorMessage(err, 'Failed to abandon the run')), {
        cause: err,
      });
    }
  },

  refreshGameState: async () => {
    const { backend, isRefreshing } = get();
    // Reentrancy guard: StrictMode double-fires the page effects, and a
    // concurrent init on the shared WASM engine is not safe.
    if (!backend || isRefreshing) return;

    set({ isRefreshing: true, refreshError: null });

    try {
      const game = await backend.getGameState();
      set({ hasActiveGame: !!game });

      if (!game) {
        useGameStore.getState().resetActiveSessionView();
        return;
      }

      const { engine } = useGameStore.getState();
      if (engine) {
        // The game's cards come from the chain's set bundle; the engine
        // checks it against the game's set hash and engine version.
        engine.init_from_mode_game(game.gameBytes, game.bundleBytes);
        const view = engine.get_view();
        const cardSet = engine.get_card_set();
        useGameStore.setState({
          view,
          cardSet,
          currentSetId: game.info.setId,
          gameStarted: true,
          startingLives: engine.get_starting_lives(),
          winsToVictory: engine.get_wins_to_victory(),
        });
      }
    } catch (err) {
      console.error('Contract refresh game state failed:', err);
      set({
        refreshError: txErrorMessage(err, 'Failed to load game state from chain'),
      });
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
