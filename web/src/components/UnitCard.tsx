import React from 'react';
import type { CardView, BoardUnitView } from '../types';
import { getCardEmoji } from '../utils/emoji';
import { useCustomizationStore } from '../store/customizationStore';
import { statusesFromMask, STATUS_ICON } from '../utils/status';

interface UnitCardProps {
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showPitch?: boolean;
  compact?: boolean;

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

  can_afford = true,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: UnitCardProps) {
  const cardStyle = useCustomizationStore((s) => s.selections.cardStyle);
  const [isDragging, setIsDragging] = React.useState(false);
  const abilityCount = (card.shop_abilities?.length ?? 0) + (card.battle_abilities?.length ?? 0);
  const statusMask = 'active_statuses' in card ? card.active_statuses : card.base_statuses;
  const displayStatuses = statusesFromMask(statusMask);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    onDragStart?.(e);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false);
    onDragEnd?.(e);
  };

  const displayHealth = card.health;

  // Size classes based on compact prop
  const sizeClasses = compact
    ? 'w-[4.5rem] h-24 lg:w-24 lg:h-32'
    : 'w-[4.5rem] h-24 lg:w-32 lg:h-44';
  const artClasses = compact
    ? 'h-10 lg:h-14 text-xl lg:text-2xl'
    : 'h-10 lg:h-20 text-xl lg:text-3xl';
  const titleClasses = compact ? 'text-[0.45rem] lg:text-xs' : 'text-[0.45rem] lg:text-sm';
  const statClasses = compact ? 'text-[0.5rem] lg:text-sm' : 'text-[0.5rem] lg:text-base';
  const badgeClasses = compact
    ? 'w-4 h-4 lg:w-6 lg:h-6 text-[0.5rem] lg:text-xs'
    : 'w-4 h-4 lg:w-7 lg:h-7 text-[0.5rem] lg:text-sm';

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        unit-card card relative ${sizeClasses} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} select-none bg-card-bg rounded-lg border-2 border-gray-600 p-1 lg:p-2 transition-all duration-200
        ${isSelected ? 'card-selected ring-2 ring-yellow-400' : ''}

        ${!can_afford && showCost ? 'opacity-60' : ''}
        ${isDragging ? 'opacity-50 scale-105' : ''}
      `}
    >
      {/* Card name */}
      <div
        className={`card-title relative z-10 ${titleClasses} font-bold text-center truncate mb-0.5 lg:mb-1`}
      >
        {card.name}
      </div>

      {/* Card art placeholder */}
      <div
        className={`card-art w-full ${artClasses} bg-gray-700 rounded flex items-center justify-center relative`}
      >
        {getCardEmoji(card.id)}
        {abilityCount > 0 && (
          <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 z-10 bg-yellow-500 rounded-full w-3 h-3 lg:w-4 lg:h-4 flex items-center justify-center text-[0.4rem] lg:text-[0.55rem] font-bold border border-yellow-300 shadow">
            {abilityCount > 1 ? abilityCount : '✶'}
          </div>
        )}
        {displayStatuses.length > 0 && (
          <div className="absolute top-0 left-0 z-10 flex gap-0.5 lg:gap-1 p-0.5">
            {displayStatuses.map((status) => (
              <span
                key={status}
                className="text-[0.45rem] lg:text-[0.65rem] px-1 py-0.5 rounded bg-black/60 border border-white/20"
                title={status}
              >
                {STATUS_ICON[status]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="card-stats-row relative z-10 flex justify-between items-center mt-0.5 lg:mt-1">
        {/* Attack */}
        <div className={`flex items-center ${statClasses}`}>
          <span className="text-red-400 mr-0.5 lg:mr-1">⚔</span>
          <span className="font-bold">{card.attack}</span>
        </div>

        {/* Health */}
        <div className={`flex items-center ${statClasses}`}>
          <span className="text-green-400">❤</span>
          <span className="font-bold ml-0.5 lg:ml-1">{displayHealth}</span>
        </div>
      </div>

      {/* Cost badge (top left) */}
      {showCost && (
        <div
          className={`card-cost-badge absolute -top-1 -left-1 lg:-top-2 lg:-left-2 z-10 ${badgeClasses} bg-mana-blue rounded-full flex items-center justify-center font-bold border lg:border-2 border-blue-300`}
        >
          {card.play_cost}
        </div>
      )}

      {/* Pitch value badge (top right) */}
      {showPitch && (
        <div
          className={`card-pitch-badge absolute -top-1 -right-1 lg:-top-2 lg:-right-2 z-10 ${badgeClasses} bg-pitch-red rounded-full flex items-center justify-center font-bold border lg:border-2 border-red-300`}
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
        empty-slot slot ${sizeClasses} cursor-pointer bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center transition-all duration-200
        ${isTarget ? 'border-yellow-400 bg-yellow-400/10' : ''}
      `}
    >
      {label && <span className="text-gray-500 text-xs">{label}</span>}
    </div>
  );
}
