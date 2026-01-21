import { useGameStore } from '../store/gameStore';
import { UnitCard, EmptySlot } from './UnitCard';

export function Shop() {
  const { view, selection, setSelection, pitchShopCard, buyCard, toggleFreeze } = useGameStore();

  if (!view) return null;

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
            className="w-20 h-20 rounded-full bg-gradient-to-br from-red-900 to-orange-800 flex items-center justify-center text-3xl shadow-lg shadow-red-900/50 hover:shadow-red-700/70 transition-shadow cursor-pointer"
            onClick={() => {
              if (selection?.type === 'shop') {
                pitchShopCard(selection.index);
              }
            }}
          >
            🔥
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {selection?.type === 'shop' ? 'Click to pitch' : 'Select card first'}
          </div>
        </div>

        {/* Center: Shop/Conveyor Belt */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-sm text-gray-400">Shop</span>
            <span className="text-xs text-gray-500">({view.deckCount} cards in deck)</span>
          </div>

          <div className="flex gap-3">
            {view.shop.map((slot, i) => (
              slot.card ? (
                <UnitCard
                  key={slot.card.id}
                  card={slot.card}
                  showCost={true}
                  frozen={slot.frozen}
                  canAfford={view.canAfford[i]}
                  isSelected={selection?.type === 'shop' && selection.index === i}
                  onClick={() => handleShopSlotClick(i)}
                />
              ) : (
                <EmptySlot key={`empty-${i}`} label="Empty" />
              )
            ))}
          </div>

          {/* Action buttons for selected shop card */}
          {selection?.type === 'shop' && view.shop[selection.index]?.card && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => buyCard(selection.index)}
                disabled={!view.canAfford[selection.index]}
                className={`btn text-sm ${view.canAfford[selection.index] ? 'btn-primary' : 'btn-disabled'}`}
              >
                Buy (-{view.shop[selection.index].card?.playCost})
              </button>
              <button
                onClick={() => toggleFreeze(selection.index)}
                className="btn bg-cyan-600 hover:bg-cyan-500 text-white text-sm"
              >
                {view.shop[selection.index].frozen ? 'Unfreeze' : 'Freeze'}
              </button>
              <button
                onClick={() => pitchShopCard(selection.index)}
                className="btn btn-danger text-sm"
              >
                Pitch (+{view.shop[selection.index].card?.pitchValue})
              </button>
            </div>
          )}
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
              <span className="text-xl font-bold text-white drop-shadow-lg">
                {view.mana}
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Limit: {view.manaLimit}
          </div>
        </div>
      </div>
    </div>
  );
}
