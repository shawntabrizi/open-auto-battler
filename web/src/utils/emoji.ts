/**
 * Centralized utility for card emojis.
 * This is the single source of truth for all unit card representations in the UI.
 * Emoji data is loaded from cards.json and indexed by card ID.
 */

// Dynamic emoji map built from card data, indexed by card ID
let emojiMap: Record<number, string> = {};

/**
 * Initialize the emoji map from card data.
 * Call this once when cards are loaded (from blockchain or JSON fallback).
 */
export function initEmojiMap(cards: Array<{ id: number; emoji: string }>) {
  emojiMap = {};
  for (const card of cards) {
    emojiMap[card.id] = card.emoji;
  }
}

/**
 * Returns the emoji associated with a card ID.
 * Returns a question mark emoji if no mapping is found.
 */
export function getCardEmoji(cardId: number): string {
  return emojiMap[cardId] || '❓';
}
