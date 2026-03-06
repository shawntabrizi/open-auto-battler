import { useLayoutEffect, useRef, useReducer } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import { DraggableCard, DroppableBoardSlot } from './DndComponents';
import { UnitCard, EmptySlot } from './UnitCard';
import { CARD_SIZES } from '../constants/cardSizes';
import type { BoardUnitView } from '../types';

type SlotAnim = 'placed' | { type: 'swapped'; fromIndex: number };
type AnimState = { anims: Map<number, SlotAnim>; exits: Map<number, BoardUnitView> };
const EMPTY_ANIM: AnimState = { anims: new Map(), exits: new Map() };

/** Compare previous and current board to classify each slot's change. */
function detectBoardChanges(
  prev: (BoardUnitView | null)[],
  curr: (BoardUnitView | null)[]
): AnimState | null {
  const anims = new Map<number, SlotAnim>();
  const exits = new Map<number, BoardUnitView>();

  for (let i = 0; i < 5; i++) {
    const prevUnit = prev[i];
    const currUnit = curr[i];

    if (!prevUnit && currUnit) {
      // Check if this unit was already on the board (board-to-board move)
      const fromIndex = prev.findIndex((p) => p && p.id === currUnit.id);
      if (fromIndex !== -1) {
        // Moved from another slot — slide, don't scale-bounce
        anims.set(i, { type: 'swapped', fromIndex });
      } else {
        // New card from hand — placement bounce
        anims.set(i, 'placed');
      }
    } else if (prevUnit && !currUnit) {
      // Only show exit animation if the unit actually left the board (pitched).
      // If it just moved to another slot, no phantom needed.
      const stillOnBoard = curr.some((c) => c && c.id === prevUnit.id);
      if (!stillOnBoard) {
        exits.set(i, prevUnit);
      }
    } else if (prevUnit && currUnit && prevUnit.id !== currUnit.id) {
      const fromIndex = prev.findIndex((p) => p && p.id === currUnit.id);
      anims.set(i, { type: 'swapped', fromIndex: fromIndex !== -1 ? fromIndex : i });
    }
  }

  return anims.size > 0 || exits.size > 0 ? { anims, exits } : null;
}

export function Arena() {
  const { view, selection, setSelection, playHandCard, swapBoardPositions } = useGameStore();
  const boardBg = useCustomizationStore((s) => s.selections.boardBackground);

  // --- Board change detection (ref-only, zero extra re-renders) ---
  // All animation state lives in refs. Detection happens during render so
  // animation classes are present from the FIRST frame. The only state-driven
  // re-render is the cleanup tick 450ms later when animations expire.
  const prevBoardRef = useRef<(BoardUnitView | null)[]>([]);
  const animRef = useRef<AnimState>(EMPTY_ANIM);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  // Detect changes during render — animation classes applied on this very frame.
  // Writing to refs during render is safe here because detection is idempotent:
  // once prevBoardRef is updated, the same board won't re-detect.
  if (view?.board && prevBoardRef.current.length > 0) {
    const detected = detectBoardChanges(prevBoardRef.current, view.board);
    if (detected) {
      animRef.current = detected;
      prevBoardRef.current = [...view.board];
      // Schedule cleanup: clear animations after they've played
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = setTimeout(() => {
        animRef.current = EMPTY_ANIM;
        cleanupTimerRef.current = null;
        forceRender();
      }, 450);
    }
  }

  const slotAnimations = animRef.current.anims;
  const exitingCards = animRef.current.exits;

  // Initialize prevBoardRef on first render with board data
  useLayoutEffect(() => {
    if (view?.board && prevBoardRef.current.length === 0) {
      prevBoardRef.current = [...view.board];
    }
  }, [view?.board]);

  if (!view) return null;

  if (!view.board || !Array.isArray(view.board)) {
    return <div className="text-red-500">Error: Board data not available</div>;
  }

  const unitCount = view.board.filter(Boolean).length;
  const hasHandSelection = selection?.type === 'hand';

  const handleBoardSlotClick = (index: number) => {
    const unit = view.board[index];

    if (unit) {
      if (selection?.type === 'board' && selection.index === index) {
        // Tap same unit again — deselect
        setSelection(null);
      } else {
        // Select this board unit (show abilities); swap only via drag-and-drop
        setSelection({ type: 'board', index });
      }
    } else {
      // Clicked an empty slot
      if (selection?.type === 'hand') {
        // Place the selected hand card on this slot
        playHandCard(selection.index, index);
      } else if (selection?.type === 'board') {
        // Move selected board unit to empty slot
        swapBoardPositions(selection.index, index);
      } else {
        setSelection(null);
      }
    }
  };

  return (
    <div
      className="arena flex-1 flex flex-col items-center justify-center relative min-w-0"
      style={
        boardBg
          ? {
              backgroundImage: `url(${boardBg.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {boardBg && <div className="absolute inset-0 bg-board-bg/50" />}

      {/* Arena surface — visual frame that gives the board a sense of place */}
      <div className="arena-surface relative z-10 flex flex-col items-center gap-1 lg:gap-4 px-2 lg:px-12 py-1 lg:py-8 rounded-xl">
        {/* Board header */}
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="h-px w-8 lg:w-16 bg-gradient-to-r from-transparent to-warm-600/40" />
          <span className="board-label text-xs lg:text-sm text-warm-400 font-heading uppercase tracking-[0.2em]">
            Staging Area
          </span>
          <div className="h-px w-8 lg:w-16 bg-gradient-to-l from-transparent to-warm-600/40" />
        </div>

        {/* Unit count / hint */}
        <div className="hidden lg:block text-[0.6rem] lg:text-xs text-warm-500/70 font-body">
          {unitCount === 0
            ? hasHandSelection
              ? 'Select a slot to place your unit'
              : 'Select a card from your hand to begin'
            : `${unitCount}/5 units deployed`}
        </div>

        {/* Board row */}
        <div className="board-row flex gap-1 lg:gap-4">
          {Array.from({ length: 5 }).map((_, displayIndex) => {
            const arrayIndex = 4 - displayIndex;
            const unit = view.board[arrayIndex];
            const slotId = `board-slot-${arrayIndex}`;

            const slotAnim = slotAnimations.get(arrayIndex);
            let animClass = '';
            let animStyle: React.CSSProperties | undefined;

            if (slotAnim === 'placed') {
              animClass = 'animate-card-land';
            } else if (typeof slotAnim === 'object' && slotAnim.type === 'swapped') {
              animClass = 'animate-card-settle';
              // --settle-slots: how many display-slots away the card came from.
              // Board is reversed: displayIndex = 4 - arrayIndex.
              // settleSlots = toArrayIndex - fromArrayIndex gives the correct
              // screen-space direction (negative = came from left, positive = came from right).
              const settleSlots = arrayIndex - slotAnim.fromIndex;
              animStyle = { '--settle-slots': settleSlots } as React.CSSProperties;
            }

            return (
              <DroppableBoardSlot key={slotId} id={slotId}>
                {({ isOver }) => (
                  <div className="relative">
                    {/* Exit phantom — card that was just removed, animating out */}
                    {exitingCards.has(arrayIndex) && (
                      <div className="animate-card-exit absolute inset-0 z-10 pointer-events-none">
                        <UnitCard
                          card={exitingCards.get(arrayIndex)!}
                          showCost={false}
                          showPitch={false}
                          enableTilt={false}
                          enableWobble={false}
                        />
                      </div>
                    )}
                    {/* Current slot state */}
                    {unit ? (
                      <div className="relative">
                        <div className="absolute inset-0">
                          <EmptySlot isTarget={false} />
                        </div>
                        <div
                          className={`relative z-10 ${animClass} ${isOver && !animClass ? 'swap-target' : ''}`}
                          style={animStyle}
                        >
                          <DraggableCard
                            id={`board-${arrayIndex}`}
                            card={unit}
                            showCost={false}
                            showPitch={true}
                            isSelected={selection?.type === 'board' && selection.index === arrayIndex}
                            onClick={() => handleBoardSlotClick(arrayIndex)}
                            enableWobble={false}
                          />
                        </div>
                      </div>
                    ) : (
                      <EmptySlot
                        onClick={() => handleBoardSlotClick(arrayIndex)}
                        isTarget={hasHandSelection}
                        isHovered={isOver}
                      />
                    )}
                  </div>
                )}
              </DroppableBoardSlot>
            );
          })}
        </div>

        {/* Position indicator — slot-aligned */}
        <div className="hidden lg:flex gap-3 lg:gap-4">
          {Array.from({ length: 5 }).map((_, displayIndex) => {
            const arrayIndex = 4 - displayIndex;
            const isFront = arrayIndex === 0;
            return (
              <div
                key={`pos-${arrayIndex}`}
                className={`${CARD_SIZES.standard.widthTw} text-center text-[0.5rem] lg:text-xs font-heading uppercase tracking-wider ${
                  isFront ? 'text-amber-400/70 font-bold' : 'text-warm-600/40'
                }`}
              >
                {isFront ? 'Front' : `${arrayIndex + 1}`}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
