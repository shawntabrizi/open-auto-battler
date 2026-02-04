import { useGameStore } from '../store/gameStore';
import { DraggableCard, DroppableBoardSlot, DroppableEmptySlot } from './DndComponents';

export function Arena() {
  const { view, selection, setSelection, pitchBoardUnit } = useGameStore();

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
      setSelection(null);
    }
  };

  return (
    <div className="arena flex-1 flex flex-col items-center justify-center gap-4 py-4">
      <div className="board-row flex gap-2">
        <div className="board-label text-sm text-gray-400 mr-4 self-center">Board</div>
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

      {selection?.type === 'board' && view.board[selection.index] && (
        <div className="flex gap-2">
          <button
            onClick={() => pitchBoardUnit(selection.index)}
            className="btn btn-danger text-sm"
          >
            Pitch (+{view.board[selection.index]?.pitch_value})
          </button>
        </div>
      )}
    </div>
  );
}
