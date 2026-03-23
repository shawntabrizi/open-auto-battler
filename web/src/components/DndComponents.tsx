import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { UnitCard, EmptySlot } from './UnitCard';
import type { CardView, BoardUnitView } from '../types';
import type { CardSizeVariant } from '../constants/cardSizes';

// Draggable wrapper for UnitCard
interface DraggableCardProps {
  id: string;
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showBurn?: boolean;
  can_afford?: boolean;
  disabled?: boolean;
  enableWobble?: boolean;
  enableTilt?: boolean;
  sizeVariant?: CardSizeVariant;
}

export function DraggableCard({
  id,
  card,
  isSelected = false,
  onClick,
  showCost = true,
  showBurn = true,
  can_afford = true,
  disabled = false,
  enableWobble,
  enableTilt,
  sizeVariant,
}: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
    data: { type: id.split('-')[0], index: parseInt(id.split('-')[1]) },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onKeyDownCapture={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onClick) {
          event.preventDefault();
          onClick();
        }
      }}
      className="w-full h-full"
    >
      <UnitCard
        card={card}
        isSelected={isSelected}
        onClick={onClick}
        showCost={showCost}
        showBurn={showBurn}
        can_afford={can_afford}
        draggable={false} // Disable native drag since @dnd-kit handles it
        enableWobble={enableWobble}
        enableTilt={enableTilt}
        sizeVariant={sizeVariant}
      />
    </div>
  );
}

// Droppable wrapper for board slots (can contain a card or be empty)
interface DroppableBoardSlotProps {
  id: string;
  children: React.ReactNode | ((props: { isOver: boolean }) => React.ReactNode);
}

export function DroppableBoardSlot({ id, children }: DroppableBoardSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: 'board-slot', index: parseInt(id.split('-')[2]) },
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-full h-full transition-all duration-150 ${isOver ? 'scale-105' : ''}`}
    >
      {typeof children === 'function' ? children({ isOver }) : children}
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
    <div ref={setNodeRef} className="w-full h-full">
      <EmptySlot onClick={onClick} isTarget={isTarget || isOver} label={label} />
    </div>
  );
}

// Droppable area for burn zone
interface DroppableBurnZoneProps {
  children: React.ReactNode;
  onHoverChange: (isHovered: boolean) => void;
}

export function DroppableBurnZone({ children, onHoverChange }: DroppableBurnZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'burn-zone',
    data: { type: 'burn-zone' },
  });

  // Sync isOver state with parent
  React.useEffect(() => {
    onHoverChange(isOver);
  }, [isOver, onHoverChange]);

  return <div ref={setNodeRef}>{children}</div>;
}
