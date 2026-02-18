import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import React from 'react';
import { DraggableCard, DroppableAshPile } from './DndComponents';

export function Shop() {
  const { view, selection, setSelection, pitchHandCard, pitchBoardUnit, undo } = useGameStore();
  const handBg = useCustomizationStore((s) => s.selections.handBackground);
  const [isAshHovered, setIsAshHovered] = React.useState(false);

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

  const handleAshClick = () => {
    if (selection?.type === 'hand') {
      pitchHandCard(selection.index);
      setSelection(null);
    } else if (selection?.type === 'board') {
      pitchBoardUnit(selection.index);
      setSelection(null);
    }
  };

  return (
    <div
      className={`shop h-32 lg:h-60 border-t-2 border-gray-600 flex-shrink-0 relative ${handBg ? '' : 'bg-shop-bg'}`}
      style={handBg ? {
        backgroundImage: `url(${handBg.imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      {handBg && <div className="absolute inset-0 bg-shop-bg/50" />}
      <div className="flex h-full relative z-10">
        {/* Left: Undo Button */}
        <div className="shop-side w-20 lg:w-32 h-full flex flex-col items-center justify-center">
          <button
            onClick={undo}
            disabled={!view.can_undo}
            className={`action-circle w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all border-2 ${view.can_undo
                ? 'bg-gradient-to-br from-gray-600 to-gray-700 border-gray-400/50 text-white hover:from-gray-500 hover:to-gray-600 cursor-pointer shadow-gray-900/50 hover:shadow-gray-700/70'
                : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
              }`}
            title="Undo last action"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
              <path fillRule="evenodd" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="text-[10px] text-gray-500 mt-2">Undo</div>
        </div>

        {/* Center: Hand */}
        <div className="shop-hand flex-1 flex flex-col items-center justify-center overflow-hidden relative">
          {/* Hand label - desktop only */}
          <div className="hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 items-center gap-2">
            <span className="text-sm text-gray-400">Hand</span>
            <span className="text-xs text-gray-500">({view.bag_count} in deck)</span>
          </div>
          <div className="hand-row flex gap-2 lg:gap-4 lg:mt-4">
            {view.hand.map((card, i) =>
              card ? (
                <DraggableCard
                  key={`hand-${card.id}-${i}`}
                  id={`hand-${i}`}
                  card={card}
                  showCost={true}
                  showPitch={true}
                  can_afford={view.can_afford[i]}
                  isSelected={selection?.type === 'hand' && selection.index === i}
                  onClick={() => handleHandSlotClick(i)}
                />
              ) : (
                <div
                  key={`hand-empty-${i}`}
                  className="card-slot-placeholder w-[4.5rem] h-24 lg:w-32 lg:h-44 rounded-lg border-2 border-dashed border-gray-600 bg-gray-800/30 flex items-center justify-center"
                >
                  <span className="text-gray-500 text-xs">H{i + 1}</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Right: Ash Pile */}
        <DroppableAshPile onHoverChange={setIsAshHovered}>
          <div
            className={`shop-side w-20 lg:w-32 h-full flex flex-col items-center justify-center transition-colors duration-200 ${isAshHovered ? 'bg-red-900/30' : ''}`}
          >
            <div
              className={`action-circle w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-orange-800 flex items-center justify-center shadow-lg transition-all cursor-pointer border-2 border-orange-500/50 ${isAshHovered
                  ? 'shadow-red-400/80 scale-110 ring-4 ring-red-400/30'
                  : 'shadow-red-900/50 hover:shadow-red-700/70'
                }`}
              onClick={handleAshClick}
            >
              <span className="text-2xl">🔥</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-2 text-center px-2">
              {isAshHovered ? 'BURN IT!' : 'Ash Pile'}
            </div>
          </div>
        </DroppableAshPile>
      </div>
    </div>
  );
}
