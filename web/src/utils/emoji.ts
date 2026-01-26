/**
 * Centralized utility for card emojis.
 * This is the single source of truth for all unit card representations in the UI.
 */

const EMOJI_MAP: Record<string, string> = {
  // Goblins
  goblin_scout: '👺',
  goblin_looter: '💰',
  goblin_grunt: '👹',
  nurse_goblin: '🩺',

  // Humans / Soldiers
  militia: '🛡️',
  shield_bearer: '🏰',
  shield_squire: '🛡️',
  battle_hardened: '💪',
  sniper: '🎯',
  archer: '🏹',
  pack_leader: '👑',

  // Orcs
  orc_warrior: '⚔️',
  orc_shaman: '🔮',
  raging_orc: '🤬',

  // Undead
  zombie_soldier: '🧟',
  zombie_captain: '🧟‍♂️',
  zombie_spawn: '👶',
  zombie_breeder: '🧟‍♀️',
  necromancer: '🧙',
  corpse_cart: '⚰️',
  lich: '💀',
  golem: '🗿',

  // Beasts / Monsters
  wolf_rider: '🐺',
  troll_brute: '🧌',
  troll_warrior: '🪓',
  ogre_mauler: '👊',
  ogre_warrior: '🔨',
  giant_crusher: '🦣',
  dragon_tyrant: '🐉',
  behemoth: '🐘',
  headhunter: '🕵️',
  giant_slayer: '🗡️',
  mana_reaper: '⚖️',
  lone_wolf: '🐕',
};

/**
 * Returns the emoji associated with a card template ID.
 * Returns a question mark emoji if no mapping is found.
 */
export function getCardEmoji(templateId: string): string {
  return EMOJI_MAP[templateId] || '❓';
}
