/// <reference types="vite/client" />

declare module 'manalimit-core' {
  export default function init(module_or_path?: string | URL | Request): Promise<void>;

  export class GameEngine {
    constructor();
    get_view(): import('./types').GameView;
    get_battle_output(): import('./types').BattleOutput | null;
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

  export function greet(): string;
}
