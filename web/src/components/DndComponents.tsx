import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { UnitCard, EmptySlot } from './UnitCard';
import type { CardView, BoardUnitView } from '../types';

// Draggable wrapper for UnitCard
interface DraggableCardProps {
  id: string;
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showPitch?: boolean;
  can_afford?: boolean;
  disabled?: boolean;
}

export function DraggableCard({
  id,
  card,
  isSelected = false,
  onClick,
  showCost = true,
  showPitch = true,
  can_afford = true,
  disabled = false,
}: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
    data: { type: id.split('-')[0], index: parseInt(id.split('-')[1]) },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <UnitCard
        card={card}
        isSelected={isSelected}
        onClick={onClick}
        showCost={showCost}
        showPitch={showPitch}
        can_afford={can_afford}
        draggable={false} // Disable native drag since @dnd-kit handles it
      />
    </div>
  );
}

// Droppable wrapper for board slots (can contain a card or be empty)
interface DroppableBoardSlotProps {
  id: string;
  children: React.ReactNode;
  isOver?: boolean;
}

export function DroppableBoardSlot({ id, children }: DroppableBoardSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: 'board-slot', index: parseInt(id.split('-')[2]) },
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all duration-150 ${isOver ? 'scale-105' : ''}`}
    >
      {children}
    </div>
  );
}

// Droppable empty slot component
interface DroppableEmptySlotProps {
  id: string;
  onClick?: () => void;
  isTarget?: boolean;
  label?: string;
}

export function DroppableEmptySlot({
  id,
  onClick,
  isTarget = false,
  label,
}: DroppableEmptySlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: 'board-slot', index: parseInt(id.split('-')[2]) },
  });

  return (
    <div ref={setNodeRef}>
      <EmptySlot
        onClick={onClick}
        isTarget={isTarget || isOver}
        label={label}
      />
    </div>
  );
}

// Droppable area for ash pile
interface DroppableAshPileProps {
  children: React.ReactNode;
  onHoverChange: (isHovered: boolean) => void;
}

export function DroppableAshPile({ children, onHoverChange }: DroppableAshPileProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'ash-pile',
    data: { type: 'ash-pile' },
  });

  // Sync isOver state with parent
  React.useEffect(() => {
    onHoverChange(isOver);
  }, [isOver, onHoverChange]);

  return (
    <div ref={setNodeRef}>
      {children}
    </div>
  );
}
