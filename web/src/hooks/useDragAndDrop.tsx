import React, { useState, useEffect, useRef, useCallback, useContext, createContext } from 'react';
import { useGameStore } from '../store/gameStore';
import { UnitCard } from '../components/UnitCard';
import type { CardView, BoardUnitView } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DropZoneEntry {
  id: string;
  element: HTMLElement;
  data: { type: string; index?: number };
}

interface DragItem {
  id: string;
  type: string;
  index: number;
}

interface DragContextValue {
  activeId: string | null;
  hoveredZoneId: string | null;
  containerRef: React.RefObject<HTMLDivElement>;
  registerDropZone: (id: string, element: HTMLElement, data: { type: string; index?: number }) => void;
  unregisterDropZone: (id: string) => void;
  handlePointerDown: (e: React.PointerEvent, id: string, data: { type: string; index: number }) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DragContext = createContext<DragContextValue | null>(null);

export function useDragContext(): DragContextValue {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDragContext must be used inside <DragProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Core hook
// ---------------------------------------------------------------------------

function useDragEngine(
  containerRef: React.RefObject<HTMLDivElement | null>,
  ghostRef: React.RefObject<HTMLDivElement | null>,
) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  // Refs — no React re-renders during drag movement
  const dropZonesRef = useRef<Map<string, DropZoneEntry>>(new Map());
  const dragItemRef = useRef<DragItem | null>(null);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const ghostOffsetRef = useRef({ x: 0, y: 0 });
  const activatedRef = useRef(false);
  const holdTimerRef = useRef<number>(0);
  const pointerIdRef = useRef<number>(-1);
  const pointerTypeRef = useRef<string>('mouse');
  const prevClientXRef = useRef(0);
  const smoothedRotRef = useRef(0);
  const currentOverRef = useRef<string | null>(null);
  const sourceElementRef = useRef<HTMLElement | null>(null);
  // Initial ghost transform — applied via ref callback before first paint
  const initialTransformRef = useRef('');

  const { view, playHandCard, swapBoardPositions, pitchHandCard, pitchBoardUnit, setSelection } =
    useGameStore();

  // ----- Drop zone registry -----

  const registerDropZone = useCallback(
    (id: string, element: HTMLElement, data: { type: string; index?: number }) => {
      dropZonesRef.current.set(id, { id, element, data });
    },
    [],
  );

  const unregisterDropZone = useCallback((id: string) => {
    dropZonesRef.current.delete(id);
  }, []);

  // ----- Hit testing -----

  const hitTest = useCallback((clientX: number, clientY: number): DropZoneEntry | null => {
    for (const [, zone] of dropZonesRef.current) {
      const rect = zone.element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return zone;
      }
    }
    return null;
  }, []);

  // ----- Ghost positioning -----

  const positionGhost = useCallback(
    (clientX: number, clientY: number) => {
      const ghost = ghostRef.current;
      const container = containerRef.current;
      if (!ghost || !container) return;

      let x = clientX - ghostOffsetRef.current.x;
      let y = clientY - ghostOffsetRef.current.y;

      // Clamp to container bounds
      const cr = container.getBoundingClientRect();
      const gw = ghost.offsetWidth;
      const gh = ghost.offsetHeight;
      x = Math.max(cr.left, Math.min(cr.right - gw, x));
      y = Math.max(cr.top, Math.min(cr.bottom - gh, y));

      // Tilt based on horizontal velocity
      const velocity = clientX - prevClientXRef.current;
      prevClientXRef.current = clientX;
      const targetRot = Math.max(-12, Math.min(12, velocity * 1.0));
      smoothedRotRef.current += (targetRot - smoothedRotRef.current) * 0.3;

      ghost.style.transform = `translate(${x}px, ${y}px) scale(1.08) rotate(${smoothedRotRef.current.toFixed(2)}deg)`;
    },
    [containerRef, ghostRef],
  );

  // ----- Activation -----

  const activate = useCallback(
    (clientX: number, clientY: number, sourceElement: HTMLElement) => {
      activatedRef.current = true;
      const item = dragItemRef.current!;

      // Set selection in game state
      if (item.type === 'hand' || item.type === 'board') {
        setSelection({ type: item.type, index: item.index });
      }

      // Compute ghost offset so it picks up from where the finger/cursor grabbed
      const sourceRect = sourceElement.getBoundingClientRect();
      ghostOffsetRef.current = {
        x: clientX - sourceRect.left,
        y: clientY - sourceRect.top,
      };

      // Reset tilt state
      prevClientXRef.current = clientX;
      smoothedRotRef.current = 0;

      // Compute the initial ghost position (at source card location).
      // This is stored in a ref and applied by the ghost's ref callback
      // during React's commit phase — before the browser paints.
      const initialX = sourceRect.left;
      const initialY = sourceRect.top;
      initialTransformRef.current = `translate(${initialX}px, ${initialY}px) scale(1.08) rotate(0deg)`;

      // Trigger React render to mount the ghost element
      setActiveId(item.id);
    },
    [setSelection],
  );

  // ----- Cleanup helper -----

  const cleanup = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = 0;
    }
    dragItemRef.current = null;
    sourceElementRef.current = null;
    activatedRef.current = false;
    currentOverRef.current = null;
    pointerIdRef.current = -1;
    initialTransformRef.current = '';
    setHoveredZoneId(null);
    setActiveId(null);
  }, []);

  // ----- Drop logic -----

  const handleDrop = useCallback(
    (clientX: number, clientY: number) => {
      const item = dragItemRef.current;
      if (!item) return;

      const zone = hitTest(clientX, clientY);
      if (!zone) return;

      const { type: destType } = zone.data;

      if (destType === 'ash-pile') {
        if (item.type === 'hand') pitchHandCard(item.index);
        else if (item.type === 'board') pitchBoardUnit(item.index);
        setSelection(null);
        return;
      }

      if (destType === 'board-slot' && zone.data.index !== undefined) {
        const destIndex = zone.data.index;
        if (item.type === 'hand') {
          playHandCard(item.index, destIndex);
        } else if (item.type === 'board' && item.index !== destIndex) {
          swapBoardPositions(item.index, destIndex);
        } else {
          setSelection(null);
        }
      }
    },
    [hitTest, pitchHandCard, pitchBoardUnit, playHandCard, swapBoardPositions, setSelection],
  );

  // ----- Document-level pointer handlers -----
  // Stored in refs to avoid stale closure issues with document event listeners.

  const onPointerMoveRef = useRef<(e: PointerEvent) => void>(() => {});
  const onPointerUpRef = useRef<(e: PointerEvent) => void>(() => {});

  onPointerMoveRef.current = (e: PointerEvent) => {
    if (e.pointerId !== pointerIdRef.current) return;

    const { clientX, clientY } = e;
    const dx = clientX - pointerStartRef.current.x;
    const dy = clientY - pointerStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!activatedRef.current) {
      if (pointerTypeRef.current === 'touch') {
        // Touch: if moved too far before hold timer fires, cancel
        if (dist > 12) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = 0;
          document.removeEventListener('pointermove', stablePointerMove);
          document.removeEventListener('pointerup', stablePointerUp);
          document.removeEventListener('pointercancel', stablePointerUp);
          dragItemRef.current = null;
          sourceElementRef.current = null;
        }
        return;
      } else {
        // Mouse: activate after 5px distance
        if (dist < 5) return;
        activate(clientX, clientY, sourceElementRef.current!);
      }
    }

    e.preventDefault();
    positionGhost(clientX, clientY);

    // Hit-test for hover feedback
    const zone = hitTest(clientX, clientY);
    const newOverId = zone?.id ?? null;
    if (newOverId !== currentOverRef.current) {
      currentOverRef.current = newOverId;
      setHoveredZoneId(newOverId);
    }
  };

  onPointerUpRef.current = (e: PointerEvent) => {
    if (e.pointerId !== pointerIdRef.current) return;

    document.removeEventListener('pointermove', stablePointerMove);
    document.removeEventListener('pointerup', stablePointerUp);
    document.removeEventListener('pointercancel', stablePointerUp);

    if (activatedRef.current) {
      handleDrop(e.clientX, e.clientY);
    }

    cleanup();
  };

  // Stable references that delegate to the mutable ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePointerMove = useCallback(
    ((e: PointerEvent) => onPointerMoveRef.current(e)) as (e: PointerEvent) => void,
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePointerUp = useCallback(
    ((e: PointerEvent) => onPointerUpRef.current(e)) as (e: PointerEvent) => void,
    [],
  );

  // ----- Primary pointer down handler -----

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: string, data: { type: string; index: number }) => {
      if (dragItemRef.current) return;
      if (e.button !== 0) return;

      pointerIdRef.current = e.pointerId;
      pointerTypeRef.current = e.pointerType;
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      dragItemRef.current = { id, type: data.type, index: data.index };
      sourceElementRef.current = e.currentTarget as HTMLElement;
      activatedRef.current = false;

      document.addEventListener('pointermove', stablePointerMove);
      document.addEventListener('pointerup', stablePointerUp);
      document.addEventListener('pointercancel', stablePointerUp);

      if (e.pointerType === 'touch') {
        const sourceElement = e.currentTarget as HTMLElement;
        const startX = e.clientX;
        const startY = e.clientY;
        holdTimerRef.current = window.setTimeout(() => {
          holdTimerRef.current = 0;
          if (dragItemRef.current) {
            activate(startX, startY, sourceElement);
          }
        }, 200);
      }
    },
    [stablePointerMove, stablePointerUp, activate],
  );

  // ----- Body scroll lock -----

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

  // ----- Get the card being dragged -----

  const getActiveCard = useCallback((): CardView | BoardUnitView | null => {
    if (!activeId || !view) return null;
    const [type, indexStr] = activeId.split('-');
    const index = parseInt(indexStr);
    if (type === 'hand') return view.hand[index] ?? null;
    if (type === 'board') return view.board[index] ?? null;
    return null;
  }, [activeId, view]);

  return {
    activeId,
    hoveredZoneId,
    initialTransformRef,
    registerDropZone,
    unregisterDropZone,
    handlePointerDown,
    getActiveCard,
  };
}

// ---------------------------------------------------------------------------
// DragProvider — wraps children with context and renders the ghost
// ---------------------------------------------------------------------------

export function DragProvider({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const {
    activeId,
    hoveredZoneId,
    initialTransformRef,
    registerDropZone,
    unregisterDropZone,
    handlePointerDown,
    getActiveCard,
  } = useDragEngine(containerRef, ghostRef);

  const activeCard = getActiveCard();

  // Ref callback for the ghost div: positions it at the source card location
  // during React's commit phase — before the browser paints — so there is
  // never a frame where the ghost is visible at (0,0).
  const setGhostRef = useCallback(
    (node: HTMLDivElement | null) => {
      ghostRef.current = node;
      if (node && initialTransformRef.current) {
        node.style.transform = initialTransformRef.current;
        initialTransformRef.current = '';
      }
    },
    [initialTransformRef],
  );

  const contextValue: DragContextValue = {
    activeId,
    hoveredZoneId,
    containerRef,
    registerDropZone,
    unregisterDropZone,
    handlePointerDown,
  };

  return (
    <DragContext.Provider value={contextValue}>
      {children}
      {activeCard && (
        <div
          ref={setGhostRef}
          className="drag-ghost"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 9999,
            willChange: 'transform',
          }}
        >
          <UnitCard
            card={activeCard}
            showCost={activeId?.startsWith('hand')}
            showPitch={true}
            enableTilt={false}
            enableWobble={false}
          />
        </div>
      )}
    </DragContext.Provider>
  );
}
