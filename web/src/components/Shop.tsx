import { useGameStore } from '../store/gameStore';
import React from 'react';
import { UnitCard } from './UnitCard';

export function Shop() {
  const { view, selection, setSelection, pitchShopCard, pitchBoardUnit } = useGameStore();
  const [isAshHovered, setIsAshHovered] = React.useState(false);

  // Drag and drop handlers for shop cards
  const handleShopDragStart = (e: React.DragEvent, shopIndex: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `shop-${shopIndex}`);
  };

  const handleShopDragEnd = () => {
    // No state to reset since we're not tracking dragged shop cards
  };

  // Handler for when cards are dropped on ash pile
  const handleAshDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsAshHovered(false);
    const data = e.dataTransfer.getData('text/plain');

    if (data.startsWith('board-')) {
      const boardIndex = parseInt(data.split('-')[1]);
      pitchBoardUnit(boardIndex);
      setSelection(null); // Clear selection after pitching
    } else if (data.startsWith('shop-')) {
      const shopIndex = parseInt(data.split('-')[1]);
      pitchShopCard(shopIndex);
      setSelection(null); // Clear selection after pitching
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

  if (!view) return null;

  // Defensive check for shop array
  if (!view.shop || !Array.isArray(view.shop)) {
    console.error('Shop: view.shop is invalid:', view.shop);
    return <div className="text-red-500">Error: Shop data not available</div>;
  }

  const handleShopSlotClick = (index: number) => {
    const slot = view.shop[index];

    if (slot.card) {
      // Toggle selection
      if (selection?.type === 'shop' && selection.index === index) {
        setSelection(null);
      } else {
        setSelection({ type: 'shop', index });
      }
    }
  };

  return (
    <div className="h-48 bg-shop-bg border-t-2 border-gray-600">
      <div className="flex h-full">
        {/* Left: Ash Pile */}
        <div className="w-32 flex flex-col items-center justify-center border-r border-gray-700">
          <div className="text-sm text-gray-400 mb-2">Ash Pile</div>
          <div
            className={`w-20 h-20 rounded-full bg-gradient-to-br from-red-900 to-orange-800 flex items-center justify-center text-3xl shadow-lg transition-all cursor-pointer ${
              isAshHovered
                ? 'shadow-red-400/80 scale-110 ring-4 ring-red-400/50'
                : 'shadow-red-900/50 hover:shadow-red-700/70'
            }`}
            onClick={() => {
              if (selection?.type === 'shop') {
                pitchShopCard(selection.index);
              }
            }}
            onDragOver={handleAshDragOver}
            onDragLeave={handleAshDragLeave}
            onDrop={handleAshDrop}
          >
            🔥
          </div>
          <div className="text-xs text-gray-500 mt-1">Drag cards here to pitch</div>
        </div>

        {/* Center: Shop/Conveyor Belt */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-sm text-gray-400">Shop</span>
            <span className="text-xs text-gray-500">({view.deckCount} cards in deck)</span>
          </div>

          <div className="flex gap-3">
            {view.shop
              .map((slot, i) => ({ slot, index: i }))
              .filter(({ slot }) => slot.card) // Only show slots with cards
              .map(({ slot, index: i }) => (
                <UnitCard
                  key={slot.card!.id}
                  card={slot.card!}
                  showCost={true}
                  frozen={slot.frozen}
                  canAfford={view.canAfford[i]}
                  isSelected={selection?.type === 'shop' && selection.index === i}
                  onClick={() => handleShopSlotClick(i)}
                  draggable={!slot.frozen} // Can't drag frozen cards
                  onDragStart={(e) => handleShopDragStart(e, i)}
                  onDragEnd={handleShopDragEnd}
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
