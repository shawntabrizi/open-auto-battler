import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import type { GameView, BattleOutput, Selection, CardView } from '../types';
import { initEmojiMap } from '../utils/emoji';

export type CardDetailsPanelMode = 'always' | 'never' | 'auto';

interface SetMeta {
  id: number;
  name: string;
}

interface GameSessionSnapshot {
  state: {
    bag: number[];
    hand: number[];
    board: unknown[];
    mana_limit: number;
    shop_mana: number;
    round: number;
    lives: number;
    wins: number;
    phase: string;
    next_card_id: number;
    game_seed: bigint | number | string;
  };
  set_id: number;
}

interface PersistedLocalSession {
  version: 1;
  session: GameSessionSnapshot;
  savedAt: number;
}

interface GameEngine {
  // Core methods
  get_view: () => any;
  get_battle_output: () => any;
  burn_hand_card: (index: number) => void;
  play_hand_card: (handIndex: number, boardSlot: number) => void;
  swap_board_positions: (slotA: number, slotB: number) => void;
  burn_board_unit: (boardSlot: number) => void;
  undo: () => void;
  end_turn: () => void;
  continue_after_battle: () => void;
  new_run: (seed: bigint) => void;
  get_state: () => any;
  get_local_session: () => GameSessionSnapshot;
  get_board: () => any;
  resolve_battle_p2p: (player_board: any, enemy_board: any, seed: bigint) => any;
  get_commit_action: () => any;
  get_commit_action_scale: () => Uint8Array;
  get_bag: () => number[];
  get_card_set: () => CardView[];
  get_card_metas: () => Array<{ id: number; name: string; emoji: string }>;
  get_set_metas: () => SetMeta[];
  get_set_cards: (setId: number) => CardView[];
  new_run_p2p: (seed: bigint, lives: number) => void;
  get_starting_lives: () => number;
  get_wins_to_victory: () => number;
  load_card_set: (setId: number) => void;
  add_card: (card: any) => void;
  add_set: (setId: number, cards: any) => void;

  // Universal Bridge methods
  // Note: seed is bigint because wasm-bindgen binds Rust u64 to JS BigInt
  init_from_scale: (session: Uint8Array, cardSet: Uint8Array) => void;
  restore_local_session: (session: GameSessionSnapshot) => void;
}

interface WasmModule {
  default: () => Promise<void>;
  GameEngine: { new (seed?: bigint): GameEngine };
  greet: () => string;
}

interface GameStore {
  engine: GameEngine | null;
  view: GameView | null;
  battleOutput: BattleOutput | null;
  cardSet: CardView[] | null; // Full set of unique cards (fetched once)
  cardNameMap: Record<number, string>;
  currentSetId: number | null;
  bag: number[] | null; // Bag as a list of Card IDs
  isLoading: boolean;
  error: string | null;
  selection: Selection | null;
  showBattleOverlay: boolean;
  showRawJson: boolean;
  showCardNames: boolean;
  showGameCardDetailsPanel: CardDetailsPanelMode;
  showBoardHelper: boolean;
  showAddress: boolean;
  showBalance: boolean;
  defaultBattleSpeed: number;
  reducedAnimations: boolean;
  showBag: boolean;
  startingLives: number;
  winsToVictory: number;

  // Set selection state
  setMetas: SetMeta[];
  engineReady: boolean;
  gameStarted: boolean;
  previewCards: CardView[] | null;
  showSetPreview: boolean;
  setPreviewCards: Record<number, CardView[]>;

  // Two-phase init
  initEngine: () => Promise<void>;
  startGame: (setId: number) => void;
  loadSetPreviews: () => void;

  // One-shot init (loads engine + starts game immediately)
  init: (seed?: bigint) => Promise<void>;

  // Preview
  previewSet: (setId: number) => void;
  closePreview: () => void;

  burnHandCard: (index: number) => void;
  playHandCard: (handIndex: number, boardSlot: number) => void;
  swapBoardPositions: (slotA: number, slotB: number) => void;
  burnBoardUnit: (boardSlot: number) => void;
  undo: () => void;
  endTurn: () => void;
  continueAfterBattle: () => void;
  newRun: () => void;
  setSelection: (selection: Selection | null) => void;
  closeBattleOverlay: () => void;
  toggleShowRawJson: () => void;
  toggleShowCardNames: () => void;
  setCardDetailsPanelMode: (mode: CardDetailsPanelMode) => void;
  toggleShowBoardHelper: () => void;
  toggleShowAddress: () => void;
  toggleShowBalance: () => void;
  setDefaultBattleSpeed: (speed: number) => void;
  toggleReducedAnimations: () => void;
  setShowBag: (show: boolean) => void;
  fetchBag: () => void; // Fetch bag IDs on demand
  getCommitAction: () => any;
  getCommitWarning: () => string | null;

  startVersusGame: (seed: number, lives?: number) => void;
  resolveVersusBattle: (opponentBoard: any, seed: number) => void;
  // Blockchain mode: optional callback override for "Continue" after battle
  afterBattleCallback: (() => void) | null;
  setAfterBattleCallback: (cb: (() => void) | null) => void;
  mobileTab: 'hand' | 'board';
  setMobileTab: (tab: 'hand' | 'board') => void;
  resetActiveSessionView: () => void;
  saveLocalResumePoint: () => void;
  restoreLocalResumePoint: () => boolean;
  clearLocalResumePoint: () => void;
}

let wasmInitialized = false;
let initPromise: Promise<void> | null = null;
let initEnginePromise: Promise<void> | null = null;
const LOCAL_SESSION_STORAGE_KEY = 'localGameSessionV1';
const EMPTY_BOARD_COMMIT_WARNING =
  'Your board is empty, but you can still field a unit this round. Are you sure you want to commit?';
const NO_ACTIONS_COMMIT_WARNING =
  'You have not taken any actions this round. Are you sure you want to commit?';

function buildCardNameMap(metas: Array<{ id: number; name: string }>): Record<number, string> {
  return Object.fromEntries(metas.map((meta) => [meta.id, meta.name]));
}

function localSessionJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __bigint__: value.toString() };
  }
  return value;
}

function localSessionJsonReviver(_key: string, value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    '__bigint__' in value &&
    typeof (value as { __bigint__?: unknown }).__bigint__ === 'string'
  ) {
    return BigInt((value as { __bigint__: string }).__bigint__);
  }
  return value;
}

function loadPersistedLocalSession(): PersistedLocalSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw, localSessionJsonReviver) as PersistedLocalSession;
    if (parsed?.version !== 1 || !parsed.session || typeof parsed.session.set_id !== 'number') {
      localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    return null;
  }
}

function savePersistedLocalSession(session: GameSessionSnapshot) {
  const payload: PersistedLocalSession = {
    version: 1,
    session,
    savedAt: Date.now(),
  };
  localStorage.setItem(
    LOCAL_SESSION_STORAGE_KEY,
    JSON.stringify(payload, localSessionJsonReplacer)
  );
}

function clearPersistedLocalSession() {
  localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
}

function canStillFieldAUnitThisRound(view: GameView | null): boolean {
  if (!view || view.phase !== 'shop') return false;
  if (view.board.some(Boolean)) return false;

  const handCards = view.hand
    .map((card, index) => ({ card, index }))
    .filter((entry): entry is { card: CardView; index: number } => entry.card != null);

  if (handCards.length === 0) return false;

  return handCards.some(({ card, index }) => {
    if (card.play_cost > view.mana_limit) return false;

    const burnManaFromOtherCards = handCards.reduce(
      (total, entry) => total + (entry.index === index ? 0 : entry.card.burn_value),
      0
    );
    const reachableMana = Math.min(view.mana + burnManaFromOtherCards, view.mana_limit);

    return reachableMana >= card.play_cost;
  });
}

function getCommitWarning(view: GameView | null): string | null {
  if (canStillFieldAUnitThisRound(view)) {
    return EMPTY_BOARD_COMMIT_WARNING;
  }

  if (view?.phase === 'shop' && !view.can_undo) {
    return NO_ACTIONS_COMMIT_WARNING;
  }

  return null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  engine: null,
  view: null,
  battleOutput: null,
  cardSet: null,
  cardNameMap: {},
  currentSetId: null,
  bag: null,
  isLoading: true,
  error: null,
  selection: null,
  showBattleOverlay: false,
  showRawJson: JSON.parse(localStorage.getItem('showRawJson') || 'false'),
  showCardNames: JSON.parse(localStorage.getItem('showCardNames') ?? 'true'),
  showGameCardDetailsPanel: (JSON.parse(localStorage.getItem('showGameCardDetailsPanel') ?? '"auto"') as CardDetailsPanelMode),
  showBoardHelper: JSON.parse(localStorage.getItem('showBoardHelper') ?? 'true'),
  showAddress: JSON.parse(localStorage.getItem('showAddress') ?? 'true'),
  showBalance: JSON.parse(localStorage.getItem('showBalance') ?? 'true'),
  defaultBattleSpeed: JSON.parse(localStorage.getItem('defaultBattleSpeed') ?? '1'),
  reducedAnimations: JSON.parse(localStorage.getItem('reducedAnimations') ?? 'false'),
  showBag: false,
  startingLives: 3,
  winsToVictory: 10,
  afterBattleCallback: null,
  mobileTab: 'hand' as const,

  // Set selection state
  setMetas: [],
  engineReady: false,
  gameStarted: false,
  previewCards: null,
  showSetPreview: false,
  setPreviewCards: {},

  // Phase 1: Load WASM, create engine, init emoji map, fetch set metas
  initEngine: async () => {
    if (get().engine) {
      // Engine exists from a previous session — reset to set selection
      set({
        gameStarted: false,
        view: null,
        cardSet: null,
        battleOutput: null,
        selection: null,
        showBattleOverlay: false,
      });
      return;
    }
    if (initEnginePromise) return initEnginePromise;

    initEnginePromise = (async () => {
      try {
        set({ isLoading: true, error: null });

        const wasm = (await import('oab-client')) as unknown as WasmModule;

        if (!wasmInitialized) {
          await wasm.default();
          wasmInitialized = true;
        }
        const engine = new wasm.GameEngine(undefined); // Don't auto-init

        // Initialize emoji map from card metadata baked into the WASM binary
        const metas = engine.get_card_metas();
        initEmojiMap(metas);

        // Fetch set metadata for set selection screen
        const setMetas: SetMeta[] = engine.get_set_metas();

        set({
          engine,
          setMetas,
          cardNameMap: buildCardNameMap(metas),
          currentSetId: null,
          engineReady: true,
          gameStarted: false,
          isLoading: false,
        });
      } catch (err) {
        console.error('Failed to initialize WASM:', err);
        set({ error: String(err), isLoading: false });
      } finally {
        initEnginePromise = null;
      }
    })();

    return initEnginePromise;
  },

  // Phase 2: Load card set and start a new run
  startGame: (setId: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.load_card_set(setId);
      const seed = BigInt(Date.now());
      engine.new_run(seed);
      set({
        view: engine.get_view(),
        cardSet: engine.get_card_set(),
        currentSetId: setId,
        gameStarted: true,
        isLoading: false,
        showSetPreview: false,
        previewCards: null,
      });
      get().saveLocalResumePoint();
    } catch (err) {
      console.error('Failed to start game:', err);
      set({ error: String(err) });
    }
  },

  // One-shot init (for blockchain/versus flows)
  init: async (seed?: bigint) => {
    // If engine already exists, nothing to do
    if (get().engine) return;
    // If init is already in progress, return the existing promise to avoid race
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        set({ isLoading: true, error: null });

        const wasm = (await import('oab-client')) as unknown as WasmModule;

        if (!wasmInitialized) {
          await wasm.default();
          wasmInitialized = true;
        }
        const engine = new wasm.GameEngine(undefined); // Don't auto-init
        engine.load_card_set(1);

        // Initialize emoji map from card metadata baked into the WASM binary
        const metas = engine.get_card_metas();
        initEmojiMap(metas);

        // Fetch set metadata
        const setMetas: SetMeta[] = engine.get_set_metas();

        if (seed !== undefined) {
          engine.new_run(seed);
        } else {
          engine.new_run(BigInt(Date.now()));
        }
        set({
          engine,
          setMetas,
          engineReady: true,
          gameStarted: true,
          view: engine.get_view(),
          cardSet: engine.get_card_set(), // Fetch card set once on init
          cardNameMap: buildCardNameMap(metas),
          currentSetId: 1,
          isLoading: false,
        });
      } catch (err) {
        console.error('Failed to initialize WASM:', err);
        set({ error: String(err), isLoading: false });
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  },

  // Preview a set's cards without starting a game
  previewSet: (setId: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      const cards: CardView[] = engine.get_set_cards(setId);
      set({ previewCards: cards, showSetPreview: true });
    } catch (err) {
      console.error('Failed to preview set:', err);
    }
  },

  closePreview: () => {
    set({ showSetPreview: false, previewCards: null });
  },

  loadSetPreviews: () => {
    const { engine, setMetas } = get();
    if (!engine || setMetas.length === 0) return;
    const previews: Record<number, CardView[]> = {};
    for (const meta of setMetas) {
      try {
        previews[meta.id] = engine.get_set_cards(meta.id);
      } catch {
        // skip failed sets
      }
    }
    set({ setPreviewCards: previews });
  },

  burnHandCard: (index: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.burn_hand_card(index);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error(err);
    }
  },

  playHandCard: (handIndex: number, boardSlot: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.play_hand_card(handIndex, boardSlot);
      set({
        view: engine.get_view(),
        selection: { type: 'board', index: boardSlot },
        mobileTab: 'board',
      });
    } catch (err) {
      toast.error('Not enough mana!');
      console.error(err);
    }
  },

  swapBoardPositions: (slotA: number, slotB: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.swap_board_positions(slotA, slotB);
      set({ view: engine.get_view(), selection: { type: 'board', index: slotB } });
    } catch (err) {
      console.error(err);
    }
  },

  burnBoardUnit: (boardSlot: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.burn_board_unit(boardSlot);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error(err);
    }
  },

  undo: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.undo();
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error(err);
    }
  },

  endTurn: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.end_turn();
      set({
        view: engine.get_view(),
        battleOutput: engine.get_battle_output(),
        selection: null,
        showBattleOverlay: true,
      });
    } catch (err) {
      console.error(err);
    }
  },

  continueAfterBattle: () => {
    const { engine, afterBattleCallback } = get();
    if (!engine) return;
    try {
      if (afterBattleCallback) {
        // Blockchain mode: use the override callback (refreshes from chain)
        afterBattleCallback();
        set({ showBattleOverlay: false, battleOutput: null, afterBattleCallback: null });
      } else {
        // Local/P2P mode: advance round locally
        engine.continue_after_battle();
        const nextView = engine.get_view();
        set({ view: nextView, showBattleOverlay: false, battleOutput: null });
        if (nextView?.phase === 'completed') {
          clearPersistedLocalSession();
        } else {
          get().saveLocalResumePoint();
        }
      }
    } catch (err) {
      console.error(err);
    }
  },

  newRun: () => {
    const { engine, resetActiveSessionView } = get();
    if (!engine) return;
    try {
      clearPersistedLocalSession();
      resetActiveSessionView();
    } catch (err) {
      console.error(err);
    }
  },

  startVersusGame: (playerSeed: number, lives?: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      if (lives !== undefined) {
        engine.new_run_p2p(BigInt(playerSeed), lives);
      } else {
        engine.new_run(BigInt(playerSeed));
      }
      set({
        view: engine.get_view(),
        cardSet: engine.get_card_set(),
        battleOutput: null,
        selection: null,
        showBattleOverlay: false,
        gameStarted: true,
        startingLives: engine.get_starting_lives(),
        winsToVictory: engine.get_wins_to_victory(),
      });
    } catch (err) {
      console.error(err);
    }
  },

  resolveVersusBattle: (opponentBoard: any, seed: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      // resolve_battle_p2p is self-contained: sets phase, runs battle, applies result
      const battleOutput = engine.resolve_battle_p2p(
        engine.get_board(),
        opponentBoard,
        BigInt(seed)
      );
      set({
        view: engine.get_view(),
        battleOutput: battleOutput,
        selection: null,
        showBattleOverlay: true,
      });
    } catch (err) {
      console.error(err);
    }
  },

  setSelection: (selection: Selection | null) => {
    set({ selection });
  },
  closeBattleOverlay: () => {
    set({ showBattleOverlay: false });
  },
  setShowBag: (show: boolean) => {
    set({ showBag: show, selection: null });
    // Fetch bag when opening the overlay
    if (show) {
      get().fetchBag();
    }
  },
  fetchBag: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      const bag = engine.get_bag();
      set({ bag });
    } catch (err) {
      console.error('Failed to fetch bag:', err);
    }
  },
  getCommitAction: () => {
    const { engine } = get();
    if (!engine) return null;
    return engine.get_commit_action();
  },
  getCommitWarning: () => getCommitWarning(get().view),
  setAfterBattleCallback: (cb: (() => void) | null) => {
    set({ afterBattleCallback: cb });
  },
  setMobileTab: (tab: 'hand' | 'board') => set({ mobileTab: tab }),
  resetActiveSessionView: () => {
    set({
      view: null,
      cardSet: null,
      battleOutput: null,
      selection: null,
      showBattleOverlay: false,
      gameStarted: false,
      currentSetId: null,
      startingLives: 3,
      winsToVictory: 10,
      afterBattleCallback: null,
      showBag: false,
      bag: null,
      mobileTab: 'hand',
      showSetPreview: false,
      previewCards: null,
    });
  },
  saveLocalResumePoint: () => {
    const { engine, gameStarted, currentSetId } = get();
    if (!engine || !gameStarted || currentSetId === null) {
      clearPersistedLocalSession();
      return;
    }

    try {
      const session = engine.get_local_session();
      if (!session?.state || session.state.phase !== 'Shop') {
        clearPersistedLocalSession();
        return;
      }
      savePersistedLocalSession(session);
    } catch (err) {
      console.error('Failed to save local resume point:', err);
    }
  },
  restoreLocalResumePoint: () => {
    const { engine } = get();
    if (!engine) return false;

    const persisted = loadPersistedLocalSession();
    if (!persisted) return false;

    try {
      engine.load_card_set(persisted.session.set_id);
      engine.restore_local_session(persisted.session);
      set({
        view: engine.get_view(),
        cardSet: engine.get_card_set(),
        battleOutput: null,
        selection: null,
        showBattleOverlay: false,
        currentSetId: persisted.session.set_id,
        gameStarted: true,
        isLoading: false,
        error: null,
        showSetPreview: false,
        previewCards: null,
        startingLives: engine.get_starting_lives(),
        winsToVictory: engine.get_wins_to_victory(),
        mobileTab: 'hand',
      });
      return true;
    } catch (err) {
      console.error('Failed to restore local resume point:', err);
      clearPersistedLocalSession();
      return false;
    }
  },
  clearLocalResumePoint: () => {
    clearPersistedLocalSession();
  },

  toggleShowRawJson: () => {
    set((state) => {
      const newValue = !state.showRawJson;
      localStorage.setItem('showRawJson', JSON.stringify(newValue));
      return { showRawJson: newValue };
    });
  },

  toggleShowCardNames: () => {
    set((state) => {
      const newValue = !state.showCardNames;
      localStorage.setItem('showCardNames', JSON.stringify(newValue));
      return { showCardNames: newValue };
    });
  },

  setCardDetailsPanelMode: (mode: CardDetailsPanelMode) => {
    localStorage.setItem('showGameCardDetailsPanel', JSON.stringify(mode));
    set({ showGameCardDetailsPanel: mode });
  },

  toggleShowBoardHelper: () => {
    set((state) => {
      const newValue = !state.showBoardHelper;
      localStorage.setItem('showBoardHelper', JSON.stringify(newValue));
      return { showBoardHelper: newValue };
    });
  },

  toggleShowAddress: () => {
    set((state) => {
      const newValue = !state.showAddress;
      localStorage.setItem('showAddress', JSON.stringify(newValue));
      return { showAddress: newValue };
    });
  },

  toggleShowBalance: () => {
    set((state) => {
      const newValue = !state.showBalance;
      localStorage.setItem('showBalance', JSON.stringify(newValue));
      return { showBalance: newValue };
    });
  },

  setDefaultBattleSpeed: (speed: number) => {
    localStorage.setItem('defaultBattleSpeed', JSON.stringify(speed));
    set({ defaultBattleSpeed: speed });
  },

  toggleReducedAnimations: () => {
    set((state) => {
      const newValue = !state.reducedAnimations;
      localStorage.setItem('reducedAnimations', JSON.stringify(newValue));
      return { reducedAnimations: newValue };
    });
  },
}));
