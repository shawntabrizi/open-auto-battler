import type {
  AnyAbility,
  BattleAbility,
  BattleCondition,
  BattleEffect,
  BattleMatcher,
  BattleScope,
  BattleTarget,
  CompareOp,
  ShopAbility,
  ShopCondition,
  ShopEffect,
  ShopMatcher,
  ShopScope,
  ShopTarget,
} from '../types';

function formatCompareOp(op: CompareOp): string {
  switch (op) {
    case 'GreaterThan':
      return '>';
    case 'LessThan':
      return '<';
    case 'Equal':
      return '=';
    case 'GreaterThanOrEqual':
      return '>=';
    case 'LessThanOrEqual':
      return '<=';
    default:
      return op;
  }
}

function describeScope(scope: BattleScope | ShopScope): string {
  switch (scope) {
    case 'SelfUnit':
      return 'this unit';
    case 'Allies':
      return 'all allies';
    case 'Enemies':
      return 'all enemies';
    case 'All':
      return 'all units';
    case 'AlliesOther':
      return 'all other allies';
    case 'TriggerSource':
      return 'the trigger target';
    case 'Aggressor':
      return 'the attacker';
    default:
      return scope;
  }
}

function describeScopeSingular(scope: BattleScope | ShopScope): string {
  switch (scope) {
    case 'SelfUnit':
      return 'this unit';
    case 'Allies':
      return 'ally';
    case 'Enemies':
      return 'enemy';
    case 'All':
      return 'unit';
    case 'AlliesOther':
      return 'other ally';
    case 'TriggerSource':
      return 'trigger target';
    case 'Aggressor':
      return 'attacker';
    default:
      return scope;
  }
}

export function formatAbilityTrigger(trigger: string): string {
  switch (trigger) {
    case 'OnStart':
      return 'Battle Start';
    case 'OnFaint':
      return 'When Dies';
    case 'OnAllyFaint':
      return 'When Ally Dies';
    case 'OnHurt':
      return 'When Hurt';
    case 'OnBuy':
      return 'On Buy';
    case 'OnSell':
      return 'On Sell';
    case 'OnShopStart':
      return 'Shop Start';
    case 'AfterLoss':
      return 'After Loss';
    case 'AfterWin':
      return 'After Win';
    case 'AfterDraw':
      return 'After Draw';
    case 'OnSpawn':
      return 'On Spawn';
    case 'OnAllySpawn':
      return 'Ally Spawned';
    case 'OnEnemySpawn':
      return 'Enemy Spawned';
    case 'BeforeUnitAttack':
      return 'Before Attacking';
    case 'AfterUnitAttack':
      return 'After Attacking';
    case 'BeforeAnyAttack':
      return 'Before Any Attack';
    case 'AfterAnyAttack':
      return 'After Any Attack';
    default:
      return trigger;
  }
}

export function formatAbilityTarget(target: BattleTarget | ShopTarget): string {
  const data = (target as any).data ?? target;

  switch (target.type) {
    case 'All':
      return describeScope(data.scope);
    case 'Position': {
      const scope = data.scope;
      const index = data.index;
      if (scope === 'SelfUnit') {
        if (index === -1) return 'the unit ahead';
        if (index === 1) return 'the unit behind';
        return 'this unit';
      }
      const slot = index === 0 ? 'front' : index === -1 ? 'back' : `slot ${index + 1}`;
      return `the ${slot} ${describeScopeSingular(scope)}`;
    }
    case 'Random':
      return `${data.count === 1 ? 'a random' : `${data.count} random`} ${describeScopeSingular(data.scope)}`;
    case 'Standard': {
      const order = data.order === 'Ascending' ? 'lowest' : 'highest';
      const count = data.count === 1 ? 'the' : `the ${data.count}`;
      return `${count} ${order} ${String(data.stat).toLowerCase()} ${describeScopeSingular(data.scope)}`;
    }
    case 'Adjacent':
      return `units adjacent to ${describeScope(data.scope)}`;
    default:
      return 'unknown target';
  }
}

export function formatAbilityEffect(effect: BattleEffect | ShopEffect): string {
  switch (effect.type) {
    case 'Damage':
      return `Deal ${effect.amount} damage to ${formatAbilityTarget(effect.target)}`;
    case 'ModifyStats':
      return `Give ${effect.attack >= 0 ? '+' : ''}${effect.attack}/${effect.health >= 0 ? '+' : ''}${effect.health} to ${formatAbilityTarget(effect.target)}`;
    case 'ModifyStatsPermanent':
      return `Give ${effect.attack >= 0 ? '+' : ''}${effect.attack}/${effect.health >= 0 ? '+' : ''}${effect.health} permanently to ${formatAbilityTarget(effect.target)}`;
    case 'SpawnUnit':
      return `Spawn card #${effect.card_id}`;
    case 'Destroy':
      return `Destroy ${formatAbilityTarget(effect.target)}`;
    case 'GainMana':
      return `Gain ${effect.amount} mana`;
    case 'GrantStatusThisBattle':
      return `Give ${effect.status} this battle to ${formatAbilityTarget(effect.target)}`;
    case 'GrantStatusPermanent':
      return `Give ${effect.status} permanently to ${formatAbilityTarget(effect.target)}`;
    case 'RemoveStatusPermanent':
      return `Remove ${effect.status} permanently from ${formatAbilityTarget(effect.target)}`;
    default:
      return 'Unknown effect';
  }
}

function formatBattleMatcher(matcher: BattleMatcher): string {
  switch (matcher.type) {
    case 'StatValueCompare':
      return `any ${describeScopeSingular(matcher.data.scope)} has ${matcher.data.stat} ${formatCompareOp(matcher.data.op)} ${matcher.data.value}`;
    case 'TargetStatValueCompare':
      return `${formatAbilityTarget(matcher.data.target)} has ${matcher.data.stat} ${formatCompareOp(matcher.data.op)} ${matcher.data.value}`;
    case 'StatStatCompare':
      return `this unit's ${matcher.data.source_stat} ${formatCompareOp(matcher.data.op)} any ${describeScopeSingular(matcher.data.target_scope)}'s ${matcher.data.target_stat}`;
    case 'UnitCount':
      return `${describeScope(matcher.data.scope)} count ${formatCompareOp(matcher.data.op)} ${matcher.data.value}`;
    case 'IsPosition':
      return `this unit is at position ${matcher.data.index} within ${describeScope(matcher.data.scope)}`;
    default:
      return 'Unknown battle matcher';
  }
}

function formatShopMatcher(matcher: ShopMatcher): string {
  switch (matcher.type) {
    case 'StatValueCompare':
      return `any ${describeScopeSingular(matcher.data.scope)} has ${matcher.data.stat} ${formatCompareOp(matcher.data.op)} ${matcher.data.value}`;
    case 'UnitCount':
      return `${describeScope(matcher.data.scope)} count ${formatCompareOp(matcher.data.op)} ${matcher.data.value}`;
    case 'IsPosition':
      return `this unit is at position ${matcher.data.index} within ${describeScope(matcher.data.scope)}`;
    default:
      return 'Unknown shop matcher';
  }
}

function formatBattleCondition(condition: BattleCondition): string {
  if (condition.type === 'Is') {
    return formatBattleMatcher(condition.data);
  }
  return condition.data.map(formatBattleMatcher).join(' or ');
}

function formatShopCondition(condition: ShopCondition): string {
  if (condition.type === 'Is') {
    return formatShopMatcher(condition.data);
  }
  return condition.data.map(formatShopMatcher).join(' or ');
}

export function formatAbilitySummary(ability: AnyAbility): string {
  const effect = formatAbilityEffect(ability.effect as BattleEffect | ShopEffect);
  const conditionText =
    ability.conditions.length === 0
      ? ''
      : ` if ${
          'trigger' in ability &&
          (ability.trigger === 'OnBuy' ||
            ability.trigger === 'OnSell' ||
            ability.trigger === 'OnShopStart' ||
            ability.trigger === 'AfterLoss' ||
            ability.trigger === 'AfterWin' ||
            ability.trigger === 'AfterDraw')
            ? (ability.conditions as ShopCondition[]).map(formatShopCondition).join(' and ')
            : (ability.conditions as BattleCondition[]).map(formatBattleCondition).join(' and ')
        }`;
  const triggerLimit =
    ability.max_triggers == null
      ? ''
      : ` Max ${ability.max_triggers} trigger${ability.max_triggers === 1 ? '' : 's'}.`;
  return `${effect}${conditionText}.${triggerLimit}`.trim();
}

export function formatNamedAbility(ability: BattleAbility | ShopAbility): string {
  return formatAbilitySummary(ability);
}
