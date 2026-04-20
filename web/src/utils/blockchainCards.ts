import type { CardView } from '../types';
import { isRecord } from './safe';

type ChainCardRecord = Record<string, unknown>;

function papiEnumStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.type === 'string') return value.type;
  return String(value);
}

function getObjectField(value: unknown, key: string): ChainCardRecord {
  if (!isRecord(value)) return {};
  const field = value[key];
  return isRecord(field) ? field : {};
}

function convertTarget(value: unknown): unknown {
  if (!value) return value;

  const tag = papiEnumStr(value);
  const data = getObjectField(value, 'value');

  if (Object.keys(data).length > 0) {
    const converted: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(data)) {
      if (
        ['scope', 'target_scope', 'stat', 'source_stat', 'target_stat', 'order', 'op'].includes(key)
      ) {
        converted[key] = papiEnumStr(entry);
      } else {
        converted[key] = entry;
      }
    }

    return { type: tag, data: converted };
  }

  return { type: tag };
}

function convertEffect(value: unknown): unknown {
  if (!value) return value;

  const result: Record<string, unknown> = { type: papiEnumStr(value) };
  const data = getObjectField(value, 'value');

  for (const [key, entry] of Object.entries(data)) {
    if (key === 'target') {
      result[key] = convertTarget(entry);
    } else if (key === 'card_id') {
      result[key] = typeof entry === 'number' ? entry : Number(entry);
    } else {
      result[key] = entry;
    }
  }

  return result;
}

function convertMatcher(value: unknown): unknown {
  if (!value) return value;

  const tag = papiEnumStr(value);
  const data = getObjectField(value, 'value');

  if (Object.keys(data).length > 0) {
    const converted: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(data)) {
      if (key === 'target') {
        converted[key] = convertTarget(entry);
      } else if (
        ['scope', 'target_scope', 'stat', 'source_stat', 'target_stat', 'order', 'op'].includes(key)
      ) {
        converted[key] = papiEnumStr(entry);
      } else {
        converted[key] = entry;
      }
    }

    return { type: tag, data: converted };
  }

  return { type: tag };
}

function convertCondition(value: unknown): unknown {
  if (!value) return value;

  const tag = papiEnumStr(value);
  const data = isRecord(value) ? value.value : undefined;
  if (tag === 'Is') {
    return { type: 'Is', data: convertMatcher(data) };
  }
  if (tag === 'AnyOf') {
    return { type: 'AnyOf', data: (Array.isArray(data) ? data : []).map(convertMatcher) };
  }

  return { type: tag };
}

function convertAbility(value: unknown): unknown {
  if (!isRecord(value)) {
    return {
      trigger: 'Unknown',
      effect: undefined,
      conditions: [],
      max_triggers: null,
    };
  }

  return {
    trigger: papiEnumStr(value.trigger),
    effect: convertEffect(value.effect),
    conditions: (Array.isArray(value.conditions) ? value.conditions : []).map(convertCondition),
    max_triggers: value.max_triggers ?? null,
  };
}

export function blockchainCardToCardView(card: unknown): CardView {
  const chainCard = isRecord(card) ? card : {};
  const data = getObjectField(chainCard, 'data');
  const stats = getObjectField(data, 'stats');
  const economy = getObjectField(data, 'economy');
  const metadata = getObjectField(chainCard, 'metadata');
  const id = Number(chainCard.id ?? 0);

  return {
    id,
    name: typeof metadata.name === 'string' ? metadata.name : `Card #${id}`,
    attack: Number(stats.attack ?? 0),
    health: Number(stats.health ?? 0),
    play_cost: Number(economy.play_cost ?? 0),
    burn_value: Number(economy.burn_value ?? 0),
    shop_abilities: (Array.isArray(data.shop_abilities) ? data.shop_abilities : []).map(
      convertAbility
    ) as CardView['shop_abilities'],
    battle_abilities: (Array.isArray(data.battle_abilities) ? data.battle_abilities : []).map(
      convertAbility
    ) as CardView['battle_abilities'],
  };
}
