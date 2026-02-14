import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type DragEndEvent,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  type Modifier,
} from '@dnd-kit/core';
import { useGameStore } from '../store/gameStore';
import type { CardView, BoardUnitView } from '../types';

export interface UseDragAndDropOptions {
  onDragEnd?: (event: DragEndEvent) => void;
}

export interface UseDragAndDropReturn {
  activeId: string | null;
  sensors: ReturnType<typeof useSensors>;
  restrictToContainer: Modifier;
  containerRef: React.RefObject<HTMLDivElement>;
  handleDragStart: (event: { active: { id: string | number } }) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  getActiveCard: () => CardView | BoardUnitView | null;
}

export function useDragAndDrop(options: UseDragAndDropOptions = {}): UseDragAndDropReturn {
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { view, playHandCard, swapBoardPositions, pitchHandCard, pitchBoardUnit, setSelection } =
    useGameStore();

  // Custom modifier to restrict dragging to the container
  const restrictToContainer: Modifier = useCallback(({ transform, draggingNodeRect }) => {
    if (!containerRef.current || !draggingNodeRect) {
      return transform;
    }

    const layoutRect = containerRef.current.getBoundingClientRect();

    const minX = layoutRect.left - draggingNodeRect.left;
    const maxX = layoutRect.right - draggingNodeRect.right;
    const minY = layoutRect.top - draggingNodeRect.top;
    const maxY = layoutRect.bottom - draggingNodeRect.bottom;

    return {
      ...transform,
      x: Math.min(Math.max(transform.x, minX), maxX),
      y: Math.min(Math.max(transform.y, minY), maxY),
    };
  }, []);

  // Configure sensors for both mouse and touch
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5, // 5px movement before drag starts
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100, // 100ms hold before drag starts
      tolerance: 5, // 5px movement tolerance during delay
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Handle drag start
  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      setActiveId(String(event.active.id));
      const [type, indexStr] = String(event.active.id).split('-');
      const index = parseInt(indexStr);
      if (type === 'hand' || type === 'board') {
        setSelection({ type: type, index });
      }
    },
    [setSelection]
  );

  // Handle drag end - dispatch actions based on source and destination
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      // Allow custom handler override
      if (options.onDragEnd) {
        options.onDragEnd(event);
        return;
      }

      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;

      if (!activeData || !overData) return;

      const sourceType = activeData.type as string;
      const sourceIndex = activeData.index as number;
      const destType = overData.type as string;

      // Handle dropping on ash pile
      if (destType === 'ash-pile') {
        if (sourceType === 'hand') {
          pitchHandCard(sourceIndex);
        } else if (sourceType === 'board') {
          pitchBoardUnit(sourceIndex);
        }
        setSelection(null);
        return;
      }

      // Handle dropping on board slot
      if (destType === 'board-slot') {
        const destIndex = overData.index as number;

        if (sourceType === 'hand') {
          // Play card from hand to board
          playHandCard(sourceIndex, destIndex);
        } else if (sourceType === 'board' && sourceIndex !== destIndex) {
          // Swap board positions
          swapBoardPositions(sourceIndex, destIndex);
        }
        setSelection(null);
      }
    },
    [options, pitchHandCard, pitchBoardUnit, playHandCard, swapBoardPositions, setSelection]
  );

  // Prevent body scroll during drag
  useEffect(() => {
    if (activeId) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [activeId]);

  // Get the card being dragged for the overlay
  const getActiveCard = useCallback((): CardView | BoardUnitView | null => {
    if (!activeId || !view) return null;
    const [type, indexStr] = activeId.split('-');
    const index = parseInt(indexStr);
    if (type === 'hand') {
      return view.hand[index] ?? null;
    } else if (type === 'board') {
      return view.board[index] ?? null;
    }
    return null;
  }, [activeId, view]);

  return {
    activeId,
    sensors,
    restrictToContainer,
    containerRef,
    handleDragStart,
    handleDragEnd,
    getActiveCard,
  };
}
