import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import { DraggableCard, DroppableBoardSlot, DroppableEmptySlot } from './DndComponents';
import { CARD_SIZES } from '../constants/cardSizes';

export function Arena() {
  const { view, selection, setSelection, playHandCard } = useGameStore();
  const boardBg = useCustomizationStore((s) => s.selections.boardBackground);
  const [placedSlot, setPlacedSlot] = useState<number | null>(null);
  const prevBoardRef = useRef(view?.board ?? null);

  // Detect when a new unit appears on the board for placement animation
  useEffect(() => {
    if (!view?.board) return;
    const prev = prevBoardRef.current;
    if (prev) {
      for (let i = 0; i < 5; i++) {
        if (!prev[i] && view.board[i]) {
          setPlacedSlot(i);
          const timer = setTimeout(() => setPlacedSlot(null), 400);
          prevBoardRef.current = view.board;
          return () => clearTimeout(timer);
        }
      }
    }
    prevBoardRef.current = view.board;
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
      // Toggle selection or switch to this board unit
      if (selection?.type === 'board' && selection.index === index) {
        setSelection(null);
      } else {
        setSelection({ type: 'board', index });
      }
    } else {
      // Clicked an empty slot
      if (selection?.type === 'hand') {
        // Place the selected hand card on this slot
        playHandCard(selection.index, index);
      } else {
        setSelection(null);
      }
    }
  };

  return (
    <div
      className="arena flex-1 flex flex-col items-center justify-center relative"
      style={boardBg ? {
        backgroundImage: `url(${boardBg.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      {boardBg && <div className="absolute inset-0 bg-board-bg/50" />}

      {/* Arena surface — visual frame that gives the board a sense of place */}
      <div className="arena-surface relative z-10 flex flex-col items-center gap-3 lg:gap-4 px-6 lg:px-12 py-4 lg:py-8 rounded-xl">
        {/* Board header */}
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="h-px w-8 lg:w-16 bg-gradient-to-r from-transparent to-warm-600/40" />
          <span className="board-label text-xs lg:text-sm text-warm-400 font-heading uppercase tracking-[0.2em]">
            Staging Area
          </span>
          <div className="h-px w-8 lg:w-16 bg-gradient-to-l from-transparent to-warm-600/40" />
        </div>

        {/* Unit count / hint */}
        <div className="text-[0.6rem] lg:text-xs text-warm-500/70 font-body">
          {unitCount === 0
            ? hasHandSelection
              ? 'Select a slot to place your unit'
              : 'Select a card from your hand to begin'
            : `${unitCount}/5 units deployed`}
        </div>

        {/* Board row */}
        <div className="board-row flex gap-2 lg:gap-3">
          {Array.from({ length: 5 }).map((_, displayIndex) => {
            const arrayIndex = 4 - displayIndex;
            const unit = view.board[arrayIndex];
            const slotId = `board-slot-${arrayIndex}`;

            return (
              <DroppableBoardSlot key={slotId} id={slotId}>
                {unit ? (
                  <div className={placedSlot === arrayIndex ? 'animate-card-land' : ''}>
                    <DraggableCard
                      id={`board-${arrayIndex}`}
                      card={unit}
                      showCost={false}
                      showPitch={true}
                      isSelected={selection?.type === 'board' && selection.index === arrayIndex}
                      onClick={() => handleBoardSlotClick(arrayIndex)}
                    />
                  </div>
                ) : (
                  <DroppableEmptySlot
                    id={slotId}
                    onClick={() => handleBoardSlotClick(arrayIndex)}
                    isTarget={hasHandSelection}
                  />
                )}
              </DroppableBoardSlot>
            );
          })}
        </div>

        {/* Position indicator — slot-aligned */}
        <div className="flex gap-2 lg:gap-3">
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
