import { useState, useLayoutEffect, useRef, useReducer } from 'react';
import { useGameStore } from '../store/gameStore';
import { useAudioStore } from '../store/audioStore';
import { useCustomizationStore } from '../store/customizationStore';
import { DraggableCard, DroppableBoardSlot } from './DndComponents';
import { UnitCard, EmptySlot } from './UnitCard';
import { CARD_SIZES } from '../constants/cardSizes';
import ashpileIcon from '../../ashpile.svg';
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
  const { view, selection, setSelection, playHandCard, swapBoardPositions, pitchBoardUnit, undo } = useGameStore();
  const playSfx = useAudioStore((s) => s.playSfx);
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
  const selectedBoardUnit = selection?.type === 'board' ? view.board[selection.index] : null;

  // Ability cycling for mobile bottom bar
  const [abilityIdx, setAbilityIdx] = useState(0);
  const prevSelKey = useRef<string | null>(null);
  const boardSelKey = selectedBoardUnit ? `${selectedBoardUnit.id}-${selection?.index}` : null;
  if (boardSelKey !== prevSelKey.current) {
    prevSelKey.current = boardSelKey;
    if (abilityIdx !== 0) setAbilityIdx(0);
  }

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
      className="arena flex-1 flex flex-col items-center justify-center relative"
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
                      <div
                        className={`${animClass} ${isOver && !animClass ? 'swap-target' : ''}`}
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

      {/* Mobile board tab: ability info + pitch + undo */}
      <div className="lg:hidden flex-shrink-0 flex items-center gap-2 px-2 py-1 bg-warm-900/95 border-t border-warm-700/50 w-full">
        <div
          className="flex-1 min-w-0 mr-2 cursor-pointer"
          onClick={() => {
            if (selectedBoardUnit && selectedBoardUnit.abilities.length > 1) {
              setAbilityIdx((i) => (i + 1) % selectedBoardUnit.abilities.length);
            }
          }}
        >
          {selectedBoardUnit && selectedBoardUnit.abilities.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-warm-300 italic truncate flex-1 min-w-0">
                <span className="text-amber-400 font-bold not-italic">{selectedBoardUnit.abilities[abilityIdx % selectedBoardUnit.abilities.length].name}:</span>{' '}
                {selectedBoardUnit.abilities[abilityIdx % selectedBoardUnit.abilities.length].description}
              </p>
              {selectedBoardUnit.abilities.length > 1 && (
                <div className="flex-shrink-0 flex items-center gap-0.5">
                  {selectedBoardUnit.abilities.map((_, i) => (
                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === abilityIdx % selectedBoardUnit.abilities.length ? 'bg-amber-400' : 'bg-warm-600'}`} />
                  ))}
                </div>
              )}
            </div>
          ) : selectedBoardUnit ? (
            <p className="text-xs text-warm-500 italic">No abilities</p>
          ) : (
            <p className="text-xs text-warm-500 italic">Tap a unit to see details</p>
          )}
        </div>
        {/* Pitch button — drop-zone style */}
        <button
          onClick={() => {
            if (selection?.type === 'board') {
              playSfx('pitch-burn');
              pitchBoardUnit(selection.index);
              setSelection(null);
            }
          }}
          disabled={!selectedBoardUnit}
          className={`flex-shrink-0 h-10 px-5 rounded-none flex items-center gap-2 border-2 border-dashed transition-colors ${
            selectedBoardUnit
              ? 'bg-warm-800/80 border-warm-500/40 active:bg-warm-700/80'
              : 'bg-warm-800/50 border-warm-700/30 opacity-40 cursor-not-allowed'
          }`}
          title="Pitch unit"
        >
          <img src={ashpileIcon} alt="Pitch" className={`w-6 h-6 ${selectedBoardUnit ? 'opacity-90' : 'opacity-40'}`} />
          <span className={`text-[0.6rem] font-bold uppercase ${selectedBoardUnit ? 'text-red-400' : 'text-warm-600'}`}>
            Pitch
          </span>
        </button>
        {/* Undo button */}
        <button
          onClick={undo}
          disabled={!view.can_undo}
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            view.can_undo
              ? 'bg-warm-700 text-warm-200 active:bg-warm-600'
              : 'bg-warm-800 text-warm-600 cursor-not-allowed'
          }`}
          title="Undo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
