import { useGameStore } from '../store/gameStore';
import { UnitCard } from './UnitCard';

export function BagOverlay() {
  const { view, showBag, setShowBag, selection, setSelection } = useGameStore();

  if (!showBag || !view) return null;

  return (
    <div className="fixed left-80 right-0 top-16 bottom-48 z-40 bg-black/90 backdrop-blur-md flex flex-col p-8 overflow-hidden animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <span className="text-blue-400">🎒</span> Draw Pool
          </h2>
          <p className="text-gray-400 mt-1">
            There are <span className="text-white font-bold">{view.bag.length}</span> cards remaining in your bag (excluding your current hand).
          </p>
        </div>
        <button 
          onClick={() => setShowBag(false)}
          className="btn btn-secondary px-6 py-3 text-lg flex items-center gap-2 hover:scale-105 transition-transform"
        >
          <span>✕</span> Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6 pb-12">
          {view.bag.map((card, i) => {
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
      </div>

      <div className="mt-6 text-center text-gray-500 text-sm border-t border-gray-800 pt-4 uppercase tracking-widest">
        These cards may be drawn into your hand in future rounds.
      </div>
    </div>
  );
}
