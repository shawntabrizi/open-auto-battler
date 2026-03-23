import { useLayoutEffect, useRef, useReducer, useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import { DraggableCard, DroppableBoardSlot } from './DndComponents';
import { GAME_SHORTCUTS } from './GameKeyboardShortcuts';
import { UnitCard, EmptySlot } from './UnitCard';
import type { BoardUnitView } from '../types';
import { computeHandInsertShift, computeSlotShift } from '../utils/boardShift';

type SlotAnim = 'placed' | { type: 'swapped'; fromIndex: number };
type AnimState = { anims: Map<number, SlotAnim>; exits: Map<number, BoardUnitView> };
const EMPTY_ANIM: AnimState = { anims: new Map(), exits: new Map() };

const BOARD_HINT_TEXT = {
  selectCard: 'Select a card',
  placeFirstUnit: 'Now tap a board slot to place your unit',
  placeUnit: 'Tap a board slot to place your unit',
  repositionBoardCard: 'Reposition this board card or burn it for mana',
  boardFull: 'Board full - burn a unit to make room',
  notEnoughMana: 'Not enough mana to buy - burn a card or unit for mana',
  cannotBuyThisRound:
    'Cannot buy this card this round - burn it for mana or let it return to your bag next round',
} as const;

const BOARD_HINT_TONE_CLASS = {
  default: 'text-base-200/90',
  selected: 'text-base-100',
  warning: 'text-accent',
  danger: 'text-negative',
} as const;

interface BoardHintParams {
  unitCount: number;
  handCount: number;
  hasHandSelection: boolean;
  hasBoardSelection: boolean;
  canPlaceSelectedHand: boolean;
  cannotBuySelectedHandThisRound: boolean;
}

function getBoardHintState({
  unitCount,
  handCount,
  hasHandSelection,
  hasBoardSelection,
  canPlaceSelectedHand,
  cannotBuySelectedHandThisRound,
}: BoardHintParams) {
  if (hasBoardSelection) {
    return {
      text: BOARD_HINT_TEXT.repositionBoardCard,
      toneClass: BOARD_HINT_TONE_CLASS.selected,
    };
  }

  if (hasHandSelection) {
    if (cannotBuySelectedHandThisRound) {
      return {
        text: BOARD_HINT_TEXT.cannotBuyThisRound,
        toneClass: BOARD_HINT_TONE_CLASS.danger,
      };
    }

    if (canPlaceSelectedHand) {
      return {
        text: unitCount === 0 ? BOARD_HINT_TEXT.placeFirstUnit : BOARD_HINT_TEXT.placeUnit,
        toneClass: BOARD_HINT_TONE_CLASS.default,
      };
    }

    return {
      text: BOARD_HINT_TEXT.notEnoughMana,
      toneClass: BOARD_HINT_TONE_CLASS.warning,
    };
  }

  if (unitCount >= 5 && handCount > 0) {
    return {
      text: BOARD_HINT_TEXT.boardFull,
      toneClass: BOARD_HINT_TONE_CLASS.default,
    };
  }

  return {
    text: BOARD_HINT_TEXT.selectCard,
    toneClass: BOARD_HINT_TONE_CLASS.default,
  };
}

/** Compare previous and current COMMITTED board to detect placed/exit changes. */
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
      const fromIndex = prev.findIndex((p) => p && p.id === currUnit.id);
      if (fromIndex === -1) {
        // New card from hand — placement bounce
        anims.set(i, 'placed');
      }
      // Board-to-board moves are handled by FLIP, not CSS animation
    } else if (prevUnit && !currUnit) {
      const stillOnBoard = curr.some((c) => c && c.id === prevUnit.id);
      if (!stillOnBoard) {
        exits.set(i, prevUnit);
      }
    }
  }

  return anims.size > 0 || exits.size > 0 ? { anims, exits } : null;
}

export function Arena() {
  const {
    view,
    selection,
    setSelection,
    playHandCard,
    swapBoardPositions,
    showBoardHelper,
    dragShift,
  } = useGameStore();
  // playHandCard now handles occupied slots via engine-side shifting
  const boardBg = useCustomizationStore((s) => s.selections.boardBackground);

  // --- Board change detection (for placed/exit CSS animations only) ---
  const prevBoardRef = useRef<(BoardUnitView | null)[]>([]);
  const animRef = useRef<AnimState>(EMPTY_ANIM);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  // Detect placed/exit changes on committed board only
  if (view?.board && prevBoardRef.current.length > 0) {
    const detected = detectBoardChanges(prevBoardRef.current, view.board);
    if (detected) {
      animRef.current = detected;
      prevBoardRef.current = [...view.board];
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

  // --- Slot stride measurement for CSS transform shifting ---
  const boardRowRef = useRef<HTMLDivElement>(null);
  const [slotStride, setSlotStride] = useState(0);

  const hasView = !!view;
  useEffect(() => {
    const row = boardRowRef.current;
    if (!row) return;

    const measure = () => {
      const slots = row.children;
      if (slots.length >= 2) {
        const first = slots[0].getBoundingClientRect();
        const second = slots[1].getBoundingClientRect();
        setSlotStride(second.left - first.left);
      }
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [hasView]);

  if (!view) return null;

  if (!view.board || !Array.isArray(view.board)) {
    return <div className="text-negative">Error: Board data not available</div>;
  }

  // Use committed board for hint calculations (not preview)
  const unitCount = view.board.filter(Boolean).length;
  const handCount = view.hand?.filter(Boolean).length ?? 0;
  const hasHandSelection = selection?.type === 'hand';
  const hasBoardSelection = selection?.type === 'board';
  const selectedHandCard = selection?.type === 'hand' ? view.hand[selection.index] : null;
  const canPlaceSelectedHand =
    selection?.type === 'hand' ? Boolean(view.can_afford[selection.index]) : false;
  const cannotBuySelectedHandThisRound = Boolean(
    selectedHandCard && selectedHandCard.play_cost > view.mana_limit
  );
  const boardHint = getBoardHintState({
    unitCount,
    handCount,
    hasHandSelection,
    hasBoardSelection,
    canPlaceSelectedHand,
    cannotBuySelectedHandThisRound,
  });

  const handleBoardSlotClick = (index: number) => {
    const unit = view.board[index];

    if (unit) {
      if (selection?.type === 'board' && selection.index === index) {
        // Tap same unit again — deselect
        setSelection(null);
      } else if (selection?.type === 'hand') {
        // Insert hand card at this occupied slot (engine shifts units)
        playHandCard(selection.index, index);
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
      aria-label="Board"
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
      {boardBg && <div className="theme-board-overlay absolute inset-0" />}

      {/* Arena surface — visual frame that gives the board a sense of place */}
      <div className="arena-surface relative z-10 px-2 lg:px-12 py-1 lg:py-5 rounded-xl w-full h-full min-h-0">
        {/* Board header */}
        <div className="board-helper board-helper--header theme-panel hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 z-20 items-center gap-3 lg:gap-4 rounded-full border border-accent/20 bg-surface-dark/55 px-3 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm">
          <div className="h-px w-8 lg:w-16 bg-gradient-to-r from-transparent to-base-600/40" />
          <span className="board-label theme-title-text font-title text-sm lg:text-xl font-bold uppercase tracking-[0.28em] text-transparent bg-clip-text [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]">
            Board
          </span>
          <div className="h-px w-8 lg:w-16 bg-gradient-to-l from-transparent to-base-600/40" />
        </div>

        {/* Shortcut hint */}
        <div className="board-helper board-helper--shortcuts hidden lg:flex absolute top-14 lg:top-16 left-1/2 -translate-x-1/2 z-20 w-full lg:max-w-3xl justify-center">
          <div className="theme-panel rounded-full border border-base-800/70 bg-surface-dark/55 px-4 py-1.5 text-center text-[10px] lg:text-xs text-base-200/85 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm">
            Select: {GAME_SHORTCUTS.board} • Move: {GAME_SHORTCUTS.boardMove}
          </div>
        </div>

        {showBoardHelper && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-2 lg:bottom-4">
            <div
              className={`theme-panel w-fit max-w-full rounded-full border border-base-800/70 bg-surface-dark/65 px-4 py-1.5 text-center text-[11px] font-semibold leading-tight shadow-[0_8px_22px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:px-5 sm:py-2 sm:text-sm ${
                boardHint.toneClass
              }`}
            >
              {boardHint.text}
            </div>
          </div>
        )}

        {/* Board row */}
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-2 lg:px-12"
          onClick={(event) => {
            if (event.target === event.currentTarget && selection) {
              setSelection(null);
            }
          }}
        >
          <div
            ref={boardRowRef}
            className="board-row flex gap-1 lg:gap-4 w-full lg:max-w-3xl h-[clamp(10.5rem,28vh,13rem)] lg:h-[clamp(12.5rem,32vh,16rem)]"
          >
            {(() => {
              // Hoist hand-insert shift map outside the loop — same for all slots
              const handInsertShiftMap =
                dragShift?.source === -1
                  ? computeHandInsertShift(view.board, dragShift.target)
                  : null;

              return Array.from({ length: 5 }).map((_, displayIndex) => {
              const arrayIndex = 4 - displayIndex;
              const unit = view.board[arrayIndex];
              const slotId = `board-slot-${arrayIndex}`;

              const slotAnim = slotAnimations.get(arrayIndex);
              let animClass = '';

              if (slotAnim === 'placed') {
                animClass = 'animate-card-land';
              }

              // CSS transform shifting: compute shift in array-index space,
              // negate because display order is reversed from array order
              let shift = 0;
              if (dragShift) {
                if (handInsertShiftMap) {
                  shift = handInsertShiftMap.get(arrayIndex) ?? 0;
                } else {
                  // Board-rearrange shift
                  shift = computeSlotShift(arrayIndex, dragShift.source, dragShift.target);
                }
              }
              const shiftPx = shift * -slotStride;

              return (
                <div
                  key={slotId}
                  className="flex-1 min-w-0 h-full flex items-center justify-center overflow-visible"
                  style={{ containerType: 'size' }}
                >
                  <div
                    className="relative aspect-[3/4]"
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
                                className={`relative z-10 w-full h-full ${animClass} ${isOver && !animClass && !shiftPx ? 'swap-target' : ''}`}
                                style={{
                                  transform: shiftPx ? `translateX(${shiftPx}px)` : undefined,
                                  transition: dragShift ? 'transform 0.2s ease-out' : 'none',
                                }}
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
                              isTarget={canPlaceSelectedHand}
                              isHovered={isOver}
                            />
                          )}
                        </div>
                      )}
                    </DroppableBoardSlot>
                    <div
                      className={`board-helper board-helper--positions hidden lg:flex absolute left-1/2 top-full mt-2 -translate-x-1/2 w-[92%] justify-center rounded-full border px-2 py-0.5 text-center text-[0.5rem] lg:text-xs font-heading uppercase tracking-wider shadow-[0_4px_14px_rgba(0,0,0,0.22)] backdrop-blur-sm ${
                        arrayIndex === 0
                          ? 'theme-pill border-accent/30 bg-accent/10 text-accent font-bold'
                          : 'theme-pill border-base-800/70 bg-surface-dark/45 text-base-300/80'
                      }`}
                    >
                      {arrayIndex === 0 ? 'Front' : `${arrayIndex + 1}`}
                    </div>
                  </div>
                </div>
              );
            });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
