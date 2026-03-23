import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type DragEndEvent,
  type DragOverEvent,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  type Modifier,
} from '@dnd-kit/core';
import { toast } from 'react-hot-toast';
import { useGameStore } from '../store/gameStore';
import type { CardView, BoardUnitView } from '../types';
import { isBoardFull } from '../utils/boardShift';

export interface UseDragAndDropOptions {
  onDragEnd?: (event: DragEndEvent) => void;
}

export interface UseDragAndDropReturn {
  activeId: string | null;
  sensors: ReturnType<typeof useSensors>;
  restrictToContainer: Modifier;
  containerRef: React.RefObject<HTMLDivElement>;
  handleDragStart: (event: { active: { id: string | number } }) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;
  getActiveCard: () => CardView | BoardUnitView | null;
}

export function useDragAndDrop(options: UseDragAndDropOptions = {}): UseDragAndDropReturn {
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Cache the board card at drag start so the overlay stays stable
  const draggedCardRef = useRef<CardView | BoardUnitView | null>(null);

  const {
    view,
    playHandCard,
    moveBoardPosition,
    swapBoardPositions,
    burnHandCard,
    burnBoardUnit,
    setSelection,
    setDragShift,
  } = useGameStore();

  // Keep a ref to the current view so callbacks can read it without
  // needing view in their dependency arrays (avoids re-creating on every state change)
  const viewRef = useRef(view);
  viewRef.current = view;

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

  // Handle drag start — record selection and cache card for overlay
  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      const id = String(event.active.id);
      setActiveId(id);
      const [type, indexStr] = id.split('-');
      const index = parseInt(indexStr);
      if (type === 'hand' || type === 'board') {
        setSelection({ type: type, index });
      }
      // Cache the card data for the overlay
      if (type === 'board' && viewRef.current?.board) {
        draggedCardRef.current = viewRef.current.board[index] ?? null;
      } else {
        draggedCardRef.current = null;
      }
    },
    [setSelection]
  );

  // Handle drag over — set drag shift for CSS transform-based card shifting
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const activeData = event.active.data.current;
      if (!activeData) {
        setDragShift(null);
        return;
      }

      const overData = event.over?.data.current;
      if (overData?.type !== 'board-slot') {
        setDragShift(null);
        return;
      }

      const hoverIndex = overData.index as number;

      const board = viewRef.current?.board;

      if (activeData.type === 'board') {
        // Board-to-board: shift when target is occupied
        const sourceIndex = activeData.index as number;
        if (sourceIndex === hoverIndex || !board?.[hoverIndex]) {
          setDragShift(null);
        } else {
          setDragShift({ source: sourceIndex, target: hoverIndex });
        }
      } else if (activeData.type === 'hand') {
        // Hand-to-board: shift when target is occupied and board has space
        if (!board?.[hoverIndex] || isBoardFull(board)) {
          setDragShift(null);
        } else {
          // source=-1 sentinel signals "hand insert" to the rendering layer
          setDragShift({ source: -1, target: hoverIndex });
        }
      } else {
        setDragShift(null);
      }
    },
    [setDragShift]
  );

  // Handle drag end - dispatch actions based on source and destination
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setDragShift(null);
      draggedCardRef.current = null;

      // Allow custom handler override
      if (options.onDragEnd) {
        options.onDragEnd(event);
        return;
      }

      if (!over) {
        const sourceType = active.data.current?.type as string | undefined;
        if (sourceType === 'hand') {
          toast('Drop on the board to play or the flame to burn', {
            icon: '\u{1F4A1}',
            id: 'drop-hint',
          });
        }
        return;
      }

      const activeData = active.data.current;
      const overData = over.data.current;

      if (!activeData || !overData) return;

      const sourceType = activeData.type as string;
      const sourceIndex = activeData.index as number;
      const destType = overData.type as string;

      // Handle dropping on burn zone
      if (destType === 'burn-zone') {
        if (sourceType === 'hand') {
          burnHandCard(sourceIndex);
        } else if (sourceType === 'board') {
          burnBoardUnit(sourceIndex);
        }
        setSelection(null);
        return;
      }

      // Handle dropping on board slot
      if (destType === 'board-slot') {
        const destIndex = overData.index as number;

        if (sourceType === 'hand') {
          // Play card from hand to board (engine handles shifting if occupied)
          playHandCard(sourceIndex, destIndex);
        } else if (sourceType === 'board' && sourceIndex !== destIndex) {
          if (viewRef.current?.board?.[destIndex]) {
            // Target occupied — SAP-style shift
            moveBoardPosition(sourceIndex, destIndex);
          } else {
            // Target empty — direct move
            swapBoardPositions(sourceIndex, destIndex);
          }
        }
        setSelection(null);
      }
    },
    [
      options,
      burnHandCard,
      burnBoardUnit,
      playHandCard,
      moveBoardPosition,
      swapBoardPositions,
      setSelection,
      setDragShift,
    ]
  );

  // Handle drag cancel
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDragShift(null);
    draggedCardRef.current = null;
  }, [setDragShift]);

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
    if (!activeId || !viewRef.current) return null;
    const [type, indexStr] = activeId.split('-');
    const index = parseInt(indexStr);
    if (type === 'hand') {
      return viewRef.current.hand[index] ?? null;
    } else if (type === 'board') {
      return draggedCardRef.current ?? viewRef.current.board[index] ?? null;
    }
    return null;
  }, [activeId]);

  return {
    activeId,
    sensors,
    restrictToContainer,
    containerRef,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    getActiveCard,
  };
}
