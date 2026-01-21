// Types matching the Rust view structs

export interface CardView {
  id: number;
  templateId: string;
  name: string;
  attack: number;
  health: number;
  playCost: number;
  pitchValue: number;
}

export interface BoardUnitView {
  id: number;
  templateId: string;
  name: string;
  attack: number;
  maxHealth: number;
  currentHealth: number;
  playCost: number;
  pitchValue: number;
}

export interface ShopSlotView {
  card: CardView | null;
  frozen: boolean;
}

export interface GameView {
  shop: ShopSlotView[];
  bench: (CardView | null)[];
  board: (BoardUnitView | null)[];
  mana: number;
  manaLimit: number;
  round: number;
  lives: number;
  wins: number;
  phase: 'shop' | 'battle' | 'victory' | 'defeat';
  deckCount: number;
  canAfford: boolean[];
}

// Combat events
export type Side = 'player' | 'enemy';

export interface CombatTarget {
  side: Side;
  index: number;
  name: string;
}

export type CombatEvent =
  | { type: 'battleStart'; playerUnits: string[]; enemyUnits: string[] }
  | { type: 'unitsClash'; player: CombatTarget; enemy: CombatTarget }
  | { type: 'damageDealt'; target: CombatTarget; amount: number; newHealth: number }
  | { type: 'unitDied'; target: CombatTarget }
  | { type: 'unitsSlide'; side: Side }
  | { type: 'battleEnd'; result: string };

export interface BattleResultView {
  result: 'victory' | 'defeat' | 'draw';
  playerRemaining: number;
  enemyRemaining: number;
}

export interface BattleOutput {
  events: CombatEvent[];
  result: BattleResultView;
  enemyBoard: string[];
}

// Selection state for UI
export type SelectionType = 'shop' | 'bench' | 'board';

export interface Selection {
  type: SelectionType;
  index: number;
}
