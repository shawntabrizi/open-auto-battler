import { useGameStore } from '../store/gameStore';
import React from 'react';
import { UnitCard, EmptySlot } from './UnitCard';

export function Arena() {
  const { view, selection, setSelection, pitchBoardUnit, swapBoardPositions, buyAndPlace } =
    useGameStore();
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
      // Swapping existing units is still allowed via Drag and Drop
      swapBoardPositions(draggedIndex, dropIndex);
    } else if (data.startsWith('shop-')) {
      const shopIndex = parseInt(data.split('-')[1]);
      buyAndPlace(shopIndex, dropIndex);
    }

    setDraggedIndex(null);
  };

  if (!view) return null;

  if (!view.board || !Array.isArray(view.board)) {
    return <div className="text-red-500">Error: Board data not available</div>;
  }

  const handleBoardSlotClick = (index: number) => {
    const unit = view.board[index];

    // If we have a shop card selected, we still allow "Click to Place" 
    // because the user intent to buy is specific.
    if (selection?.type === 'shop') {
      buyAndPlace(selection.index, index);
      return;
    }

    // DISBALED: swapBoardPositions on click. 
    // Clicking a board unit now only handles selection/inspection.
    if (unit) {
      if (selection?.type === 'board' && selection.index === index) {
        setSelection(null);
      } else {
        setSelection({ type: 'board', index });
      }
    } else {
      // Clicked an empty slot with no shop card selected
      setSelection(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 py-4">
      <div className="flex gap-2 opacity-50">
        <div className="text-sm text-gray-500 mr-4 self-center">Enemy</div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="slot w-20 h-28 slot-empty">
            <span className="text-gray-600 text-xs">?</span>
          </div>
        ))}
      </div>

      <div className="text-2xl text-gray-500 font-bold">VS</div>

      <div className="flex gap-2">
        <div className="text-sm text-gray-400 mr-4 self-center">Board</div>
        {Array.from({ length: 5 }).map((_, displayIndex) => {
          const arrayIndex = 4 - displayIndex;
          const unit = view.board[arrayIndex];
          const displayPosition = 5 - displayIndex;

          return unit ? (
            <UnitCard
              key={unit.id}
              card={unit}
              showCost={false}
              showPitch={true}
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
              isTarget={selection?.type === 'shop'}
              label={`${displayPosition}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, arrayIndex)}
            />
          );
        })}
      </div>

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
