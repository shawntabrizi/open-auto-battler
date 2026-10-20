/**
 * Contract store — manages the PolkaVM contract backend connection and game state.
 */

import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import {
  createContractBackend,
  isHostTimeout,
  RankedIneligibleError,
  type Account,
  type BadgeEvent,
  type BadgeRecord,
  type ContractBackend,
  type RankedEligibility,
} from '../contract';
import type { Hex } from '../contract/codec';
import { eligibilityMessage } from '../contract/personhood';
import { newBadges } from '../contract/arenaFlows';
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

  // Ranked play
  /** Personhood alias of the active ranked game; null for casual or none. */
  rankedAlias: Hex | null;
  /** Last ranked-eligibility check of the selected account. */
  eligibility: RankedEligibility | null;
  /** Why the last ranked start was refused, for the arena page. */
  rankedBlock: string | null;
  isBinding: boolean;
  bindError: string | null;

  // Badges
  badges: BadgeRecord[] | null;
  badgesError: string | null;
  isClaiming: boolean;
  /** Badge events of the last finished ranked run, shown once on the arena page. */
  lastRunBadges: BadgeEvent[] | null;

  // Actions
  connect: (useDevAccounts?: boolean) => Promise<boolean>;
  disconnect: () => void;
  selectAccount: (account: Account) => void;
  startGame: (setId: number) => Promise<void>;
  startRankedGame: (setId: number) => Promise<void>;
  checkEligibility: () => Promise<RankedEligibility | null>;
  bindPersonhood: () => Promise<void>;
  loadBadges: () => Promise<void>;
  claimBadges: () => Promise<void>;
  clearLastRunBadges: () => void;
  submitTurnOnChain: () => Promise<void>;
  endGame: () => Promise<void>;
  abandonGame: () => Promise<void>;
  refreshGameState: () => Promise<void>;
}

/** Ranked/badge state that belongs to one account; cleared on a switch. */
const perAccountReset = {
  rankedAlias: null,
  eligibility: null,
  rankedBlock: null,
  bindError: null,
  badges: null,
  badgesError: null,
  lastRunBadges: null,
};

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
  rankedAlias: null,
  eligibility: null,
  rankedBlock: null,
  isBinding: false,
  bindError: null,
  badges: null,
  badgesError: null,
  isClaiming: false,
  lastRunBadges: null,

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
      ...perAccountReset,
    });
  },

  selectAccount: (account) => {
    const { backend } = get();
    if (backend) backend.selectAccount(account);
    set({ selectedAccount: account, ...perAccountReset });
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

  startRankedGame: async (setId: number) => {
    const { backend } = get();
    if (!backend) return;
    set({ rankedBlock: null });
    try {
      // No overlay until the eligibility check passes: an ineligible player
      // gets the reason, not a signing screen.
      const eligibility = await backend.rankedEligibility();
      set({ eligibility });
      if (eligibility.kind !== 'bound') {
        set({ rankedBlock: eligibilityMessage(eligibility) });
        return;
      }
      await withTxOverlay('Starting Ranked Game...', expectsHostPrompt(get()), () =>
        backend.startRankedGame(setId)
      );
      await get().refreshGameState();
    } catch (err) {
      if (err instanceof RankedIneligibleError) {
        set({ rankedBlock: err.message, eligibility: err.eligibility ?? get().eligibility });
        return;
      }
      console.error('Contract start ranked game failed:', err);
      toast.error(txErrorMessage(err, 'Failed to start ranked game'));
    }
  },

  checkEligibility: async () => {
    const { backend } = get();
    if (!backend) return null;
    const eligibility = await backend.rankedEligibility();
    set({ eligibility });
    return eligibility;
  },

  bindPersonhood: async () => {
    const { backend } = get();
    if (!backend || get().isBinding) return;
    set({ isBinding: true, bindError: null });
    try {
      await withTxOverlay('Binding Personhood...', get().selectedAccount?.source === 'host', () =>
        backend.bindPersonhood()
      );
      const eligibility = await backend.rankedEligibility();
      set({ eligibility, rankedBlock: null });
      if (eligibility.kind === 'bound') toast.success('Personhood bound. Ranked play is open.');
    } catch (err) {
      console.error('Personhood binding failed:', err);
      set({ bindError: txErrorMessage(err, 'Binding failed') });
    } finally {
      set({ isBinding: false });
    }
  },

  loadBadges: async () => {
    const { backend } = get();
    if (!backend) return;
    try {
      set({ badges: await backend.getBadges(), badgesError: null });
    } catch (err) {
      console.error('Loading badges failed:', err);
      set({ badgesError: err instanceof Error ? err.message : 'Failed to load badges' });
    }
  },

  claimBadges: async () => {
    const { backend } = get();
    if (!backend || get().isClaiming) return;
    set({ isClaiming: true });
    try {
      const minted = await withTxOverlay('Claiming Badges...', expectsHostPrompt(get()), () =>
        backend.claimPendingBadges()
      );
      if (minted.length > 0) {
        toast.success(`Claimed ${minted.length} badge${minted.length === 1 ? '' : 's'}`);
      } else {
        toast('No badge could be minted yet. The arena may need funds; try again later.');
      }
      await get().loadBadges();
    } catch (err) {
      console.error('Claiming badges failed:', err);
      toast.error(txErrorMessage(err, 'Failed to claim badges'));
    } finally {
      set({ isClaiming: false });
    }
  },

  clearLastRunBadges: () => set({ lastRunBadges: null }),

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

    const ranked = get().rankedAlias !== null;
    try {
      // Snapshot first: if the events cannot be read, the new badges are the
      // records that were not there before.
      const before = ranked ? await backend.getBadges().catch(() => null) : null;
      const events = await withTxOverlay('Ending Run...', expectsHostPrompt(get()), () =>
        backend.endGame()
      );
      let earned = events;
      if (ranked && earned.length === 0 && before) {
        const after = await backend.getBadges().catch(() => before);
        earned = newBadges(before, after);
      }
      set({
        hasActiveGame: false,
        rankedAlias: null,
        lastRunBadges: earned.length > 0 ? earned : null,
        badges: null,
      });
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
      // Ranked or casual: needed for the HUD label and the game-over badges.
      const rankedAlias = gameState ? await backend.getRankedAlias().catch(() => null) : null;
      set({ rankedAlias });

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
