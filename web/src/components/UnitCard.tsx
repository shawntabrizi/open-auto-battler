import React, { useState } from 'react';
import type { CardView, BoardUnitView } from '../types';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import { useCustomizationStore } from '../store/customizationStore';

import { useCardTilt } from '../hooks/useCardTilt';
import { SwordIcon, HeartIcon } from './Icons';
import { CARD_TEXT, type CardSizeVariant } from '../constants/cardSizes';
import { useAchievementStore } from '../store/achievementStore';
import { useGameStore } from '../store/gameStore';

/** Derive a visual rarity tier from play_cost + ability count. */
export function getRarityTier(
  card: CardView | BoardUnitView
): 'common' | 'uncommon' | 'rare' | 'legendary' {
  const cost = card.play_cost;
  const abilityCount =
    ((card as any).shop_abilities?.length ?? 0) + ((card as any).battle_abilities?.length ?? 0);
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
  showBurn?: boolean;
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
  showBurn = true,
  sizeVariant = 'standard',
  enableWobble = true,
  enableTilt = true,

  can_afford = true,
  draggable = false,
  onDragOver,
  onDrop,
}: UnitCardProps) {
  const cardStyle = useCustomizationStore((s) => s.selections.cardStyle);
  const showCardNames = useGameStore((s) => s.showCardNames);
  const { tiltRef } = useCardTilt({
    enabled: enableTilt,
    maxRotation: sizeVariant === 'compact' || sizeVariant === 'battle' ? 8 : 12,
  });

  const isHolographic = useAchievementStore((s) => s.isHolographic(card.id));
  const artSrc = getCardArtSm(card.id);
  const [artFailed, setArtFailed] = useState(false);
  const showArt = artSrc && !artFailed;
  const text = CARD_TEXT[sizeVariant];
  const rarity = getRarityTier(card);
  const rarityStyle = RARITY_STYLES[rarity];

  const cardEl = (
    <div
      ref={enableTilt ? tiltRef : undefined}
      onClick={() => {
        onClick?.();
      }}
      draggable={draggable}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        unit-card card relative w-full h-full ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} select-none rounded-lg border-2 transition-all duration-200
        bg-black ${rarityStyle.border} ${rarityStyle.glow}
        ${isHolographic ? 'card-holographic' : ''}
        ${isSelected ? 'card-selected ring-2 ring-yellow-400' : ''}
        ${enableWobble ? 'wobble-card' : ''}
        ${enableTilt ? 'card-tilt' : ''}
      `}
      style={
        enableWobble ? { animationDelay: `${(card.id * 200) % 3500}ms` } : undefined
      }
    >
      {/* Inner clip container for art/content — badges sit outside this */}
      <div className="absolute inset-0 overflow-hidden rounded-md">
      {showArt ? (
        <>
          {/* Full-bleed card art — brightness boost for vibrancy */}
          <img
            src={artSrc!}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-[center_30%]"
            style={{ filter: 'brightness(1.15) saturate(1.1)' }}
            loading="lazy"
            onError={() => setArtFailed(true)}
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

      {/* Card name - just above stats */}
      {showCardNames && (
        <div
          className={`absolute bottom-5 lg:bottom-7 left-0 right-0 z-[2] ${text.title} font-bold text-center truncate text-white px-0.5`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {card.name}
        </div>
      )}

      {/* Stats row - pinned to bottom */}
      <div
        className="card-stats-row absolute bottom-0 left-0 right-0 z-[2] flex justify-between items-center px-1 lg:px-2 pb-0.5 lg:pb-1"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
      >
        <div className={`flex items-center ${text.stat} font-stat`}>
          <SwordIcon className={`${text.statIcon} text-red-400 mr-0.5`} />
          <span className="font-bold text-white">{card.attack}</span>
        </div>
        {(() => {
          const abils = [
            ...((card as any).shop_abilities ?? []),
            ...((card as any).battle_abilities ?? []),
          ];
          return abils.length > 0 ? (
            <svg viewBox="0 0 24 24" fill="#eab308" className="w-3 h-3 lg:w-4 lg:h-4 drop-shadow">
              <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
            </svg>
          ) : null;
        })()}
        <div className={`flex items-center ${text.stat} font-stat`}>
          <HeartIcon className={`${text.statIcon} text-green-400`} />
          <span className="font-bold text-white ml-0.5">{card.health}</span>
        </div>
      </div>

      </div>{/* end inner clip container */}

      {/* Cost badge (top left) — blue mana bolt */}
      {showCost && (
        <div
          className={`card-cost-badge absolute -top-0.5 -left-0.5 lg:-top-1 lg:-left-1 z-10 ${text.badge} rounded flex items-center justify-center font-stat font-bold ${
            can_afford ? 'cost-badge' : 'cost-badge-dim'
          }`}
        >
          {card.play_cost}
        </div>
      )}

      {/* Burn value badge (top right) — gold flame */}
      {showBurn && (
        <div
          className={`card-burn-badge absolute -top-0.5 -right-0.5 lg:-top-1 lg:-right-1 z-10 ${text.badge} burn-badge rounded flex items-center justify-center font-stat font-bold`}
        >
          {card.burn_value}
        </div>
      )}

      {/* Holographic shimmer overlay */}
      {isHolographic && <div className="holo-shimmer" />}

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

  if (isHolographic) {
    return <div className="holo-border w-full h-full">{cardEl}</div>;
  }
  return cardEl;
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
  onDragOver,
  onDrop,
}: EmptySlotProps) {
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        empty-slot board-slot-engraved relative w-full h-full cursor-pointer rounded-lg flex items-center justify-center transition-all duration-200
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
