// Composable ability building blocks
export type TargetScope = 'SelfUnit' | 'Allies' | 'Enemies' | 'All' | 'AlliesOther' | 'TriggerSource' | 'Aggressor';
export type StatType = 'Health' | 'Attack' | 'Mana';
export type SortOrder = 'Ascending' | 'Descending';
export type CompareOp = 'GreaterThan' | 'LessThan' | 'Equal' | 'GreaterThanOrEqual' | 'LessThanOrEqual';

// Ability condition types
export type Matcher =
  | { type: 'StatValueCompare'; data: { scope: TargetScope; stat: StatType; op: CompareOp; value: number } }
  | { type: 'StatStatCompare'; data: { source_stat: StatType; op: CompareOp; target_scope: TargetScope; target_stat: StatType } }
  | { type: 'UnitCount'; data: { scope: TargetScope; op: CompareOp; value: number } }
  | { type: 'IsPosition'; data: { scope: TargetScope; index: number } };

export type Condition =
  | { type: 'Is'; data: Matcher }
  | { type: 'AnyOf'; data: Matcher[] };

// Ability types
export interface Ability {
  trigger: AbilityTrigger;
  effect: AbilityEffect;
  name: string;
  description: string;
  conditions: Condition[];
  max_triggers?: number;
}

export type AbilityTrigger = 'OnStart' | 'OnFaint' | 'OnAllyFaint' | 'OnHurt' | 'OnSpawn' | 'OnAllySpawn' | 'OnEnemySpawn' | 'BeforeUnitAttack' | 'AfterUnitAttack' | 'BeforeAnyAttack' | 'AfterAnyAttack';

export type AbilityTarget =
  | { type: 'Position'; data: { scope: TargetScope; index: number } }
  | { type: 'Adjacent'; data: { scope: TargetScope } }
  | { type: 'Random'; data: { scope: TargetScope; count: number } }
  | { type: 'Standard'; data: { scope: TargetScope; stat: StatType; order: SortOrder; count: number } }
  | { type: 'All'; data: { scope: TargetScope } };

export type AbilityEffect =
  | { type: 'Damage'; amount: number; target: AbilityTarget }
  | { type: 'ModifyStats'; health: number; attack: number; target: AbilityTarget }
  | { type: 'SpawnUnit'; card_id: number }
  | { type: 'Destroy'; target: AbilityTarget };

// Types matching the Rust view structs

export interface CardView {
  id: number;
  name: string;
  attack: number;
  health: number;
  play_cost: number;
  pitch_value: number;
  abilities: Ability[];
}

export interface BoardUnitView {
  id: number;
  name: string;
  attack: number;
  health: number;
  play_cost: number;
  pitch_value: number;
  abilities: Ability[];
}

export interface GameView {
  hand: (CardView | null)[];
  board: (BoardUnitView | null)[];
  mana: number;
  mana_limit: number;
  round: number;
  lives: number;
  wins: number;
  phase: string; // Changed from enum to string to match Rust core/src/view.rs
  // Note: bag is removed from hot path - use fetchBag() for full bag data
  bag_count: number;
  can_afford: boolean[];
  can_undo: boolean;
}

//--- NEW BATTLE REPLAY TYPES ---

export interface UnitView {
  instance_id: number;
  card_id: number;
  name: string;
  attack: number;
  health: number;
  abilities: Ability[];
}

export type Team = 'Player' | 'Enemy';
export type BattleResult = 'Victory' | 'Defeat' | 'Draw';
export type BattlePhase = 'Start' | 'BeforeAttack' | 'Attack' | 'AfterAttack' | 'End';

export type LimitReason =
  | { type: 'RoundLimit'; payload: { current: number; max: number } }
  | { type: 'RecursionLimit'; payload: { current: number; max: number } }
  | { type: 'SpawnLimit'; payload: { current: number; max: number } }
  | { type: 'TriggerLimit'; payload: { current: number; max: number } }
  | { type: 'TriggerDepthLimit'; payload: { current: number; max: number } };

export type CombatEvent =
  | { type: 'PhaseStart'; payload: { phase: BattlePhase } }
  | { type: 'PhaseEnd'; payload: { phase: BattlePhase } }
  | { type: 'AbilityTrigger'; payload: { source_instance_id: number; ability_name: string } }
  | { type: 'Clash'; payload: { p_dmg: number; e_dmg: number } }
  | {
      type: 'DamageTaken';
      payload: { target_instance_id: number; team: Team; remaining_hp: number };
    }
  | { type: 'UnitDeath'; payload: { team: Team; new_board_state: UnitView[] } }
  | { type: 'BattleEnd'; payload: { result: BattleResult } }
  | {
      type: 'AbilityDamage';
      payload: { source_instance_id: number; target_instance_id: number; damage: number; remaining_hp: number };
    }
  | {
      type: 'AbilityModifyStats';
      payload: {
        source_instance_id: number;
        target_instance_id: number;
        health_change: number;
        attack_change: number;
        new_attack: number;
        new_health: number;
      };
    }
  | {
      type: 'UnitSpawn';
      payload: {
        team: Team;
        spawned_unit: UnitView;
        new_board_state: UnitView[];
      };
    }
  | {
      type: 'LimitExceeded';
      payload: {
        losing_team: Team | null;
        reason: LimitReason;
      };
    };

export interface BattleOutput {
  events: CombatEvent[];
  initial_player_units: UnitView[];
  initial_enemy_units: UnitView[];
  round: number;  // The round this battle was for
}

// Selection state for UI
export type SelectionType = 'hand' | 'board' | 'bag';

export interface Selection {
  type: SelectionType;
  index: number;
}

// Sandbox unit for custom battles
export interface SandboxUnit {
  card_id: number;
}