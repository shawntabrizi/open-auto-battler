// Ability types
export interface Ability {
  trigger: AbilityTrigger;
  effect: AbilityEffect;
  name: string;
  description: string;
}

export type AbilityTrigger = 'onStart' | 'onFaint';

export type AbilityTarget = 'selfUnit' | 'allAllies' | 'allEnemies' | 'randomAlly' | 'randomEnemy' | 'frontAlly' | 'frontEnemy';

export type AbilityEffect =
  | { type: 'damage'; amount: number; target: AbilityTarget }
  | { type: 'heal'; amount: number; target: AbilityTarget }
  | { type: 'attackBuff'; amount: number; target: AbilityTarget; duration: number }
  | { type: 'healthBuff'; amount: number; target: AbilityTarget; duration: number };

// Types matching the Rust view structs

export interface CardView {
  id: number;
  templateId: string;
  name: string;
  attack: number;
  health: number;
  playCost: number;
  pitchValue: number;
  ability?: Ability;
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

export interface CombatUnitInfo {
  name: string;
  templateId: string;
  attack: number;
  health: number;
  maxHealth: number;
  ability?: Ability;
}

export type CombatEvent =
  | { type: 'battleStart'; playerUnits: CombatUnitInfo[]; enemyUnits: CombatUnitInfo[] }
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
  initialPlayerUnits: CombatUnitInfo[];
  initialEnemyUnits: CombatUnitInfo[];
}

// Selection state for UI
export type SelectionType = 'shop' | 'board';

export interface Selection {
  type: SelectionType;
  index: number;
}
