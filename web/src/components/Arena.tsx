import { useGameStore } from '../store/gameStore';
import React from 'react';
import { UnitCard, EmptySlot } from './UnitCard';

export function Arena() {
  const { view, selection, setSelection, pitchBoardUnit, swapBoardPositions, buyCard } = useGameStore();
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `board-${index}`);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');

    if (data.startsWith('board-') && draggedIndex !== null && draggedIndex !== dropIndex) {
      // Board card dropped on board position - swap
      swapBoardPositions(draggedIndex, dropIndex);
    } else if (data.startsWith('shop-')) {
      // Shop card dropped on board position - buy
      const shopIndex = parseInt(data.split('-')[1]);
      // First check if we can buy this card
      if (view && view.canAfford[shopIndex]) {
        buyCard(shopIndex);
        // The card will be placed in the first available board slot
        // But we want it to go to the specific dropIndex
        // This might need backend changes to support placing in specific slots
      }
    }

    setDraggedIndex(null);
  };

  if (!view) return null;

  // Defensive check for board array
  if (!view.board || !Array.isArray(view.board)) {
    console.error('Arena: view.board is invalid:', view.board);
    return <div className="text-red-500">Error: Board data not available</div>;
  }



  const handleBoardSlotClick = (index: number) => {
    const unit = view.board[index];

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

      {/* Player Board - reversed to match battle layout (5 4 3 2 1) */}
      <div className="flex gap-2">
        <div className="text-sm text-gray-400 mr-4 self-center">Board</div>
        {Array.from({ length: 5 }).map((_, displayIndex) => {
          // Convert display index to array index: display 0 = position 5 = array index 4
          // display 1 = position 4 = array index 3, etc.
          const arrayIndex = 4 - displayIndex;
          const unit = view.board[arrayIndex];
          const displayPosition = 5 - displayIndex; // 5, 4, 3, 2, 1 for labels

          return unit ? (
            <UnitCard
              key={unit.id}
              card={unit}
              showCost={false}
              isSelected={selection?.type === 'board' && selection.index === arrayIndex}
              onClick={() => handleBoardSlotClick(arrayIndex)}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, arrayIndex)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, arrayIndex)}
            />
          ) : (
            <EmptySlot
              key={`empty-${arrayIndex}`}
              onClick={() => handleBoardSlotClick(arrayIndex)}
              isTarget={false}
              label={`${displayPosition}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, arrayIndex)}
            />
          );
        })}
      </div>

      {/* Action buttons for selected board unit */}
      {selection?.type === 'board' && view.board[selection.index] && (
        <div className="flex gap-2">
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
