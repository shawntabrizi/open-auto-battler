/// <reference types="vite/client" />

declare module 'manalimit-core' {
  export default function init(module_or_path?: string | URL | Request): Promise<void>;

  export class GameEngine {
    constructor();
    get_view(): import('./types').GameView;
    get_battle_output(): any;
    pitch_hand_card(index: number): void;
    play_hand_card(handIndex: number, boardSlot: number): void;
    buy_and_place(handIndex: number, boardSlot: number): void;
    swap_board_positions(slotA: number, slotB: number): void;
    pitch_board_unit(boardSlot: number): void;
    end_turn(): void;
    continue_after_battle(): void;
    new_run(): void;
    get_state(): any;
    set_state(state: any): void;
    get_board(): any;
    resolve_battle_p2p(playerBoard: any, enemyBoard: any, seed: bigint): any;
    apply_battle_result(result: any): void;
    set_phase_battle(): void;
  }

  export function greet(): string;
}
