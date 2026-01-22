import React from 'react';
import type { CardView, BoardUnitView } from '../types';

interface UnitCardProps {
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showPitch?: boolean;
  frozen?: boolean;
  canAfford?: boolean;
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
  frozen = false,
  canAfford = true,
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

  const isBoardUnit = 'currentHealth' in card;
  const currentHealth = isBoardUnit ? card.currentHealth : card.health;
  const maxHealth = isBoardUnit ? card.maxHealth : card.health;
  const isDamaged = isBoardUnit && currentHealth < maxHealth;

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        card relative w-24 h-32 ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} select-none bg-card-bg rounded-lg border-2 border-gray-600 p-2 transition-all duration-200
        ${isSelected ? 'card-selected ring-2 ring-yellow-400' : ''}
        ${frozen ? 'ring-2 ring-cyan-400' : ''}
        ${!canAfford && showCost ? 'opacity-60' : ''}
        ${isDragging ? 'opacity-50 scale-105' : ''}
      `}
    >
      {/* Card name */}
      <div className="text-xs font-bold text-center truncate mb-1">{card.name}</div>

      {/* Card art placeholder */}
      <div className="w-full h-14 bg-gray-700 rounded flex items-center justify-center text-2xl">
        {getCardEmoji(card.templateId)}
      </div>

      {/* Stats row */}
      <div className="flex justify-between items-center mt-1">
        {/* Attack */}
        <div className="flex items-center text-sm">
          <span className="text-red-400 mr-1">⚔</span>
          <span className="font-bold">{card.attack}</span>
        </div>

        {/* Health */}
        <div className="flex items-center text-sm">
          <span className={isDamaged ? 'text-red-500' : 'text-green-400'}>❤</span>
          <span className={`font-bold ml-1 ${isDamaged ? 'text-red-400' : ''}`}>
            {currentHealth}
          </span>
        </div>
      </div>

      {/* Cost badge (top left) */}
      {showCost && (
        <div className="absolute -top-2 -left-2 w-6 h-6 bg-mana-blue rounded-full flex items-center justify-center text-xs font-bold border-2 border-blue-300">
          {card.playCost}
        </div>
      )}

      {/* Pitch value badge (top right) */}
      {showPitch && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-pitch-red rounded-full flex items-center justify-center text-xs font-bold border-2 border-red-300">
          {card.pitchValue}
        </div>
      )}

      {/* Frozen indicator */}
      {frozen && (
        <div className="absolute inset-0 bg-cyan-400/20 rounded-lg flex items-center justify-center">
          <span className="text-2xl">❄</span>
        </div>
      )}
    </div>
  );
}

function getCardEmoji(templateId: string): string {
  const emojis: Record<string, string> = {
    goblin_scout: '👺',
    goblin_grunt: '👹',
    goblin_looter: '💰',
    militia: '🛡',
    shield_bearer: '🏰',
    wolf_rider: '🐺',
    orc_warrior: '👹',
    orc_shaman: '🔮',
    troll_brute: '🧌',
    ogre_mauler: '👊',
    giant_crusher: '🦣',
    dragon_tyrant: '🐉',
  };
  return emojis[templateId] || '❓';
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
        slot w-24 h-32 cursor-pointer bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center transition-all duration-200
        ${isTarget ? 'border-yellow-400 bg-yellow-400/10' : ''}
      `}
    >
      {label && <span className="text-gray-500 text-xs">{label}</span>}
    </div>
  );
}
