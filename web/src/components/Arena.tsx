import { useGameStore } from '../store/gameStore';
import { UnitCard, EmptySlot } from './UnitCard';

export function Arena() {
  const { view, selection, setSelection, placeUnit, returnUnit, pitchBoardUnit, swapBoardPositions } = useGameStore();

  if (!view) return null;

  const handleBoardSlotClick = (index: number) => {
    const unit = view.board[index];

    // If we have a bench unit selected, try to place it
    if (selection?.type === 'bench') {
      if (!unit) {
        placeUnit(selection.index, index);
      }
      return;
    }

    // If we have a board unit selected, try to swap
    if (selection?.type === 'board' && selection.index !== index) {
      swapBoardPositions(selection.index, index);
      return;
    }

    // Select/deselect this board slot
    if (unit) {
      if (selection?.type === 'board' && selection.index === index) {
        setSelection(null);
      } else {
        setSelection({ type: 'board', index });
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 py-4">
      {/* Enemy Board (placeholder during shop, shown during battle) */}
      <div className="flex gap-2 opacity-50">
        <div className="text-sm text-gray-500 mr-4 self-center">Enemy</div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="slot w-20 h-28 slot-empty">
            <span className="text-gray-600 text-xs">?</span>
          </div>
        ))}
      </div>

      {/* VS Divider */}
      <div className="text-2xl text-gray-500 font-bold">VS</div>

      {/* Player Board */}
      <div className="flex gap-2">
        <div className="text-sm text-gray-400 mr-4 self-center">Board</div>
        {view.board.map((unit, i) => (
          unit ? (
            <UnitCard
              key={unit.id}
              card={unit}
              showCost={false}
              isSelected={selection?.type === 'board' && selection.index === i}
              onClick={() => handleBoardSlotClick(i)}
            />
          ) : (
            <EmptySlot
              key={`empty-${i}`}
              onClick={() => handleBoardSlotClick(i)}
              isTarget={selection?.type === 'bench'}
              label={`Slot ${i + 1}`}
            />
          )
        ))}
      </div>

      {/* Action buttons for selected board unit */}
      {selection?.type === 'board' && view.board[selection.index] && (
        <div className="flex gap-2">
          <button
            onClick={() => returnUnit(selection.index)}
            className="btn btn-primary text-sm"
          >
            Return to Bench
          </button>
          <button
            onClick={() => pitchBoardUnit(selection.index)}
            className="btn btn-danger text-sm"
          >
            Pitch (+{view.board[selection.index]?.pitchValue})
          </button>
        </div>
      )}
    </div>
  );
}
