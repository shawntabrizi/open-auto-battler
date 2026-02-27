import React, { useEffect, useRef } from 'react';
import { useDragContext } from '../hooks/useDragAndDrop';
import { UnitCard } from './UnitCard';
import type { CardView, BoardUnitView } from '../types';
import type { CardSizeVariant } from '../constants/cardSizes';

// Draggable wrapper for UnitCard
interface DraggableCardProps {
  id: string;
  card: CardView | BoardUnitView;
  isSelected?: boolean;
  onClick?: () => void;
  showCost?: boolean;
  showPitch?: boolean;
  sizeVariant?: CardSizeVariant;
  can_afford?: boolean;
  disabled?: boolean;
  enableWobble?: boolean;
}

export function DraggableCard({
  id,
  card,
  isSelected = false,
  onClick,
  showCost = true,
  showPitch = true,
  sizeVariant = 'standard',
  can_afford = true,
  disabled = false,
  enableWobble = true,
}: DraggableCardProps) {
  const { activeId, handlePointerDown } = useDragContext();
  const isDragging = activeId === id;

  const [type, indexStr] = id.split('-');
  const data = { type, index: parseInt(indexStr) };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    handlePointerDown(e, id, data);
  };

  const style: React.CSSProperties = {
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
  };

  return (
    <div onPointerDown={onPointerDown} style={style}>
      <UnitCard
        card={card}
        isSelected={isSelected}
        onClick={onClick}
        showCost={showCost}
        showPitch={showPitch}
        sizeVariant={sizeVariant}
        can_afford={can_afford}
        enableTilt={!isDragging}
        enableWobble={enableWobble && !isDragging}
        draggable={false}
      />
    </div>
  );
}

// Droppable wrapper for board slots (can contain a card or be empty)
interface DroppableBoardSlotProps {
  id: string;
  children: (props: { isOver: boolean }) => React.ReactNode;
}

export function DroppableBoardSlot({ id, children }: DroppableBoardSlotProps) {
  const { registerDropZone, unregisterDropZone, hoveredZoneId } = useDragContext();
  const ref = useRef<HTMLDivElement>(null);
  const isOver = hoveredZoneId === id;

  useEffect(() => {
    if (ref.current) {
      registerDropZone(id, ref.current, { type: 'board-slot', index: parseInt(id.split('-')[2]) });
    }
    return () => unregisterDropZone(id);
  }, [id, registerDropZone, unregisterDropZone]);

  return (
    <div ref={ref} className="rounded-lg">
      {children({ isOver })}
    </div>
  );
}

// Droppable area for ash pile
interface DroppableAshPileProps {
  children: React.ReactNode;
  onHoverChange: (isHovered: boolean) => void;
  zoneId?: string;
}

export function DroppableAshPile({ children, onHoverChange, zoneId = 'ash-pile' }: DroppableAshPileProps) {
  const { registerDropZone, unregisterDropZone, hoveredZoneId } = useDragContext();
  const ref = useRef<HTMLDivElement>(null);
  const isOver = hoveredZoneId === zoneId;

  useEffect(() => {
    if (ref.current) {
      registerDropZone(zoneId, ref.current, { type: 'ash-pile' });
    }
    return () => unregisterDropZone(zoneId);
  }, [registerDropZone, unregisterDropZone, zoneId]);

  useEffect(() => {
    onHoverChange(isOver);
  }, [isOver, onHoverChange]);

  return <div ref={ref}>{children}</div>;
}
