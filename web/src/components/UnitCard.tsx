import React from 'react';
import type { CardView, BoardUnitView } from '../types';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import { useCustomizationStore } from '../store/customizationStore';

import { useCardTilt } from '../hooks/useCardTilt';
import { SwordIcon, HeartIcon, AbilityIcon } from './Icons';
import { CARD_SIZES, CARD_TEXT, type CardSizeVariant } from '../constants/cardSizes';

/** Derive a visual rarity tier from play_cost + ability count. */
export function getRarityTier(card: CardView | BoardUnitView): 'common' | 'uncommon' | 'rare' | 'legendary' {
  const cost = card.play_cost;
  const abilityCount = ((card as any).shop_abilities?.length ?? 0) +
    ((card as any).battle_abilities?.length ?? 0);
  if (cost >= 5 || (cost >= 4 && abilityCount >= 2)) return 'legendary';
  if (cost >= 4 || (cost >= 3 && abilityCount >= 2)) return 'rare';
  if (cost >= 3 || abilityCount >= 2) return 'uncommon';
  return 'common';
}

/** Border and glow styles per rarity tier. */
export const RARITY_STYLES = {
  common: {
    border: 'border-amber-900/60',
    glow: '',
  },
  uncommon: {
    border: 'border-emerald-700/70',
    glow: '',
  },
  rare: {
    border: 'border-sky-500/70',
    glow: 'card-rare-glow',
  },
  legendary: {
    border: 'border-amber-400/80',
    glow: 'card-legendary-glow',
  },
} as const;

interface UnitCardProps {
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showPitch?: boolean;
  sizeVariant?: CardSizeVariant;
  enableWobble?: boolean;
  enableTilt?: boolean;

  can_afford?: boolean;
  draggable?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function UnitCard({
  card,
  isSelected = false,
  onClick,
  showCost = true,
  showPitch = true,
  sizeVariant = 'standard',
  enableWobble = true,
  enableTilt = true,

  can_afford = true,
  draggable = false,
  onDragOver,
  onDrop,
}: UnitCardProps) {
  const cardStyle = useCustomizationStore((s) => s.selections.cardStyle);
  const { tiltRef } = useCardTilt({
    enabled: enableTilt && !isSelected,
    maxRotation: sizeVariant === 'compact' || sizeVariant === 'battle' ? 8 : 12,
  });

  const artSrc = getCardArtSm(card.id);
  const sizes = CARD_SIZES[sizeVariant];
  const text = CARD_TEXT[sizeVariant];
  const rarity = getRarityTier(card);
  const rarityStyle = RARITY_STYLES[rarity];

  return (
    <div
      ref={enableTilt ? tiltRef : undefined}
      onClick={() => {
        onClick?.();
      }}
      draggable={draggable}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        unit-card card relative ${sizes.tw} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} select-none rounded-lg border-2 transition-all duration-200 overflow-hidden
        bg-black ${rarityStyle.border} ${rarityStyle.glow}
        ${isSelected ? 'card-selected ring-2 ring-yellow-400' : ''}
        ${enableWobble && !isSelected ? 'wobble-card' : ''}
        ${enableTilt && !isSelected ? 'card-tilt' : ''}
      `}
      style={
        enableWobble && !isSelected
          ? { animationDelay: `${(card.id * 200) % 3500}ms` }
          : undefined
      }
    >
        {artSrc ? (
          <>
            {/* Full-bleed card art — brightness boost for vibrancy */}
            <img
              src={artSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-[center_30%]"
              style={{ filter: 'brightness(1.15) saturate(1.1)' }}
              loading="lazy"
            />
            {/* Gradient overlay — lighter than before for brighter art */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
          </>
        ) : (
          <>
            {/* Emoji fallback when no card art available */}
            <div className="absolute inset-0 flex items-center justify-center text-3xl lg:text-4xl bg-card-bg">
              {getCardEmoji(card.id)}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </>
        )}

        {/* Card name - overlaid at top, above all overlays */}
        <div
          className={`relative z-[11] ${text.title} font-bold text-center truncate text-white pt-0.5 lg:pt-0.5 px-0.5`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {card.name}
        </div>

        {/* Ability badge */}
        {(() => {
          const abils = [...((card as any).shop_abilities ?? []), ...((card as any).battle_abilities ?? [])];
          return abils.length > 0 ? (
            <div className={`absolute bottom-5 right-0.5 lg:bottom-7 lg:right-1 z-[3] bg-yellow-500 rounded-full ${text.abilityBadge} flex items-center justify-center text-[0.5rem] lg:text-[0.55rem] font-bold border border-yellow-300 shadow`}>
              {abils.length > 1 ? (
                abils.length
              ) : (
                <AbilityIcon className="w-2 h-2 lg:w-2.5 lg:h-2.5" />
              )}
            </div>
          ) : null;
        })()}

        {/* Stats row - pinned to bottom */}
        <div
          className="card-stats-row absolute bottom-0 left-0 right-0 z-[2] flex justify-between items-center px-1 lg:px-2 pb-0.5 lg:pb-1"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
        >
          <div className={`flex items-center ${text.stat} font-stat`}>
            <SwordIcon className={`${text.statIcon} text-red-400 mr-0.5`} />
            <span className="font-bold text-white">{card.attack}</span>
          </div>
          <div className={`flex items-center ${text.stat} font-stat`}>
            <HeartIcon className={`${text.statIcon} text-green-400`} />
            <span className="font-bold text-white ml-0.5">{card.health}</span>
          </div>
        </div>

        {/* Cost badge (top left) — blue mana bolt */}
        {showCost && (
          <div
            className={`card-cost-badge absolute -top-0.5 -left-0.5 lg:-top-1 lg:-left-1 z-10 ${text.badge} rounded-lg flex items-center justify-center font-stat font-bold ${
              can_afford ? 'cost-badge' : 'cost-badge-dim'
            }`}
          >
            {card.play_cost}
          </div>
        )}

        {/* Pitch value badge (top right) — gold flame */}
        {showPitch && (
          <div
            className={`card-pitch-badge absolute -top-0.5 -right-0.5 lg:-top-1 lg:-right-1 z-10 ${text.badge} pitch-badge rounded-lg flex items-center justify-center font-stat font-bold`}
          >
            {card.pitch_value}
          </div>
        )}

        {/* Card style frame overlay - behind stats/badges but above card art */}
        {cardStyle && (
          <img
            src={cardStyle.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full pointer-events-none z-[1] rounded-lg"
            style={{ objectFit: 'fill' }}
          />
        )}
    </div>
  );
}

// Empty slot component
interface EmptySlotProps {
  onClick?: () => void;
  isTarget?: boolean;
  isHovered?: boolean;
  label?: string;
  sizeVariant?: CardSizeVariant;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function EmptySlot({
  onClick,
  isTarget = false,
  isHovered = false,
  label,
  sizeVariant = 'standard',
  onDragOver,
  onDrop,
}: EmptySlotProps) {
  const sizes = CARD_SIZES[sizeVariant];

  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        empty-slot board-slot-engraved relative ${sizes.tw} cursor-pointer rounded-lg flex items-center justify-center transition-all duration-200
        ${isHovered ? 'slot-drop-target' : isTarget ? 'slot-available' : ''}
      `}
    >
      {label && (
        <span className="text-warm-600/60 text-[0.5rem] lg:text-xs font-heading uppercase tracking-widest">
          {label}
        </span>
      )}
    </div>
  );
}
