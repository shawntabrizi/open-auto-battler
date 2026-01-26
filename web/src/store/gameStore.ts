import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import type { GameView, BattleOutput, Selection, BoardUnitView } from '../types';
import type { GameEngine } from '../wasm/manalimit_core';

type GameEngineInstance = GameEngine;

interface WasmModule {
  default: () => Promise<void>;
  GameEngine: typeof GameEngine;
  greet: () => string;
}

interface GameStore {
  engine: GameEngineInstance | null;
  view: GameView | null;
  battleOutput: BattleOutput | null;
  isLoading: boolean;
  error: string | null;
  selection: Selection | null;
  showBattleOverlay: boolean;
  showRawJson: boolean;

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

  startMultiplayerGame: (seed: number) => void;
  resolveMultiplayerBattle: (opponentBoard: any, seed: number) => void;
}

let wasmInitialized = false;

export const useGameStore = create<GameStore>((set, get) => ({
  engine: null,
  view: null,
  battleOutput: null,
  isLoading: true,
  error: null,
  selection: null,
  showBattleOverlay: false,
  showRawJson: JSON.parse(localStorage.getItem('showRawJson') || 'false'),

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
    } catch (err) {
      console.error('Failed to initialize WASM:', err);
      set({ error: String(err), isLoading: false });
    }
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
      set({ view: engine.get_view(), selection: null });
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
      set({ view: engine.get_view(), selection: null });
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
      engine.continue_after_battle();
      set({ view: engine.get_view(), showBattleOverlay: false, battleOutput: null });
    } catch (err) { console.error(err); }
  },

  newRun: () => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.new_run();
      set({ view: engine.get_view(), battleOutput: null, selection: null, showBattleOverlay: false });
    } catch (err) { console.error(err); }
  },

  startMultiplayerGame: (_seed: number) => {
    const { engine } = get();
    if (!engine) return;
    try {
      engine.new_run();
      set({ view: engine.get_view(), battleOutput: null, selection: null, showBattleOverlay: false });
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
      if (lastEvent && lastEvent.type === 'battleEnd') {
        engine.apply_battle_result(lastEvent.payload.result);
      }
      set({ view: engine.get_view(), battleOutput: battleOutput as any, selection: null, showBattleOverlay: true });
    } catch (err) { console.error(err); }
  },

  setSelection: (selection: Selection | null) => { set({ selection }); },
  closeBattleOverlay: () => { set({ showBattleOverlay: false }); },
  toggleShowRawJson: () => {
    set((state) => {
      const newValue = !state.showRawJson;
      localStorage.setItem('showRawJson', JSON.stringify(newValue));
      return { showRawJson: newValue };
    });
  },
}));
