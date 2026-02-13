/// <reference types="vite/client" />

declare module 'oab-client' {
  export default function init(module_or_path?: string | URL | Request): Promise<void>;

  export class GameEngine {
    constructor(seed?: bigint | null);
    get_view(): import('./types').GameView;
    get_battle_output(): any;
    get_bag(): any;
    get_card_set(): any;
    get_board(): any;
    get_state(): any;
    get_commit_action(): any;
    get_commit_action_scale(): Uint8Array;
    pitch_hand_card(index: number): void;
    play_hand_card(handIndex: number, boardSlot: number): void;
    swap_board_positions(slotA: number, slotB: number): void;
    pitch_board_unit(boardSlot: number): void;
    undo(): void;
    end_turn(): void;
    continue_after_battle(): void;
    new_run(seed: bigint): void;
    submit_turn(action: any): void;
    resolve_battle_p2p(playerBoard: any, enemyBoard: any, seed: bigint): any;
    init_from_scale(session: Uint8Array, cardSet: Uint8Array): void;
    load_card_set(setId: number): void;
    get_card_metas(): Array<{ id: number; name: string; emoji: string }>;
    add_card(card: any): void;
  }

  export function greet(): string;
  export function init(): void;
  export function get_unit_templates(): any;
  export function run_sandbox_battle(playerUnits: any, enemyUnits: any, seed: bigint): any;
}
