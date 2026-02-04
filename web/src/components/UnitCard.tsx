import React from 'react';
import type { CardView, BoardUnitView } from '../types';
import { getCardEmoji } from '../utils/emoji';

interface UnitCardProps {
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showPitch?: boolean;

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

  can_afford = true,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: UnitCardProps) {
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    onDragStart?.(e);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false);
    onDragEnd?.(e);
  };

  const displayHealth = card.health;

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        unit-card card relative w-24 h-32 ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} select-none bg-card-bg rounded-lg border-2 border-gray-600 p-2 transition-all duration-200
        ${isSelected ? 'card-selected ring-2 ring-yellow-400' : ''}
        
        ${!can_afford && showCost ? 'opacity-60' : ''}
        ${isDragging ? 'opacity-50 scale-105' : ''}
      `}
    >
      {/* Card name */}
      <div className="card-title text-[0.45rem] md:text-xs font-bold text-center truncate mb-0.5 md:mb-1">{card.name}</div>

      {/* Card art placeholder */}
      <div className="card-art w-full h-10 md:h-14 bg-gray-700 rounded flex items-center justify-center text-xl md:text-2xl">
        {getCardEmoji(card.template_id)}
      </div>

      {/* Stats row */}
      <div className="card-stats-row flex justify-between items-center mt-0.5 md:mt-1">
        {/* Attack */}
        <div className="flex items-center text-[0.5rem] md:text-sm">
          <span className="text-red-400 mr-0.5 md:mr-1">⚔</span>
          <span className="font-bold">{card.attack}</span>
        </div>

        {/* Health */}
        <div className="flex items-center text-[0.5rem] md:text-sm">
          <span className="text-green-400">❤</span>
          <span className="font-bold ml-0.5 md:ml-1">{displayHealth}</span>
        </div>
      </div>

      {/* Cost badge (top left) */}
      {showCost && (
        <div className="card-cost-badge absolute -top-1 -left-1 md:-top-2 md:-left-2 w-4 h-4 md:w-6 md:h-6 bg-mana-blue rounded-full flex items-center justify-center text-[0.5rem] md:text-xs font-bold border md:border-2 border-blue-300">
          {card.play_cost}
        </div>
      )}

      {/* Pitch value badge (top right) */}
      {showPitch && (
        <div className="card-pitch-badge absolute -top-1 -right-1 md:-top-2 md:-right-2 w-4 h-4 md:w-6 md:h-6 bg-pitch-red rounded-full flex items-center justify-center text-[0.5rem] md:text-xs font-bold border md:border-2 border-red-300">
          {card.pitch_value}
        </div>
      )}
    </div>
  );
}

// Empty slot component
interface EmptySlotProps {
  onClick?: () => void;
  isTarget?: boolean;
  label?: string;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function EmptySlot({
  onClick,
  isTarget = false,
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
        empty-slot slot w-24 h-32 cursor-pointer bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center transition-all duration-200
        ${isTarget ? 'border-yellow-400 bg-yellow-400/10' : ''}
      `}
    >
      {label && <span className="text-gray-500 text-xs">{label}</span>}
    </div>
  );
}
