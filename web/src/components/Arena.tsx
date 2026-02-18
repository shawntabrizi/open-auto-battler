import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import { DraggableCard, DroppableBoardSlot, DroppableEmptySlot } from './DndComponents';

export function Arena() {
  const { view, selection, setSelection, playHandCard } = useGameStore();
  const boardBg = useCustomizationStore((s) => s.selections.boardBackground);

  if (!view) return null;

  if (!view.board || !Array.isArray(view.board)) {
    return <div className="text-red-500">Error: Board data not available</div>;
  }

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
      className="arena flex-1 flex flex-col items-center justify-center lg:justify-end gap-4 py-4 lg:pb-4 relative"
      style={boardBg ? {
        backgroundImage: `url(${boardBg.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      {boardBg && <div className="absolute inset-0 bg-board-bg/50" />}
      <div className="board-label text-sm text-gray-400 mb-2 relative z-10">Board</div>
      <div className="board-row flex gap-3 lg:gap-4 relative z-10">
        {Array.from({ length: 5 }).map((_, displayIndex) => {
          const arrayIndex = 4 - displayIndex;
          const unit = view.board[arrayIndex];
          const displayPosition = 5 - displayIndex;
          const slotId = `board-slot-${arrayIndex}`;

          return (
            <DroppableBoardSlot key={slotId} id={slotId}>
              {unit ? (
                <DraggableCard
                  id={`board-${arrayIndex}`}
                  card={unit}
                  showCost={false}
                  showPitch={true}
                  isSelected={selection?.type === 'board' && selection.index === arrayIndex}
                  onClick={() => handleBoardSlotClick(arrayIndex)}
                />
              ) : (
                <DroppableEmptySlot
                  id={slotId}
                  onClick={() => handleBoardSlotClick(arrayIndex)}
                  isTarget={selection?.type === 'hand'}
                  label={`${displayPosition}`}
                />
              )}
            </DroppableBoardSlot>
          );
        })}
      </div>
    </div>
  );
}
