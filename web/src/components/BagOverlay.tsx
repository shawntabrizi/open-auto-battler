import { useGameStore } from '../store/gameStore';
import { UnitCard } from './UnitCard';
import { CardView } from '../types';

export function BagOverlay() {
  const { view, bag, cardSet, showBag, setShowBag, selection, setSelection } = useGameStore();

  if (!showBag || !view) return null;

  // Map bag IDs to CardView objects using the cardSet lookup
  const bagCards = (bag ?? [])
    .map(id => cardSet?.find(c => c.id === id))
    .filter((c): c is CardView => !!c);

  return (
    <div className="fixed left-[11rem] lg:left-80 right-0 top-0 lg:top-16 bottom-0 lg:bottom-48 z-[60] bg-black/95 lg:bg-black/90 backdrop-blur-md flex flex-col p-3 lg:p-8 overflow-hidden animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-3 lg:mb-8 border-b border-gray-700 pb-2 lg:pb-4">
        <div className="flex flex-col">
          <h2 className="text-lg lg:text-3xl font-bold text-white flex items-center gap-2 lg:gap-3">
            <span className="text-blue-400">🎒</span> Draw Pool
          </h2>
          <p className="text-gray-400 text-xs lg:text-base mt-0.5 lg:mt-1">
            <span className="text-white font-bold">{view.bag_count}</span> cards remaining
            <span className="hidden lg:inline"> in your bag (excluding your current hand)</span>.
          </p>
        </div>
        <button
          onClick={() => setShowBag(false)}
          className="btn btn-secondary px-3 lg:px-6 py-2 lg:py-3 text-sm lg:text-lg flex items-center gap-1 lg:gap-2 hover:scale-105 transition-transform"
        >
          <span>✕</span> <span className="hidden lg:inline">Close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 lg:pr-4 custom-scrollbar">
        {bagCards.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading bag...
          </div>
        ) : (
          <div className="grid grid-cols-3 lg:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 lg:gap-6 pt-2 pb-4 lg:pb-12">
            {bagCards.map((card, i) => {
              return (
                <div key={`${card.id}-${i}`} className="flex justify-center">
                  <UnitCard
                    card={card}
                    showCost={true}
                    showPitch={true}
                    draggable={false}
                    isSelected={selection?.type === "bag" && selection.index === i}
                    onClick={() => {
                      if (selection?.type === "bag" && selection.index === i) {
                        setSelection(null);
                      } else {
                        setSelection({ type: "bag", index: i });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 lg:mt-6 text-center text-gray-500 text-[10px] lg:text-sm border-t border-gray-800 pt-2 lg:pt-4 uppercase tracking-wider lg:tracking-widest">
        Cards drawn into hand in future rounds
      </div>
    </div>
  );
}
