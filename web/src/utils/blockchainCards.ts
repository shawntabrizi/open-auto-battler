import type { CardView } from '../types';

function papiEnumStr(value: any): string {
  if (typeof value === 'string') return value;
  return value?.type ?? String(value);
}

function convertTarget(value: any): any {
  if (!value) return value;

  const tag = papiEnumStr(value);
  const data = value.value;

  if (data && typeof data === 'object') {
    const converted: any = {};

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

function convertEffect(value: any): any {
  if (!value) return value;

  const result: any = { type: papiEnumStr(value) };
  const data = value.value;

  if (data && typeof data === 'object') {
    for (const [key, entry] of Object.entries(data)) {
      if (key === 'target') {
        result[key] = convertTarget(entry);
      } else if (key === 'card_id') {
        result[key] = typeof entry === 'number' ? entry : Number(entry);
      } else {
        result[key] = entry;
      }
    }
  }

  return result;
}

function convertMatcher(value: any): any {
  if (!value) return value;

  const tag = papiEnumStr(value);
  const data = value.value;

  if (data && typeof data === 'object') {
    const converted: any = {};

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

function convertCondition(value: any): any {
  if (!value) return value;

  const tag = papiEnumStr(value);
  if (tag === 'Is') {
    return { type: 'Is', data: convertMatcher(value.value) };
  }
  if (tag === 'AnyOf') {
    return { type: 'AnyOf', data: (value.value || []).map(convertMatcher) };
  }

  return { type: tag };
}

function convertAbility(value: any): any {
  return {
    trigger: papiEnumStr(value.trigger),
    effect: convertEffect(value.effect),
    conditions: (value.conditions || []).map(convertCondition),
    max_triggers: value.max_triggers ?? null,
  };
}

export function blockchainCardToCardView(card: any): CardView {
  return {
    id: Number(card.id),
    name: card.metadata?.name || `Card #${card.id}`,
    attack: Number(card.data?.stats?.attack ?? 0),
    health: Number(card.data?.stats?.health ?? 0),
    play_cost: Number(card.data?.economy?.play_cost ?? 0),
    burn_value: Number(card.data?.economy?.burn_value ?? 0),
    shop_abilities: (card.data?.shop_abilities || []).map(convertAbility),
    battle_abilities: (card.data?.battle_abilities || []).map(convertAbility),
  };
}
