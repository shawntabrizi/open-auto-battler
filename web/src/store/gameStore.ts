import { create } from 'zustand';
import type { GameView, BattleOutput, Selection } from '../types';

interface GameEngineInstance {
  get_view(): GameView;
  get_battle_output(): BattleOutput | null;
  pitch_shop_card(index: number): void;
  buy_card(shopIndex: number): void;
  toggle_freeze(shopIndex: number): void;
  place_unit(benchIndex: number, boardSlot: number): void;
  return_unit(boardSlot: number): void;
  swap_board_positions(slotA: number, slotB: number): void;
  pitch_board_unit(boardSlot: number): void;
  pitch_bench_unit(benchIndex: number): void;
  end_turn(): void;
  continue_after_battle(): void;
  new_run(): void;
}

interface GameStore {
  // State
  engine: GameEngineInstance | null;
  view: GameView | null;
  battleOutput: BattleOutput | null;
  isLoading: boolean;
  error: string | null;
  selection: Selection | null;
  showBattleOverlay: boolean;
  currentBattleEventIndex: number;

  // Actions
  init: () => Promise<void>;
  pitchShopCard: (index: number) => void;
  buyCard: (shopIndex: number) => void;
  toggleFreeze: (shopIndex: number) => void;
  placeUnit: (benchIndex: number, boardSlot: number) => void;
  returnUnit: (boardSlot: number) => void;
  swapBoardPositions: (slotA: number, slotB: number) => void;
  pitchBoardUnit: (boardSlot: number) => void;
  pitchBenchUnit: (benchIndex: number) => void;
  endTurn: () => void;
  continueAfterBattle: () => void;
  newRun: () => void;
  setSelection: (selection: Selection | null) => void;
  advanceBattleEvent: () => void;
  closeBattleOverlay: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  engine: null,
  view: null,
  battleOutput: null,
  isLoading: true,
  error: null,
  selection: null,
  showBattleOverlay: false,
  currentBattleEventIndex: 0,

  // Initialize WASM
  init: async () => {
    try {
      set({ isLoading: true, error: null });

      // Dynamic import of WASM module
      const wasm = await import('manalimit-core');

      // Initialize the WASM module with path to public folder
      await wasm.default('/manalimit_core_bg.wasm');

      // Create engine instance
      const engine = new wasm.GameEngine();
      const view = engine.get_view();

      set({ engine, view, isLoading: false });

      console.log('WASM initialized:', wasm.greet());
    } catch (err) {
      console.error('Failed to initialize WASM:', err);
      set({ error: String(err), isLoading: false });
    }
  },

  // Sync view after any action
  syncView: () => {
    const { engine } = get();
    if (!engine) return;
    set({ view: engine.get_view() });
  },

  // Shop actions
  pitchShopCard: (index: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.pitch_shop_card(index);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error('Failed to pitch card:', err);
    }
  },

  buyCard: (shopIndex: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.buy_card(shopIndex);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error('Failed to buy card:', err);
    }
  },

  toggleFreeze: (shopIndex: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.toggle_freeze(shopIndex);
      set({ view: engine.get_view() });
    } catch (err) {
      console.error('Failed to toggle freeze:', err);
    }
  },

  // Board management
  placeUnit: (benchIndex: number, boardSlot: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.place_unit(benchIndex, boardSlot);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error('Failed to place unit:', err);
    }
  },

  returnUnit: (boardSlot: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.return_unit(boardSlot);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error('Failed to return unit:', err);
    }
  },

  swapBoardPositions: (slotA: number, slotB: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.swap_board_positions(slotA, slotB);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error('Failed to swap positions:', err);
    }
  },

  pitchBoardUnit: (boardSlot: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.pitch_board_unit(boardSlot);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error('Failed to pitch board unit:', err);
    }
  },

  pitchBenchUnit: (benchIndex: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.pitch_bench_unit(benchIndex);
      set({ view: engine.get_view(), selection: null });
    } catch (err) {
      console.error('Failed to pitch bench unit:', err);
    }
  },

  // Turn management
  endTurn: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.end_turn();
      const battleOutput = engine.get_battle_output();
      set({
        view: engine.get_view(),
        battleOutput,
        selection: null,
        showBattleOverlay: true,
        currentBattleEventIndex: 0,
      });
    } catch (err) {
      console.error('Failed to end turn:', err);
    }
  },

  continueAfterBattle: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.continue_after_battle();
      set({
        view: engine.get_view(),
        showBattleOverlay: false,
        battleOutput: null,
        currentBattleEventIndex: 0,
      });
    } catch (err) {
      console.error('Failed to continue:', err);
    }
  },

  newRun: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.new_run();
      set({
        view: engine.get_view(),
        battleOutput: null,
        selection: null,
        showBattleOverlay: false,
        currentBattleEventIndex: 0,
      });
    } catch (err) {
      console.error('Failed to start new run:', err);
    }
  },

  // UI state
  setSelection: (selection: Selection | null) => {
    set({ selection });
  },

  advanceBattleEvent: () => {
    const { battleOutput, currentBattleEventIndex } = get();
    if (!battleOutput) return;

    if (currentBattleEventIndex < battleOutput.events.length - 1) {
      set({ currentBattleEventIndex: currentBattleEventIndex + 1 });
    }
  },

  closeBattleOverlay: () => {
    set({ showBattleOverlay: false });
  },
}));
