import { useGameStore } from '../store/gameStore';
import { UnitCard } from './UnitCard';
import { CloseIcon } from './Icons';
import { type CardView } from '../types';

export function BagOverlay() {
  const { view, bag, cardSet, showBag, setShowBag, selection, setSelection } = useGameStore();

  if (!showBag || !view) return null;

  // Keep original bag indexes so selection maps to the same source list used by GameShell.
  const bagCards = (bag ?? [])
    .map((id, bagIndex) => ({
      bagIndex,
      card: cardSet?.find((c) => c.id === id),
    }))
    .filter((entry): entry is { bagIndex: number; card: CardView } => !!entry.card)
    .sort((a, b) => a.card.play_cost - b.card.play_cost || a.card.name.localeCompare(b.card.name));

  return (
    <div className="fixed left-[11rem] lg:left-80 right-0 top-0 bottom-0 z-[60] bg-black/95 lg:bg-black/90 backdrop-blur-md flex flex-col p-3 lg:p-8 overflow-hidden animate-in fade-in duration-300">
      <button
        onClick={() => setShowBag(false)}
        aria-label="Close Draw Pool"
        className="absolute top-3 right-3 lg:top-4 lg:right-4 z-10 p-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-400 hover:text-white hover:border-warm-500 transition-colors"
      >
        <CloseIcon className="w-4 h-4 lg:w-5 lg:h-5" />
      </button>
      <div className="flex items-center mb-3 lg:mb-8 border-b border-warm-700 pb-2 lg:pb-4 pr-10 lg:pr-12">
        <div className="flex flex-col">
          <h2 className="text-lg lg:text-3xl font-bold text-white flex items-center gap-2 lg:gap-3">
            <span className="text-blue-400">🎒</span> Draw Pool
          </h2>
          <p className="text-warm-400 text-xs lg:text-base mt-0.5 lg:mt-1">
            <span className="text-white font-bold">{view.bag_count}</span> cards remaining
            <span className="hidden lg:inline"> in your bag (excluding your current hand)</span>.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 lg:pr-4 custom-scrollbar">
        {bagCards.length === 0 ? (
          <div className="flex items-center justify-center h-full text-warm-500">
            Loading bag...
          </div>
        ) : (
          <div className="grid grid-cols-3 lg:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 lg:gap-6 pt-2 pb-4 lg:pb-12">
            {bagCards.map(({ card, bagIndex }, i) => {
              return (
                <div key={`${card.id}-${i}`} className="aspect-[3/4]">
                  <UnitCard
                    card={card}
                    showCost={true}
                    showBurn={true}
                    draggable={false}
                    isSelected={selection?.type === 'bag' && selection.index === bagIndex}
                    onClick={() => {
                      if (selection?.type === 'bag' && selection.index === bagIndex) {
                        setSelection(null);
                      } else {
                        setSelection({ type: 'bag', index: bagIndex });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-2 lg:mt-6 text-center text-warm-500 text-[10px] lg:text-sm border-t border-warm-800 pt-2 lg:pt-4 uppercase tracking-wider lg:tracking-widest">
        Cards drawn into hand in future rounds
      </div>
    </div>
  );
}
