import { useGameStore } from '../store/gameStore';
import React from 'react';
import { DraggableCard, DroppableAshPile } from './DndComponents';

export function Shop() {
  const { view, selection, setSelection, pitchHandCard, pitchBoardUnit } = useGameStore();
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
    <div className="shop h-48 lg:h-56 bg-shop-bg border-t-2 border-gray-600 flex-shrink-0">
      <div className="flex h-full">
        {/* Left: Ash Pile */}
        <DroppableAshPile onHoverChange={setIsAshHovered}>
          <div
            className={`shop-side w-32 h-full flex flex-col items-center justify-center border-r border-gray-700 transition-colors duration-200 ${
              isAshHovered ? 'bg-red-900/30' : ''
            }`}
          >
            <div className="ash-label text-sm text-gray-400 mb-2">Ash Pile</div>
            <div
              className={`ash-circle w-16 h-16 rounded-full bg-gradient-to-br from-red-900 to-orange-800 flex items-center justify-center text-2xl shadow-lg transition-all cursor-pointer border-2 border-orange-500/50 ${
                isAshHovered
                  ? 'shadow-red-400/80 scale-110 ring-4 ring-red-400/30'
                  : 'shadow-red-900/50 hover:shadow-red-700/70'
              }`}
              onClick={handleAshClick}
            >
              🔥
            </div>
            <div className="ash-hint text-[10px] text-gray-500 mt-2 text-center px-2">
              {isAshHovered ? 'BURN IT!' : 'Drop to Pitch'}
            </div>
          </div>
        </DroppableAshPile>

        {/* Center: Hand */}
        <div className="shop-hand flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-sm text-gray-400 hidden lg:inline">Hand</span>
            <span className="text-xs text-gray-500 hidden lg:inline">({view.bag_count} in draw pool)</span>
          </div>

          <div className="hand-row flex gap-3 lg:gap-4">
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

        {/* Right: Mana Tank */}
        <div className="shop-side w-32 flex flex-col items-center justify-center border-l border-gray-700">
          <div className="mana-label text-sm text-gray-400 mb-2">Mana</div>
          <div className="mana-container relative w-16 h-24 bg-gray-900 rounded-lg border-2 border-mana-blue mana-tank overflow-hidden">
            {/* Mana level */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-mana-blue to-blue-400 transition-all duration-300"
              style={{
                height: `${(view.mana / view.mana_limit) * 100}%`,
              }}
            />
            {/* Level text */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Mobile: show mana/limit */}
              <span className="mana-text text-sm font-bold text-white drop-shadow-lg lg:hidden">{view.mana}/{view.mana_limit}</span>
              {/* Desktop: show just mana */}
              <span className="mana-text text-xl font-bold text-white drop-shadow-lg hidden lg:block">{view.mana}</span>
            </div>
          </div>
          <div className="mana-limit text-xs text-gray-400 mt-1">Limit: {view.mana_limit}</div>
        </div>
      </div>
    </div>
  );
}
