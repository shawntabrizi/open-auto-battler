import { useGameStore } from '../store/gameStore';
import React from 'react';
import { UnitCard, EmptySlot } from './UnitCard';

export function Arena() {
  const { view, selection, setSelection, pitchBoardUnit, swapBoardPositions, playHandCard } =
    useGameStore();
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    setSelection({ type: 'board', index });
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
    } else if (data.startsWith('hand-')) {
      const handIndex = parseInt(data.split('-')[1]);
      playHandCard(handIndex, dropIndex);
    }

    setDraggedIndex(null);
  };

  if (!view) return null;

  if (!view.board || !Array.isArray(view.board)) {
    return <div className="text-red-500">Error: Board data not available</div>;
  }

  const handleBoardSlotClick = (index: number) => {
    const unit = view.board[index];

    // Clicking a board unit handles selection/inspection
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
      <div className="flex gap-2">
        <div className="board-label text-sm text-gray-400 mr-4 self-center">Board</div>
        {Array.from({ length: 5 }).map((_, displayIndex) => {
          const arrayIndex = 4 - displayIndex;
          const unit = view.board[arrayIndex];
          const displayPosition = 5 - displayIndex;

          return unit ? (
            <UnitCard
              key={`board-${unit.id}-${arrayIndex}`}
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
              isTarget={selection?.type === 'hand'}
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
            Pitch (+{view.board[selection.index]?.pitch_value})
          </button>
        </div>
      )}
    </div>
  );
}
