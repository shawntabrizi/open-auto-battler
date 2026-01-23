// Ability condition types
export type AbilityCondition =
  | { type: 'none' }
  // Target stat checks
  | { type: 'targetHealthLessThanOrEqual'; value: number }
  | { type: 'targetHealthGreaterThan'; value: number }
  | { type: 'targetAttackLessThanOrEqual'; value: number }
  | { type: 'targetAttackGreaterThan'; value: number }
  // Source stat checks
  | { type: 'sourceHealthLessThanOrEqual'; value: number }
  | { type: 'sourceHealthGreaterThan'; value: number }
  | { type: 'sourceAttackLessThanOrEqual'; value: number }
  | { type: 'sourceAttackGreaterThan'; value: number }
  // Comparative checks
  | { type: 'sourceAttackGreaterThanTarget' }
  | { type: 'sourceHealthLessThanTarget' }
  | { type: 'sourceHealthGreaterThanTarget' }
  | { type: 'sourceAttackLessThanTarget' }
  // Board state checks
  | { type: 'allyCountAtLeast'; count: number }
  | { type: 'allyCountAtMost'; count: number }
  | { type: 'sourceIsFront' }
  | { type: 'sourceIsBack' }
  // Logic gates
  | { type: 'and'; left: AbilityCondition; right: AbilityCondition }
  | { type: 'or'; left: AbilityCondition; right: AbilityCondition }
  | { type: 'not'; inner: AbilityCondition };

// Ability types
export interface Ability {
  trigger: AbilityTrigger;
  effect: AbilityEffect;
  name: string;
  description: string;
  condition?: AbilityCondition;
}

export type AbilityTrigger = 'onStart' | 'onFaint' | 'onAllyFaint' | 'onDamageTaken' | 'onSpawn' | 'beforeUnitAttack' | 'afterUnitAttack' | 'beforeAnyAttack' | 'afterAnyAttack';

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
  | 'allyAhead'
  | 'lowestHealthEnemy'
  | 'highestAttackEnemy'
  | 'highestHealthEnemy'
  | 'lowestAttackEnemy'
  | 'highestManaEnemy'
  | 'lowestManaEnemy';

export type AbilityEffect =
  | { type: 'damage'; amount: number; target: AbilityTarget }
  | { type: 'modifyStats'; health: number; attack: number; target: AbilityTarget }
  | { type: 'spawnUnit'; templateId: string }
  | { type: 'destroy'; target: AbilityTarget };

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
