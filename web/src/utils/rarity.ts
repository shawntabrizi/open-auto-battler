/** Rarity weight → display label and color classes. */

export interface RarityInfo {
  label: string;
  color: string; // Tailwind text color
  bgColor: string; // Tailwind bg + border for badges
}

const RARITY_TABLE: { max: number; info: RarityInfo }[] = [
  {
    max: 0,
    info: { label: 'Token', color: 'text-base-500', bgColor: 'bg-base-700/30 border-base-600/40' },
  },
  {
    max: 1,
    info: { label: 'Mythic', color: 'text-accent', bgColor: 'bg-accent/15 border-accent/40' },
  },
  {
    max: 2,
    info: {
      label: 'Legendary',
      color: 'text-card-burn',
      bgColor: 'bg-card-burn/15 border-card-burn/40',
    },
  },
  {
    max: 4,
    info: {
      label: 'Epic',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/15 border-purple-400/40',
    },
  },
  { max: 6, info: { label: 'Rare', color: 'text-mana', bgColor: 'bg-mana/15 border-mana/40' } },
  {
    max: 8,
    info: {
      label: 'Uncommon',
      color: 'text-positive',
      bgColor: 'bg-positive/15 border-positive/40',
    },
  },
];

const COMMON_INFO: RarityInfo = {
  label: 'Common',
  color: 'text-base-300',
  bgColor: 'bg-base-700/30 border-base-500/40',
};

export function getRarityInfo(rarityWeight: number): RarityInfo {
  for (const entry of RARITY_TABLE) {
    if (rarityWeight <= entry.max) return entry.info;
  }
  return COMMON_INFO;
}
