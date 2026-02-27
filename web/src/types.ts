// Composable ability building blocks
export type BattleScope =
  | 'SelfUnit'
  | 'Allies'
  | 'Enemies'
  | 'All'
  | 'AlliesOther'
  | 'TriggerSource'
  | 'Aggressor';
export type ShopScope = 'SelfUnit' | 'Allies' | 'All' | 'AlliesOther' | 'TriggerSource';
export type StatType = 'Health' | 'Attack' | 'Mana';
export type SortOrder = 'Ascending' | 'Descending';
export type CompareOp =
  | 'GreaterThan'
  | 'LessThan'
  | 'Equal'
  | 'GreaterThanOrEqual'
  | 'LessThanOrEqual';
export type Status = 'Shield' | 'Poison' | 'Guard';
export type StatusMask = number[];

// Battle condition types
export type BattleMatcher =
  | {
      type: 'StatValueCompare';
      data: { scope: BattleScope; stat: StatType; op: CompareOp; value: number };
    }
  | {
      type: 'StatStatCompare';
      data: {
        source_stat: StatType;
        op: CompareOp;
        target_scope: BattleScope;
        target_stat: StatType;
      };
    }
  | { type: 'UnitCount'; data: { scope: BattleScope; op: CompareOp; value: number } }
  | { type: 'IsPosition'; data: { scope: BattleScope; index: number } };

export type BattleCondition =
  | { type: 'Is'; data: BattleMatcher }
  | { type: 'AnyOf'; data: BattleMatcher[] };

// Shop condition types
export type ShopMatcher =
  | {
      type: 'StatValueCompare';
      data: { scope: ShopScope; stat: StatType; op: CompareOp; value: number };
    }
  | { type: 'UnitCount'; data: { scope: ShopScope; op: CompareOp; value: number } }
  | { type: 'IsPosition'; data: { scope: ShopScope; index: number } };

export type ShopCondition =
  | { type: 'Is'; data: ShopMatcher }
  | { type: 'AnyOf'; data: ShopMatcher[] };

export type BattleTrigger =
  | 'OnStart'
  | 'OnFaint'
  | 'OnAllyFaint'
  | 'OnHurt'
  | 'OnSpawn'
  | 'OnAllySpawn'
  | 'OnEnemySpawn'
  | 'BeforeUnitAttack'
  | 'AfterUnitAttack'
  | 'BeforeAnyAttack'
  | 'AfterAnyAttack';

export type ShopTrigger = 'OnBuy' | 'OnSell' | 'OnShopStart';

export type BattleTarget =
  | { type: 'Position'; data: { scope: BattleScope; index: number } }
  | { type: 'Adjacent'; data: { scope: BattleScope } }
  | { type: 'Random'; data: { scope: BattleScope; count: number } }
  | {
      type: 'Standard';
      data: { scope: BattleScope; stat: StatType; order: SortOrder; count: number };
    }
  | { type: 'All'; data: { scope: BattleScope } };

export type ShopTarget =
  | { type: 'Position'; data: { scope: ShopScope; index: number } }
  | { type: 'Random'; data: { scope: ShopScope; count: number } }
  | {
      type: 'Standard';
      data: { scope: ShopScope; stat: StatType; order: SortOrder; count: number };
    }
  | { type: 'All'; data: { scope: ShopScope } };

export type BattleEffect =
  | { type: 'Damage'; amount: number; target: BattleTarget }
  | { type: 'ModifyStats'; health: number; attack: number; target: BattleTarget }
  | { type: 'ModifyStatsPermanent'; health: number; attack: number; target: BattleTarget }
  | { type: 'SpawnUnit'; card_id: number }
  | { type: 'Destroy'; target: BattleTarget }
  | { type: 'GainMana'; amount: number }
  | { type: 'GrantStatusThisBattle'; status: Status; target: BattleTarget }
  | { type: 'GrantStatusPermanent'; status: Status; target: BattleTarget }
  | { type: 'RemoveStatusPermanent'; status: Status; target: BattleTarget };

export type ShopEffect =
  | { type: 'ModifyStatsPermanent'; health: number; attack: number; target: ShopTarget }
  | { type: 'SpawnUnit'; card_id: number }
  | { type: 'Destroy'; target: ShopTarget }
  | { type: 'GainMana'; amount: number }
  | { type: 'GrantStatusPermanent'; status: Status; target: ShopTarget }
  | { type: 'RemoveStatusPermanent'; status: Status; target: ShopTarget };

export interface BattleAbility {
  trigger: BattleTrigger;
  effect: BattleEffect;
  name: string;
  description: string;
  conditions: BattleCondition[];
  max_triggers?: number;
}

export interface ShopAbility {
  trigger: ShopTrigger;
  effect: ShopEffect;
  name: string;
  description: string;
  conditions: ShopCondition[];
  max_triggers?: number;
}

export type AnyAbility = BattleAbility | ShopAbility;

// Types matching the Rust view structs

export interface CardView {
  id: number;
  name: string;
  attack: number;
  health: number;
  play_cost: number;
  pitch_value: number;
  base_statuses: StatusMask;
  shop_abilities: ShopAbility[];
  battle_abilities: BattleAbility[];
}

export interface BoardUnitView {
  id: number;
  name: string;
  attack: number;
  health: number;
  play_cost: number;
  pitch_value: number;
  base_statuses: StatusMask;
  perm_statuses: StatusMask;
  active_statuses: StatusMask;
  shop_abilities: ShopAbility[];
  battle_abilities: BattleAbility[];
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
  statuses: StatusMask;
  battle_abilities: BattleAbility[];
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
      payload: {
        source_instance_id: number;
        target_instance_id: number;
        damage: number;
        remaining_hp: number;
      };
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
      type: 'AbilityModifyStatsPermanent';
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
      type: 'AbilityGainMana';
      payload: {
        source_instance_id: number;
        team: Team;
        amount: number;
      };
    }
  | {
      type: 'StatusApplied';
      payload: {
        target_instance_id: number;
        status: Status;
        permanent: boolean;
      };
    }
  | {
      type: 'StatusRemoved';
      payload: {
        target_instance_id: number;
        status: Status;
        permanent: boolean;
      };
    }
  | {
      type: 'StatusConsumed';
      payload: {
        target_instance_id: number;
        status: Status;
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
  round: number; // The round this battle was for
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
