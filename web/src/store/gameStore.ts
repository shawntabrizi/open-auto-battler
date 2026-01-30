import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import type { GameView, BattleOutput, Selection, CardView } from '../types';

interface GameEngine {
  // Core methods
  get_view: () => any;
  get_battle_output: () => any;
  pitch_hand_card: (index: number) => void;
  play_hand_card: (handIndex: number, boardSlot: number) => void;
  swap_board_positions: (slotA: number, slotB: number) => void;
  pitch_board_unit: (boardSlot: number) => void;
  end_turn: () => void;
  continue_after_battle: () => void;
  new_run: () => void;
  get_state: () => any;
  set_state: (state: any) => void;
  get_board: () => any;
  set_phase_battle: () => void;
  resolve_battle_p2p: (player_board: any, enemy_board: any, seed: bigint) => any;
  apply_battle_result: (result: any) => void;
  get_commit_action: () => any;
  get_commit_action_scale: () => Uint8Array;
  get_bag: () => number[];
  get_card_set: () => CardView[];

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

  init: () => Promise<void>;
  pitchHandCard: (index: number) => void;
  playHandCard: (handIndex: number, boardSlot: number) => void;
  swapBoardPositions: (slotA: number, slotB: number) => void;
  pitchBoardUnit: (boardSlot: number) => void;
  endTurn: () => void;
  continueAfterBattle: () => void;
  newRun: () => void;
  setSelection: (selection: Selection | null) => void;
  closeBattleOverlay: () => void;
  toggleShowRawJson: () => void;
  setShowBag: (show: boolean) => void;
  fetchBag: () => void; // Fetch bag IDs on demand
  getCommitAction: () => any;

  startMultiplayerGame: (seed: number) => void;
  resolveMultiplayerBattle: (opponentBoard: any, seed: number) => void;
}

let wasmInitialized = false;
let initPromise: Promise<void> | null = null;

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

  init: async () => {
    // If engine already exists, nothing to do
    if (get().engine) return;
    // If init is already in progress, return the existing promise to avoid race
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        set({ isLoading: true, error: null });
        const wasm = (await import('manalimit-client')) as unknown as WasmModule;
        if (!wasmInitialized) {
          await wasm.default();
          wasmInitialized = true;
        }
        const engine = new wasm.GameEngine();
        set({
          engine,
          view: engine.get_view(),
          cardSet: engine.get_card_set(), // Fetch card set once on init
          isLoading: false
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

  pitchHandCard: (index: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.pitch_hand_card(index);
      set({ view: engine.get_view(), selection: null });
    } catch (err) { console.error(err); }
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
    } catch (err) { console.error(err); }
  },

  pitchBoardUnit: (boardSlot: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.pitch_board_unit(boardSlot);
      set({ view: engine.get_view(), selection: null });
    } catch (err) { console.error(err); }
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
    } catch (err) { console.error(err); }
  },

  continueAfterBattle: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      const view = engine.get_view();
      // If already in shop phase (e.g., blockchain already processed the turn),
      // just close the overlay without calling the WASM method
      if (view?.phase === 'shop') {
        set({ showBattleOverlay: false, battleOutput: null });
        return;
      }
      engine.continue_after_battle();
      set({ view: engine.get_view(), showBattleOverlay: false, battleOutput: null });
    } catch (err) { console.error(err); }
  },

  newRun: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.new_run();
      set({ 
        view: engine.get_view(), 
        cardSet: engine.get_card_set(), // Refresh card set on new run
        battleOutput: null, 
        selection: null, 
        showBattleOverlay: false 
      });
    } catch (err) { console.error(err); }
  },

  startMultiplayerGame: (_seed: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.new_run();
      set({ 
        view: engine.get_view(), 
        cardSet: engine.get_card_set(), // Refresh card set
        battleOutput: null, 
        selection: null, 
        showBattleOverlay: false 
      });
    } catch (err) { console.error(err); }
  },

  resolveMultiplayerBattle: (opponentBoard: any, seed: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.set_phase_battle();
      const battleOutput = engine.resolve_battle_p2p(engine.get_board(), opponentBoard, BigInt(seed));
      const events = (battleOutput as any).events;
      const lastEvent = events[events.length - 1];
      if (lastEvent && lastEvent.type === 'BattleEnd') {
        engine.apply_battle_result(lastEvent.payload.result);
      }
      set({ view: engine.get_view(), battleOutput: battleOutput as any, selection: null, showBattleOverlay: true });
    } catch (err) { console.error(err); }
  },

  setSelection: (selection: Selection | null) => { set({ selection }); },
  closeBattleOverlay: () => { set({ showBattleOverlay: false }); },
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
  toggleShowRawJson: () => {
    set((state) => {
      const newValue = !state.showRawJson;
      localStorage.setItem('showRawJson', JSON.stringify(newValue));
      return { showRawJson: newValue };
    });
  },
}));
