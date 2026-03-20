import { useGameStore } from '../store/gameStore';
import { CardGallery } from './CardGallery';
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
    .filter((entry): entry is { bagIndex: number; card: CardView } => !!entry.card);

  const cards = bagCards.map((entry) => entry.card);

  // Map card index in filtered/sorted gallery back to original bagIndex
  const handleSelect = (card: CardView | null) => {
    if (!card) {
      setSelection(null);
      return;
    }
    const entry = bagCards.find(
      (e) => e.card.id === card.id && !(selection?.type === 'bag' && selection.index === e.bagIndex)
    ) ?? bagCards.find((e) => e.card.id === card.id);
    if (entry) {
      setSelection({ type: 'bag', index: entry.bagIndex });
    }
  };

  const selectedCardId = selection?.type === 'bag' ? bagCards.find((e) => e.bagIndex === selection.index)?.card.id ?? null : null;

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

      <div className="flex-1 min-h-0 pr-1 lg:pr-4">
        {bagCards.length === 0 ? (
          <div className="flex items-center justify-center h-full text-warm-500">
            Loading bag...
          </div>
        ) : (
          <CardGallery
            cards={cards}
            selectedId={selectedCardId}
            onSelect={(card) => handleSelect(card as CardView | null)}
          />
        )}
      </div>

      <div className="mt-2 lg:mt-6 text-center text-warm-500 text-[10px] lg:text-sm border-t border-warm-800 pt-2 lg:pt-4 uppercase tracking-wider lg:tracking-widest">
        Cards drawn into hand in future rounds
      </div>
    </div>
  );
}
