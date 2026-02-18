import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import type { GameView, BattleOutput, Selection, CardView } from '../types';
import { initEmojiMap } from '../utils/emoji';

interface SetMeta {
  id: number;
  name: string;
}

interface GameEngine {
  // Core methods
  get_view: () => any;
  get_battle_output: () => any;
  pitch_hand_card: (index: number) => void;
  play_hand_card: (handIndex: number, boardSlot: number) => void;
  swap_board_positions: (slotA: number, slotB: number) => void;
  pitch_board_unit: (boardSlot: number) => void;
  undo: () => void;
  end_turn: () => void;
  continue_after_battle: () => void;
  new_run: (seed: bigint) => void;
  get_state: () => any;
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
  bag: number[] | null; // Bag as a list of Card IDs
  isLoading: boolean;
  error: string | null;
  selection: Selection | null;
  showBattleOverlay: boolean;
  showRawJson: boolean;
  showBag: boolean;
  startingLives: number;
  winsToVictory: number;

  // Set selection state
  setMetas: SetMeta[];
  engineReady: boolean;
  gameStarted: boolean;
  previewCards: CardView[] | null;
  showSetPreview: boolean;

  // Two-phase init
  initEngine: () => Promise<void>;
  startGame: (setId: number) => void;

  // Backward-compatible init (loads engine + starts game immediately)
  init: (seed?: bigint) => Promise<void>;

  // Preview
  previewSet: (setId: number) => void;
  closePreview: () => void;

  pitchHandCard: (index: number) => void;
  playHandCard: (handIndex: number, boardSlot: number) => void;
  swapBoardPositions: (slotA: number, slotB: number) => void;
  pitchBoardUnit: (boardSlot: number) => void;
  undo: () => void;
  endTurn: () => void;
  continueAfterBattle: () => void;
  newRun: () => void;
  setSelection: (selection: Selection | null) => void;
  closeBattleOverlay: () => void;
  toggleShowRawJson: () => void;
  setShowBag: (show: boolean) => void;
  fetchBag: () => void; // Fetch bag IDs on demand
  getCommitAction: () => any;

  startMultiplayerGame: (seed: number, lives?: number) => void;
  resolveMultiplayerBattle: (opponentBoard: any, seed: number) => void;
  // Blockchain mode: optional callback override for "Continue" after battle
  afterBattleCallback: (() => void) | null;
  setAfterBattleCallback: (cb: (() => void) | null) => void;
}

let wasmInitialized = false;
let initPromise: Promise<void> | null = null;
let initEnginePromise: Promise<void> | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  engine: null,
  view: null,
  battleOutput: null,
  cardSet: null,
  bag: null,
  isLoading: true,
  error: null,
  selection: null,
  showBattleOverlay: false,
  showRawJson: JSON.parse(localStorage.getItem('showRawJson') || 'false'),
  showBag: false,
  startingLives: 3,
  winsToVictory: 10,
  afterBattleCallback: null,

  // Set selection state
  setMetas: [],
  engineReady: false,
  gameStarted: false,
  previewCards: null,
  showSetPreview: false,

  // Phase 1: Load WASM, create engine, init emoji map, fetch set metas
  initEngine: async () => {
    if (get().engine) {
      // Engine exists from a previous session — reset to set selection
      set({ gameStarted: false, view: null, cardSet: null, battleOutput: null, selection: null, showBattleOverlay: false });
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
        gameStarted: true,
        isLoading: false,
        showSetPreview: false,
        previewCards: null,
      });
    } catch (err) {
      console.error('Failed to start game:', err);
      set({ error: String(err) });
    }
  },

  // Backward-compatible init (for blockchain/multiplayer flows)
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

  pitchHandCard: (index: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.pitch_hand_card(index);
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
      set({ view: engine.get_view(), selection: { type: 'board', index: boardSlot } });
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

  pitchBoardUnit: (boardSlot: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.pitch_board_unit(boardSlot);
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
        set({ view: engine.get_view(), showBattleOverlay: false, battleOutput: null });
      }
    } catch (err) {
      console.error(err);
    }
  },

  newRun: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      // Return to set selection screen
      set({
        view: null,
        cardSet: null,
        battleOutput: null,
        selection: null,
        showBattleOverlay: false,
        gameStarted: false,
        startingLives: 3,
        winsToVictory: 10,
      });
    } catch (err) {
      console.error(err);
    }
  },

  startMultiplayerGame: (playerSeed: number, lives?: number) => {
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

  resolveMultiplayerBattle: (opponentBoard: any, seed: number) => {
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
    set({ showBag: show });
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
  setAfterBattleCallback: (cb: (() => void) | null) => {
    set({ afterBattleCallback: cb });
  },

  toggleShowRawJson: () => {
    set((state) => {
      const newValue = !state.showRawJson;
      localStorage.setItem('showRawJson', JSON.stringify(newValue));
      return { showRawJson: newValue };
    });
  },
}));
