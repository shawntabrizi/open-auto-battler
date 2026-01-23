import { create } from 'zustand';
import type { UnitTemplateView, BattleOutput, SandboxUnit } from '../types';

interface WasmModule {
  default: () => Promise<void>;
  get_unit_templates: () => UnitTemplateView[];
  run_sandbox_battle: (
    playerUnits: SandboxUnit[],
    enemyUnits: SandboxUnit[],
    seed: bigint
  ) => BattleOutput;
}

let wasmModule: WasmModule | null = null;

interface SandboxStore {
  // State
  templates: UnitTemplateView[];
  playerBoard: (UnitTemplateView | null)[];
  enemyBoard: (UnitTemplateView | null)[];
  selectedTemplate: UnitTemplateView | null;
  battleOutput: BattleOutput | null;
  isLoading: boolean;
  isBattling: boolean;
  battleSeed: number;
  searchQuery: string;

  // Actions
  init: () => Promise<void>;
  selectTemplate: (template: UnitTemplateView | null) => void;
  addToPlayerBoard: (slotIndex: number, template: UnitTemplateView) => void;
  addToEnemyBoard: (slotIndex: number, template: UnitTemplateView) => void;
  removeFromPlayerBoard: (slotIndex: number) => void;
  removeFromEnemyBoard: (slotIndex: number) => void;
  clearPlayerBoard: () => void;
  clearEnemyBoard: () => void;
  clearAllBoards: () => void;
  runBattle: () => void;
  closeBattle: () => void;
  setBattleSeed: (seed: number) => void;
  setSearchQuery: (query: string) => void;
}

let wasmInitialized = false;

export const useSandboxStore = create<SandboxStore>((set, get) => ({
  // Initial state
  templates: [],
  playerBoard: [null, null, null, null, null],
  enemyBoard: [null, null, null, null, null],
  selectedTemplate: null,
  battleOutput: null,
  isLoading: true,
  isBattling: false,
  battleSeed: 42,
  searchQuery: '',

  init: async () => {
    if (wasmModule) return;

    try {
      set({ isLoading: true });

      const wasm = (await import('manalimit-core')) as unknown as WasmModule;
      if (!wasmInitialized) {
        await wasm.default();
        wasmInitialized = true;
      }

      wasmModule = wasm;
      const templates = wasm.get_unit_templates();

      set({
        templates,
        isLoading: false,
      });

      console.log('Sandbox WASM initialized, loaded', templates.length, 'templates');
    } catch (err) {
      console.error('Failed to initialize sandbox WASM:', err);
      set({ isLoading: false });
    }
  },

  selectTemplate: (template) => {
    set({ selectedTemplate: template });
  },

  addToPlayerBoard: (slotIndex, template) => {
    const { playerBoard } = get();
    const newBoard = [...playerBoard];
    newBoard[slotIndex] = template;
    set({ playerBoard: newBoard });
  },

  addToEnemyBoard: (slotIndex, template) => {
    const { enemyBoard } = get();
    const newBoard = [...enemyBoard];
    newBoard[slotIndex] = template;
    set({ enemyBoard: newBoard });
  },

  removeFromPlayerBoard: (slotIndex) => {
    const { playerBoard } = get();
    const newBoard = [...playerBoard];
    newBoard[slotIndex] = null;
    set({ playerBoard: newBoard });
  },

  removeFromEnemyBoard: (slotIndex) => {
    const { enemyBoard } = get();
    const newBoard = [...enemyBoard];
    newBoard[slotIndex] = null;
    set({ enemyBoard: newBoard });
  },

  clearPlayerBoard: () => {
    set({ playerBoard: [null, null, null, null, null] });
  },

  clearEnemyBoard: () => {
    set({ enemyBoard: [null, null, null, null, null] });
  },

  clearAllBoards: () => {
    set({
      playerBoard: [null, null, null, null, null],
      enemyBoard: [null, null, null, null, null],
    });
  },

  runBattle: () => {
    if (!wasmModule) return;

    const { playerBoard, enemyBoard, battleSeed } = get();

    // Convert boards to SandboxUnit arrays (only non-null entries)
    const playerUnits: SandboxUnit[] = playerBoard
      .filter((t): t is UnitTemplateView => t !== null)
      .map((t) => ({ templateId: t.templateId }));

    const enemyUnits: SandboxUnit[] = enemyBoard
      .filter((t): t is UnitTemplateView => t !== null)
      .map((t) => ({ templateId: t.templateId }));

    if (playerUnits.length === 0 && enemyUnits.length === 0) {
      console.warn('Both boards are empty, cannot run battle');
      return;
    }

    try {
      const output = wasmModule.run_sandbox_battle(
        playerUnits,
        enemyUnits,
        BigInt(battleSeed)
      );
      set({ battleOutput: output, isBattling: true });
    } catch (err) {
      console.error('Failed to run sandbox battle:', err);
    }
  },

  closeBattle: () => {
    set({ battleOutput: null, isBattling: false });
  },

  setBattleSeed: (seed) => {
    set({ battleSeed: seed });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
}));
