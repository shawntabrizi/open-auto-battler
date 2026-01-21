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

//--- NEW BATTLE REPLAY TYPES ---

export interface UnitView {
  instanceId: string;
  templateId: string;
  name:string;
  attack: number;
  health: number;
  maxHealth: number;
  ability?: Ability;
}

export type CombatEvent =
  | { type: 'abilityTrigger'; payload: { sourceInstanceId: string; abilityName: string; } }
  | { type: 'clash'; payload: { pDmg: number; eDmg: number; } }
  | { type: 'damageTaken'; payload: { targetInstanceId: string; team: 'PLAYER' | 'ENEMY'; remainingHp: number; } }
  | { type: 'unitDeath'; payload: { team: 'PLAYER' | 'ENEMY'; newBoardState: UnitView[]; } }
  | { type: 'battleEnd'; payload: { result: 'VICTORY' | 'DEFEAT' | 'DRAW'; } };


export interface BattleOutput {
  events: CombatEvent[];
  initialPlayerUnits: UnitView[];
  initialEnemyUnits: UnitView[];
}

// Selection state for UI
export type SelectionType = 'shop' | 'board';

export interface Selection {
  type: SelectionType;
  index: number;
}
