/**
 * Card size tokens — single source of truth for all card dimensions.
 * Mobile values apply below 1024px; desktop values apply at lg: (1024px+).
 */

export const CARD_SIZES = {
  /** Hand cards, board cards — primary game view */
  standard: {
    tw: 'w-[4.5rem] h-24 lg:w-32 lg:h-44',
    widthTw: 'w-[4.5rem] lg:w-32',
  },
  /** Sandbox, collection grids */
  compact: {
    tw: 'w-20 h-[6.5rem] lg:w-28 lg:h-40',
    widthTw: 'w-20 lg:w-28',
  },
  /** Battle arena — 10 cards across must fit viewport */
  battle: {
    tw: 'w-[4.5rem] h-24 lg:w-32 lg:h-44',
    widthTw: 'w-[4.5rem] lg:w-32',
  },
} as const;

export const CARD_TEXT = {
  standard: {
    title: 'text-[0.65rem] lg:text-sm',
    stat: 'text-xs lg:text-base',
    badge: 'w-4 h-4 md:w-5 md:h-5 lg:w-7 lg:h-7 text-[0.5rem] md:text-xs lg:text-sm',
    statIcon: 'w-3 h-3 lg:w-4 lg:h-4',
    abilityBadge: 'w-3.5 h-3.5 lg:w-5 lg:h-5',
  },
  compact: {
    title: 'text-[0.6rem] lg:text-xs',
    stat: 'text-[0.65rem] lg:text-sm',
    badge: 'w-5 h-5 lg:w-6 lg:h-6 text-[0.55rem] lg:text-xs',
    statIcon: 'w-3 h-3 lg:w-3.5 lg:h-3.5',
    abilityBadge: 'w-3.5 h-3.5 lg:w-4 lg:h-4',
  },
  battle: {
    title: 'text-[0.65rem] lg:text-sm',
    stat: 'text-xs lg:text-base',
    badge: 'w-5 h-5 lg:w-7 lg:h-7 text-[0.55rem] lg:text-sm',
    statIcon: 'w-3 h-3 lg:w-4 lg:h-4',
    abilityBadge: 'w-3.5 h-3.5 lg:w-4 lg:h-4',
  },
} as const;

export type CardSizeVariant = keyof typeof CARD_SIZES;
