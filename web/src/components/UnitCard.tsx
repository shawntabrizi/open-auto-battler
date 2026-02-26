import React from 'react';
import type { CardView, BoardUnitView } from '../types';
import { getCardEmoji } from '../utils/emoji';
import { getCardArtSm, hasCardArt } from '../utils/cardArt';
import { useCustomizationStore } from '../store/customizationStore';
import { useAudioStore } from '../store/audioStore';
import { useCardTilt } from '../hooks/useCardTilt';
import { SwordIcon, HeartIcon, AbilityIcon } from './Icons';

interface UnitCardProps {
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showPitch?: boolean;
  compact?: boolean;
  enableWobble?: boolean;
  enableTilt?: boolean;

  can_afford?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function UnitCard({
  card,
  isSelected = false,
  onClick,
  showCost = true,
  showPitch = true,
  compact = false,
  enableWobble = true,
  enableTilt = true,

  can_afford = true,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: UnitCardProps) {
  const cardStyle = useCustomizationStore((s) => s.selections.cardStyle);
  const playSfx = useAudioStore((s) => s.playSfx);
  const [isDragging, setIsDragging] = React.useState(false);

  const { tiltRef } = useCardTilt({
    enabled: enableTilt && !isDragging && !isSelected,
    maxRotation: compact ? 8 : 12,
  });

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    onDragStart?.(e);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false);
    onDragEnd?.(e);
  };

  const displayHealth = card.health;
  const artSrc = hasCardArt(card.id) ? getCardArtSm(card.id) : null;

  // Size classes based on compact prop
  const sizeClasses = compact
    ? 'w-[4.5rem] h-24 lg:w-24 lg:h-32'
    : 'w-[4.5rem] h-24 lg:w-32 lg:h-44';
  const titleClasses = compact ? 'text-[0.45rem] lg:text-xs' : 'text-[0.45rem] lg:text-sm';
  const statClasses = compact ? 'text-[0.5rem] lg:text-sm' : 'text-[0.5rem] lg:text-base';
  const badgeClasses = compact
    ? 'w-4 h-4 lg:w-6 lg:h-6 text-[0.5rem] lg:text-xs'
    : 'w-4 h-4 lg:w-7 lg:h-7 text-[0.5rem] lg:text-sm';

  return (
    <div
      ref={enableTilt ? tiltRef : undefined}
      onClick={() => {
        playSfx('card-select');
        onClick?.();
      }}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        unit-card card relative ${sizeClasses} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} select-none rounded-lg border-2 transition-all duration-200 overflow-hidden
        ${artSrc ? 'border-amber-900/60 bg-black' : 'bg-card-bg border-warm-600 p-1 lg:p-2'}
        ${isSelected ? 'card-selected ring-2 ring-yellow-400' : ''}
        ${enableWobble && !isDragging && !isSelected ? 'wobble-card' : ''}
        ${enableTilt && !isDragging && !isSelected ? 'card-tilt' : ''}
        ${isDragging ? 'opacity-50 scale-105' : ''}
      `}
      style={
        enableWobble && !isDragging && !isSelected
          ? { animationDelay: `${(card.id * 200) % 2500}ms` }
          : undefined
      }
    >
      {artSrc ? (
        <>
          {/* Full-bleed card art */}
          <img
            src={artSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-[center_30%]"
            loading="lazy"
          />

          {/* Gradient overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

          {/* Card name - overlaid at top */}
          <div
            className={`relative z-[2] ${titleClasses} font-bold text-center truncate text-white pt-1 lg:pt-1.5 px-0.5`}
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
          >
            {card.name}
          </div>

          {/* Ability badge */}
          {card.abilities.length > 0 && (
            <div className="absolute bottom-5 right-0.5 lg:bottom-7 lg:right-1 z-[3] bg-yellow-500 rounded-full w-3 h-3 lg:w-4 lg:h-4 flex items-center justify-center text-[0.4rem] lg:text-[0.55rem] font-bold border border-yellow-300 shadow">
              {card.abilities.length > 1 ? (
                card.abilities.length
              ) : (
                <AbilityIcon className="w-2 h-2 lg:w-2.5 lg:h-2.5" />
              )}
            </div>
          )}

          {/* Stats row - pinned to bottom */}
          <div
            className="card-stats-row absolute bottom-0 left-0 right-0 z-[2] flex justify-between items-center px-1 lg:px-2 pb-0.5 lg:pb-1"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
          >
            <div className={`flex items-center ${statClasses} font-stat`}>
              <SwordIcon className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-red-400 mr-0.5" />
              <span className="font-bold text-white">{card.attack}</span>
            </div>
            <div className={`flex items-center ${statClasses} font-stat`}>
              <HeartIcon className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-green-400" />
              <span className="font-bold text-white ml-0.5">{displayHealth}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Fallback: emoji layout (same as original) */}
          <div
            className={`card-title relative z-10 ${titleClasses} font-bold text-center truncate mb-0.5 lg:mb-1`}
          >
            {card.name}
          </div>

          <div
            className={`card-art w-full ${compact ? 'h-10 lg:h-14 text-xl lg:text-2xl' : 'h-10 lg:h-20 text-xl lg:text-3xl'} bg-warm-700 rounded flex items-center justify-center relative`}
          >
            {getCardEmoji(card.id)}
            {card.abilities.length > 0 && (
              <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 z-10 bg-yellow-500 rounded-full w-3 h-3 lg:w-4 lg:h-4 flex items-center justify-center text-[0.4rem] lg:text-[0.55rem] font-bold border border-yellow-300 shadow">
                {card.abilities.length > 1 ? (
                  card.abilities.length
                ) : (
                  <AbilityIcon className="w-2 h-2 lg:w-2.5 lg:h-2.5" />
                )}
              </div>
            )}
          </div>

          <div className="card-stats-row relative z-10 flex justify-between items-center mt-0.5 lg:mt-1">
            <div className={`flex items-center ${statClasses} font-stat`}>
              <SwordIcon className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-red-400 mr-0.5" />
              <span className="font-bold">{card.attack}</span>
            </div>
            <div className={`flex items-center ${statClasses} font-stat`}>
              <HeartIcon className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-green-400" />
              <span className="font-bold ml-0.5">{displayHealth}</span>
            </div>
          </div>
        </>
      )}

      {/* Cost badge (top left) */}
      {showCost && (
        <div
          className={`card-cost-badge absolute -top-1 -left-1 lg:-top-2 lg:-left-2 z-10 ${badgeClasses} rounded-full flex items-center justify-center font-stat font-bold border lg:border-2 ${
            can_afford
              ? 'bg-mana-blue border-sky-300/40 shadow-[0_0_6px_rgba(91,143,170,0.5)]'
              : 'bg-warm-600 border-warm-500/60 text-warm-400 shadow-sm'
          }`}
        >
          {card.play_cost}
        </div>
      )}

      {/* Pitch value badge (top right) */}
      {showPitch && (
        <div
          className={`card-pitch-badge absolute -top-1 -right-1 lg:-top-2 lg:-right-2 z-10 ${badgeClasses} bg-pitch-red rounded-full flex items-center justify-center font-stat font-bold border lg:border-2 border-red-800/60 shadow-sm`}
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
  label?: string;
  compact?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function EmptySlot({
  onClick,
  isTarget = false,
  label,
  compact = false,
  onDragOver,
  onDrop,
}: EmptySlotProps) {
  const sizeClasses = compact
    ? 'w-[4.5rem] h-24 lg:w-24 lg:h-32'
    : 'w-[4.5rem] h-24 lg:w-32 lg:h-44';

  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        empty-slot slot ${sizeClasses} cursor-pointer bg-warm-800/50 rounded-lg border-2 border-dashed border-warm-600 flex items-center justify-center transition-all duration-200
        ${isTarget ? 'border-yellow-400 bg-yellow-400/10' : ''}
      `}
    >
      {label && <span className="text-warm-500 text-xs">{label}</span>}
    </div>
  );
}
