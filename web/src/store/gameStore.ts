import { create } from 'zustand';
import type { GameView, BattleOutput, Selection } from '../types';
import type { GameEngine } from '../wasm/manalimit_core';

type GameEngineInstance = GameEngine;

interface WasmModule {
  default: () => Promise<void>;
  GameEngine: typeof GameEngine;
  greet: () => string;
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

  // Actions
  init: () => Promise<void>;
  pitchShopCard: (index: number) => void;
  buyCard: (shopIndex: number) => void;
  toggleFreeze: (shopIndex: number) => void;
  swapBoardPositions: (slotA: number, slotB: number) => void;
  pitchBoardUnit: (boardSlot: number) => void;
  endTurn: () => void;
  continueAfterBattle: () => void;
  newRun: () => void;
  setSelection: (selection: Selection | null) => void;
  closeBattleOverlay: () => void;
}

// Module-level state to prevent double initialization
let wasmInitialized = false;

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  engine: null,
  view: null,
  battleOutput: null,
  isLoading: true,
  error: null,
  selection: null,
  showBattleOverlay: false,

  // Initialize WASM
  init: async () => {
    if (get().engine) return;

    try {
      set({ isLoading: true, error: null });

      const wasm = (await import('manalimit-core')) as unknown as WasmModule;
      if (!wasmInitialized) {
        await wasm.default();
        wasmInitialized = true;
      }

      const engine = new wasm.GameEngine();
      set({ engine, view: engine.get_view(), isLoading: false });

      console.log('WASM initialized:', wasm.greet());
    } catch (err) {
      console.error('Failed to initialize WASM:', err);
      set({ error: String(err), isLoading: false });
    }
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
      });
    } catch (err) {
      console.error('Failed to start new run:', err);
    }
  },

  // UI state
  setSelection: (selection: Selection | null) => {
    set({ selection });
  },

  closeBattleOverlay: () => {
    set({ showBattleOverlay: false });
  },
}));
