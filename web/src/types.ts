// Composable ability building blocks
export type TargetScope = 'selfUnit' | 'allies' | 'enemies' | 'all' | 'alliesOther' | 'triggerSource' | 'aggressor';
export type StatType = 'health' | 'attack' | 'mana';
export type SortOrder = 'ascending' | 'descending';
export type CompareOp = 'greaterThan' | 'lessThan' | 'equal' | 'greaterThanOrEqual' | 'lessThanOrEqual';

// Ability condition types
export type AbilityCondition =
  | { type: 'none' }
  | { type: 'statValueCompare'; data: { scope: TargetScope; stat: StatType; op: CompareOp; value: number } }
  | { type: 'statStatCompare'; data: { sourceStat: StatType; op: CompareOp; targetScope: TargetScope; targetStat: StatType } }
  | { type: 'unitCount'; data: { scope: TargetScope; op: CompareOp; value: number } }
  | { type: 'isPosition'; data: { scope: TargetScope; index: number } }
  | { type: 'and'; data: { left: AbilityCondition; right: AbilityCondition } }
  | { type: 'or'; data: { left: AbilityCondition; right: AbilityCondition } }
  | { type: 'not'; data: { inner: AbilityCondition } };

// Ability types
export interface Ability {
  trigger: AbilityTrigger;
  effect: AbilityEffect;
  name: string;
  description: string;
  condition?: AbilityCondition;
  maxTriggers?: number;
}

export type AbilityTrigger = 'onStart' | 'onFaint' | 'onAllyFaint' | 'onHurt' | 'onSpawn' | 'onAllySpawn' | 'onEnemySpawn' | 'beforeUnitAttack' | 'afterUnitAttack' | 'beforeAnyAttack' | 'afterAnyAttack';

export type AbilityTarget =
  | { type: 'position'; data: { scope: TargetScope; index: number } }
  | { type: 'adjacent'; data: { scope: TargetScope } }
  | { type: 'random'; data: { scope: TargetScope; count: number } }
  | { type: 'standard'; data: { scope: TargetScope; stat: StatType; order: SortOrder; count: number } }
  | { type: 'all'; data: { scope: TargetScope } };

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
  isToken: boolean;
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
  isToken: boolean;
}

export interface GameView {
  hand: (CardView | null)[];
  board: (BoardUnitView | null)[];
  mana: number;
  manaLimit: number;
  round: number;
  lives: number;
  wins: number;
  phase: 'shop' | 'battle' | 'victory' | 'defeat';
  bag: CardView[];
  bagCount: number;
  canAfford: boolean[];
}

//--- NEW BATTLE REPLAY TYPES ---

export interface UnitView {
  instanceId: number;
  templateId: string;
  name: string;
  attack: number;
  health: number;
  abilities: Ability[];
  isToken: boolean;
}

export type Team = 'PLAYER' | 'ENEMY';
export type BattleResult = 'VICTORY' | 'DEFEAT' | 'DRAW';
export type BattlePhase = 'START' | 'BEFORE_ATTACK' | 'ATTACK' | 'AFTER_ATTACK' | 'END';

export type LimitReason =
  | { type: 'ROUND_LIMIT'; payload: { current: number; max: number } }
  | { type: 'RECURSION_LIMIT'; payload: { current: number; max: number } }
  | { type: 'SPAWN_LIMIT'; payload: { current: number; max: number } }
  | { type: 'TRIGGER_LIMIT'; payload: { current: number; max: number } }
  | { type: 'TRIGGER_DEPTH_LIMIT'; payload: { current: number; max: number } };

export type CombatEvent =
  | { type: 'phaseStart'; payload: { phase: BattlePhase } }
  | { type: 'phaseEnd'; payload: { phase: BattlePhase } }
  | { type: 'abilityTrigger'; payload: { sourceInstanceId: number; abilityName: string } }
  | { type: 'clash'; payload: { pDmg: number; eDmg: number } }
  | {
      type: 'damageTaken';
      payload: { targetInstanceId: number; team: Team; remainingHp: number };
    }
  | { type: 'unitDeath'; payload: { team: Team; newBoardState: UnitView[] } }
  | { type: 'battleEnd'; payload: { result: BattleResult } }
  | {
      type: 'abilityDamage';
      payload: { sourceInstanceId: number; targetInstanceId: number; damage: number; remainingHp: number };
    }
  | {
      type: 'abilityModifyStats';
      payload: {
        sourceInstanceId: number;
        targetInstanceId: number;
        healthChange: number;
        attackChange: number;
        newAttack: number;
        newHealth: number;
      };
    }
  | {
      type: 'unitSpawn';
      payload: {
        team: Team;
        spawnedUnit: UnitView;
        newBoardState: UnitView[];
      };
    }
  | {
      type: 'limitExceeded';
      payload: {
        losingTeam: Team | null;
        reason: LimitReason;
      };
    };

export interface BattleOutput {
  events: CombatEvent[];
  initialPlayerUnits: UnitView[];
  initialEnemyUnits: UnitView[];
}

// Selection state for UI
export type SelectionType = 'hand' | 'board' | 'bag';

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
  isToken: boolean;
}

// Sandbox unit for custom battles
export interface SandboxUnit {
  templateId: string;
}