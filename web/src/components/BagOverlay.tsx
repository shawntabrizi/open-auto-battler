import { useEffect, useRef } from 'react';
import { UI_LAYERS } from '../constants/uiLayers';
import { useGameStore } from '../store/gameStore';
import { CardGallery } from './CardGallery';
import { CloseIcon, BagIcon } from './Icons';
import { type CardView } from '../types';

export function BagOverlay() {
  const {
    view,
    bag,
    cardSet,
    showBag,
    setShowBag,
    selection,
    setSelection,
    showGameCardDetailsPanel,
  } = useGameStore();
  const galleryScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showBag || !view) return;

    const frameId = window.requestAnimationFrame(() => {
      galleryScrollRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [showBag, view]);

  if (!showBag || !view) return null;

  // Keep original bag indexes so selection maps to the same source list used by GameShell.
  const bagCards = (bag ?? [])
    .map((id, bagIndex) => ({
      bagIndex,
      card: cardSet?.find((c) => c.id === id),
    }))
    .filter((entry): entry is { bagIndex: number; card: CardView } => !!entry.card);

  const cards = bagCards.map((entry) => entry.card);

  // Track which gallery index is selected (survives sort/filter since bagCards order is stable)
  const selectedGalleryIndex =
    selection?.type === 'bag' ? bagCards.findIndex((e) => e.bagIndex === selection.index) : -1;

  return (
    <div
      className={`fixed ${
        showGameCardDetailsPanel ? 'left-[11rem] lg:left-80' : 'left-0'
      } right-0 top-0 bottom-0 bg-black/95 lg:bg-black/90 backdrop-blur-md flex flex-col p-3 lg:p-8 overflow-hidden animate-in fade-in duration-300`}
      style={{ zIndex: UI_LAYERS.inGameOverlay }}
    >
      <button
        onClick={() => setShowBag(false)}
        aria-label="Close Draw Pool"
        className="theme-button theme-surface-button absolute top-3 right-3 z-10 rounded-lg border p-2 transition-colors lg:top-4 lg:right-4"
      >
        <CloseIcon className="theme-icon-muted w-4 h-4 lg:w-5 lg:h-5" />
      </button>
      <div className="flex items-center mb-3 lg:mb-8 border-b border-base-700 pb-2 lg:pb-4 pr-10 lg:pr-12">
        <div className="flex flex-col">
          <h2 className="text-lg lg:text-3xl font-bold text-white flex items-center gap-2 lg:gap-3">
            <BagIcon className="w-5 h-5 lg:w-7 lg:h-7 text-mana" /> Draw Pool
          </h2>
          <p className="text-base-400 text-xs lg:text-base mt-0.5 lg:mt-1">
            <span className="text-white font-bold">{view.bag_count}</span> cards remaining
            <span className="hidden lg:inline"> in your bag (excluding your current hand)</span>.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 pr-1 lg:pr-4">
        {bagCards.length === 0 ? (
          <div className="flex items-center justify-center h-full text-base-500">
            Loading bag...
          </div>
        ) : (
          <CardGallery
            cards={cards}
            isSelected={(_card, index) => index === selectedGalleryIndex}
            focusableCards={true}
            scrollRegionRef={galleryScrollRef}
            scrollRegionLabel="Draw pool cards"
            scrollRegionTabIndex={0}
            onSelect={(card, index) => {
              if (!card || index === selectedGalleryIndex) {
                setSelection(null);
              } else {
                setSelection({ type: 'bag', index: bagCards[index].bagIndex });
              }
            }}
          />
        )}
      </div>

      <div className="mt-2 lg:mt-6 text-center text-base-500 text-[10px] lg:text-sm border-t border-base-800 pt-2 lg:pt-4 uppercase tracking-wider lg:tracking-widest">
        Cards drawn into hand in future rounds
      </div>
    </div>
  );
}
