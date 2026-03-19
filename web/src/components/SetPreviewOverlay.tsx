import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { UnitCard } from './UnitCard';
import { CardDetailPanel } from './CardDetailPanel';
import { CloseIcon } from './Icons';
import type { CardView } from '../types';

export function SetPreviewOverlay() {
  const { showSetPreview, previewCards, closePreview } = useGameStore();
  const [selectedCard, setSelectedCard] = useState<CardView | null>(null);

  if (!showSetPreview || !previewCards) return null;

  const sorted = [...previewCards].sort(
    (a, b) => a.play_cost - b.play_cost || a.name.localeCompare(b.name)
  );

  return (
    <div className="fixed inset-0 z-[70] animate-in fade-in duration-300">
      {/* Left sidebar - card detail panel */}
      <CardDetailPanel card={selectedCard} isVisible={true} mode={{ type: 'readOnly' }} />

      {/* Card grid - offset to the right of the sidebar */}
      <div className="fixed left-[11rem] lg:left-80 right-0 top-0 bottom-0 bg-black/95 lg:bg-black/90 backdrop-blur-md flex flex-col p-3 lg:p-8 overflow-hidden">
        <button
          onClick={closePreview}
          aria-label="Close Preview"
          className="absolute top-3 right-3 lg:top-4 lg:right-4 z-10 p-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-400 hover:text-white hover:border-warm-500 transition-colors"
        >
          <CloseIcon className="w-4 h-4 lg:w-5 lg:h-5" />
        </button>
        <div className="flex items-center mb-3 lg:mb-8 border-b border-warm-700 pb-2 lg:pb-4 pr-10 lg:pr-12">
          <div className="flex flex-col">
            <h2 className="text-lg lg:text-3xl font-bold text-white flex items-center gap-2 lg:gap-3">
              Set Preview
            </h2>
            <p className="text-warm-400 text-xs lg:text-base mt-0.5 lg:mt-1">
              <span className="text-white font-bold">{sorted.length}</span> unique cards in this
              set.
              <span className="hidden lg:inline"> Click a card for full details.</span>
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 lg:pr-4 custom-scrollbar">
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center h-full text-warm-500">
              No cards in this set.
            </div>
          ) : (
            <div className="grid grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-1 lg:gap-6 pt-2 pb-4 lg:pb-12">
              {sorted.map((card, i) => (
                <div key={`${card.id}-${i}`} className="flex justify-center">
                  <UnitCard
                    card={card}
                    showCost={true}
                    showBurn={true}
                    draggable={false}
                    isSelected={selectedCard?.id === card.id}
                    onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 lg:mt-6 text-center text-warm-500 text-[10px] lg:text-sm border-t border-warm-800 pt-2 lg:pt-4 uppercase tracking-wider lg:tracking-widest">
          Sorted by mana cost, then name
        </div>
      </div>
    </div>
  );
}
