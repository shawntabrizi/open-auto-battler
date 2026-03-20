import { useLayoutEffect, useRef, useReducer } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import { DraggableCard, DroppableBoardSlot } from './DndComponents';
import { GAME_SHORTCUTS } from './GameKeyboardShortcuts';
import { UnitCard, EmptySlot } from './UnitCard';
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
      // Only show exit animation if the unit actually left the board (burned).
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
  const handCount = view.hand?.filter(Boolean).length ?? 0;
  const hasHandSelection = selection?.type === 'hand';
  const boardHintText =
    unitCount === 0
      ? hasHandSelection
        ? 'Now tap a board slot to place your unit'
        : 'Tap a card in your hand to begin'
      : unitCount >= 5
        ? handCount > 0
          ? 'Board full \u2014 burn a unit to make room'
          : `${unitCount}/5 units deployed`
        : hasHandSelection
          ? 'Tap a slot to place your unit'
          : `${unitCount}/5 units deployed`;
  const hideBoardStatusHintOnSmallScreens = boardHintText.endsWith('units deployed');

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
      role="region"
      aria-label="Staging Area"
      className="arena flex-1 flex flex-col items-center justify-center relative min-w-0 min-h-0"
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
      <div className="arena-surface relative z-10 px-2 lg:px-12 py-1 lg:py-5 rounded-xl w-full h-full min-h-0">
        {/* Board header */}
        <div className="board-helper board-helper--header hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 z-20 items-center gap-3 lg:gap-4 rounded-full border border-warm-700/60 bg-black/45 px-3 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm">
          <div className="h-px w-8 lg:w-16 bg-gradient-to-r from-transparent to-warm-600/40" />
          <span className="board-label font-title text-sm lg:text-xl font-bold uppercase tracking-[0.28em] text-transparent bg-clip-text bg-gradient-to-r from-yellow-100 via-amber-200 to-orange-300 [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]">
            Board
          </span>
          <div className="h-px w-8 lg:w-16 bg-gradient-to-l from-transparent to-warm-600/40" />
        </div>

        {/* Contextual hint — always visible, guides new players through card placement */}
        <div
          className={`board-helper board-helper--status absolute top-14 lg:top-16 left-1/2 -translate-x-1/2 z-20 rounded-full border border-warm-800/70 bg-black/45 px-3 py-1 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm text-[0.6rem] lg:text-xs font-body text-center ${
            unitCount === 0 && !hasHandSelection
              ? 'onboarding-hint text-amber-300'
              : 'text-warm-200/85'
          } ${hideBoardStatusHintOnSmallScreens ? 'hidden lg:block' : ''}`}
        >
          {boardHintText}
        </div>

        {/* Board row */}
        <div className="absolute inset-0 z-10 flex items-center justify-center px-2 lg:px-12">
          <div className="board-row flex gap-1 lg:gap-4 w-full lg:max-w-3xl h-[clamp(10.5rem,28vh,13rem)] lg:h-[clamp(12.5rem,32vh,16rem)]">
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
                const settleSlots = arrayIndex - slotAnim.fromIndex;
                animStyle = { '--settle-slots': settleSlots } as React.CSSProperties;
              }

              return (
                <div
                  key={slotId}
                  className="flex-1 min-w-0 h-full flex items-center justify-center"
                  style={{ containerType: 'size' }}
                >
                  <div
                    className="aspect-[3/4]"
                    style={{ width: 'min(100cqw, calc(100cqh * 3 / 4))' }}
                  >
                    <DroppableBoardSlot id={slotId}>
                      {({ isOver }) => (
                        <div className="relative w-full h-full">
                          {/* Exit phantom — card that was just removed, animating out */}
                          {exitingCards.has(arrayIndex) && (
                            <div className="animate-card-exit absolute inset-0 z-10 pointer-events-none">
                              <UnitCard
                                card={exitingCards.get(arrayIndex)!}
                                showCost={false}
                                showBurn={false}
                                enableTilt={false}
                                enableWobble={false}
                              />
                            </div>
                          )}
                          {/* Current slot state */}
                          {unit ? (
                            <div className="relative w-full h-full">
                              <div className="absolute inset-0">
                                <EmptySlot isTarget={false} />
                              </div>
                              <div
                                className={`relative z-10 w-full h-full ${animClass} ${isOver && !animClass ? 'swap-target' : ''}`}
                                style={animStyle}
                              >
                                <DraggableCard
                                  id={`board-${arrayIndex}`}
                                  card={unit}
                                  showCost={false}
                                  showBurn={true}
                                  isSelected={
                                    selection?.type === 'board' && selection.index === arrayIndex
                                  }
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Position indicator — slot-aligned */}
        <div className="board-helper board-helper--positions hidden lg:flex absolute bottom-14 left-1/2 -translate-x-1/2 z-20 gap-3 lg:gap-4 w-full lg:max-w-3xl">
          {Array.from({ length: 5 }).map((_, displayIndex) => {
            const arrayIndex = 4 - displayIndex;
            const isFront = arrayIndex === 0;
            return (
              <div
                key={`pos-${arrayIndex}`}
                className={`flex-1 rounded-full border px-2 py-0.5 text-center text-[0.5rem] lg:text-xs font-heading uppercase tracking-wider shadow-[0_4px_14px_rgba(0,0,0,0.22)] backdrop-blur-sm ${
                  isFront
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 font-bold'
                    : 'border-warm-800/70 bg-black/35 text-warm-300/80'
                }`}
              >
                {isFront ? 'Front' : `${arrayIndex + 1}`}
              </div>
            );
          })}
        </div>

        <div className="board-helper board-helper--shortcuts hidden lg:flex absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full lg:max-w-3xl justify-center">
          <div className="rounded-full border border-warm-800/70 bg-black/45 px-4 py-1.5 text-center text-[10px] lg:text-xs text-warm-200/85 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm">
            Select: {GAME_SHORTCUTS.board} • Move: {GAME_SHORTCUTS.boardMove}
          </div>
        </div>
      </div>
    </div>
  );
}
