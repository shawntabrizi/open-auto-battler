/**
 * Card art path utility.
 * Mirrors the emoji.ts pattern for card art image paths.
 * Cards without art (IDs 27-32) return null → emoji fallback.
 */

// Set of card IDs that have art available
let artSet: Set<number> = new Set();

/**
 * Initialize the card art set from known card IDs.
 * Call once when cards are loaded (alongside initEmojiMap).
 */
export function initCardArt(cardIds: number[]) {
  artSet = new Set(cardIds);
}

/** Returns the small (256x340) card art path, or null if no art exists. */
export function getCardArtSm(cardId: number): string | null {
  if (!artSet.has(cardId)) return null;
  return `./images/cards/sm/${cardId}.webp`;
}

/** Returns the medium (464x616) card art path, or null if no art exists. */
export function getCardArtMd(cardId: number): string | null {
  if (!artSet.has(cardId)) return null;
  return `./images/cards/md/${cardId}.webp`;
}

/** Returns true if card art exists for this ID. */
export function hasCardArt(cardId: number): boolean {
  return artSet.has(cardId);
}
