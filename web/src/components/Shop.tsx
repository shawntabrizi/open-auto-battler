import { useGameStore } from '../store/gameStore';
import React from 'react';
import { UnitCard } from './UnitCard';

export function Shop() {
  const { view, selection, setSelection, pitchHandCard, pitchBoardUnit } = useGameStore();
  const [isAshHovered, setIsAshHovered] = React.useState(false);

  // Drag and drop handlers for hand cards
  const handleHandDragStart = (e: React.DragEvent, handIndex: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `hand-${handIndex}`);
  };

  const handleHandDragEnd = () => {
    // No state to reset
  };

  // Handler for when cards are dropped on ash pile
  const handleAshDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsAshHovered(false);
    const data = e.dataTransfer.getData('text/plain');

    if (data.startsWith('board-')) {
      const boardIndex = parseInt(data.split('-')[1]);
      pitchBoardUnit(boardIndex);
      setSelection(null);
    } else if (data.startsWith('hand-')) {
      const handIndex = parseInt(data.split('-')[1]);
      pitchHandCard(handIndex);
      setSelection(null);
    }
  };

  const handleAshDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsAshHovered(true);
  };

  const handleAshDragLeave = () => {
    setIsAshHovered(false);
  };

  const handleAshMouseEnter = () => {
    setIsAshHovered(true);
  };

  const handleAshMouseLeave = () => {
    setIsAshHovered(false);
  };

  if (!view) return null;

  // Defensive check for hand array
  if (!view.hand || !Array.isArray(view.hand)) {
    console.error('Shop: view.hand is invalid:', view.hand);
    return <div className="text-red-500">Error: Hand data not available</div>;
  }

  const handleHandSlotClick = (index: number) => {
    const card = view.hand[index];

    if (card) {
      // Toggle selection
      if (selection?.type === 'hand' && selection.index === index) {
        setSelection(null);
      } else {
        setSelection({ type: 'hand', index });
      }
    }
  };

  return (
    <div className="h-48 bg-shop-bg border-t-2 border-gray-600">
      <div className="flex h-full">
        {/* Left: Ash Pile */}
        <div
          className={`w-32 flex flex-col items-center justify-center border-r border-gray-700 transition-colors duration-200 ${
            isAshHovered ? 'bg-red-900/30' : ''
          }`}
          onDragOver={handleAshDragOver}
          onDragLeave={handleAshDragLeave}
          onMouseEnter={handleAshMouseEnter}
          onMouseLeave={handleAshMouseLeave}
          onDrop={handleAshDrop}
        >
          <div className="text-sm text-gray-400 mb-2">Ash Pile</div>
          <div
            className={`w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-orange-800 flex items-center justify-center text-2xl shadow-lg transition-all cursor-pointer border-2 border-orange-500/50 ${
              isAshHovered
                ? 'shadow-red-400/80 scale-110 ring-4 ring-red-400/30'
                : 'shadow-red-900/50 hover:shadow-red-700/70'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (selection?.type === 'hand') {
                pitchHandCard(selection.index);
                setSelection(null);
              } else if (selection?.type === 'board') {
                pitchBoardUnit(selection.index);
                setSelection(null);
              }
            }}
          >
            🔥
          </div>
          <div className="text-[10px] text-gray-500 mt-2 text-center px-2">
            {isAshHovered ? 'BURN IT!' : 'Drop to Pitch'}
          </div>
        </div>

        {/* Center: Hand */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-sm text-gray-400">Hand</span>
            <span className="text-xs text-gray-500">({view.bagCount} cards in bag)</span>
          </div>

          <div className="flex gap-3">
            {view.hand
              .map((card, i) => ({ card, index: i }))
              .filter(({ card }) => card) // Only show non-null cards (not yet used)
              .map(({ card, index: i }) => (
                <UnitCard
                  key={card!.id}
                  card={card!}
                  showCost={true}
                  showPitch={true}
                  canAfford={view.canAfford[i]}
                  isSelected={selection?.type === 'hand' && selection.index === i}
                  onClick={() => handleHandSlotClick(i)}
                  draggable={true}
                  onDragStart={(e) => handleHandDragStart(e, i)}
                  onDragEnd={handleHandDragEnd}
                />
              ))}
          </div>
        </div>

        {/* Right: Mana Tank */}
        <div className="w-32 flex flex-col items-center justify-center border-l border-gray-700">
          <div className="text-sm text-gray-400 mb-2">Mana</div>
          <div className="relative w-16 h-24 bg-gray-900 rounded-lg border-2 border-mana-blue mana-tank overflow-hidden">
            {/* Mana level */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-mana-blue to-blue-400 transition-all duration-300"
              style={{
                height: `${(view.mana / view.manaLimit) * 100}%`,
              }}
            />
            {/* Level text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-white drop-shadow-lg">{view.mana}</span>
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-1">Limit: {view.manaLimit}</div>
        </div>
      </div>
    </div>
  );
}
