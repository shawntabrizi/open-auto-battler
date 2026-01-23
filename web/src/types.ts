// Ability types
export interface Ability {
  trigger: AbilityTrigger;
  effect: AbilityEffect;
  name: string;
  description: string;
}

export type AbilityTrigger = 'onStart' | 'onFaint' | 'onAllyFaint' | 'onDamageTaken' | 'onSpawn' | 'beforeAttack' | 'afterAttack';

export type AbilityTarget =
  | 'selfUnit'
  | 'allAllies'
  | 'allEnemies'
  | 'randomAlly'
  | 'randomEnemy'
  | 'frontAlly'
  | 'frontEnemy'
  | 'backAlly'
  | 'backEnemy'
  | 'allyAhead';

export type AbilityEffect =
  | { type: 'damage'; amount: number; target: AbilityTarget }
  | { type: 'modifyStats'; health: number; attack: number; target: AbilityTarget }
  | { type: 'spawnUnit'; templateId: string }
  | { type: 'killSpawn'; target: AbilityTarget; templateId: string };

// Types matching the Rust view structs

export interface CardView {
  id: number;
  templateId: string;
  name: string;
  attack: number;
  health: number;
  playCost: number;
  pitchValue: number;
  abilities: Ability[];
}

export interface BoardUnitView {
  id: number;
  templateId: string;
  name: string;
  attack: number;
  health: number;
  playCost: number;
  pitchValue: number;
  abilities: Ability[];
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
  name: string;
  attack: number;
  health: number;
  abilities: Ability[];
}

export type CombatEvent =
  | { type: 'phaseStart'; payload: { phase: string } }
  | { type: 'phaseEnd'; payload: { phase: string } }
  | { type: 'abilityTrigger'; payload: { sourceInstanceId: string; abilityName: string } }
  | { type: 'clash'; payload: { pDmg: number; eDmg: number } }
  | {
      type: 'damageTaken';
      payload: { targetInstanceId: string; team: 'PLAYER' | 'ENEMY'; remainingHp: number };
    }
  | { type: 'unitDeath'; payload: { team: 'PLAYER' | 'ENEMY'; newBoardState: UnitView[] } }
  | { type: 'battleEnd'; payload: { result: 'VICTORY' | 'DEFEAT' | 'DRAW' } }
  | {
      type: 'abilityDamage';
      payload: { sourceInstanceId: string; targetInstanceId: string; damage: number; remainingHp: number };
    }
  | {
      type: 'abilityModifyStats';
      payload: {
        sourceInstanceId: string;
        targetInstanceId: string;
        healthChange: number;
        attackChange: number;
        newAttack: number;
        newHealth: number;
      };
    }
  | {
      type: 'unitSpawn';
      payload: {
        team: string;
        spawnedUnit: UnitView;
        newBoardState: UnitView[];
      };
    };

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

// Unit template for sandbox mode
export interface UnitTemplateView {
  templateId: string;
  name: string;
  attack: number;
  health: number;
  playCost: number;
  pitchValue: number;
  abilities: Ability[];
}

// Sandbox unit for custom battles
export interface SandboxUnit {
  templateId: string;
}
