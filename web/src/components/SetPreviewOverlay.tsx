import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { UnitCard } from './UnitCard';
import { CardDetailPanel } from './CardDetailPanel';
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
      <CardDetailPanel
        card={selectedCard}
        isVisible={true}
        mode={{ type: 'readOnly' }}
        topOffset="0"
      />

      {/* Card grid - offset to the right of the sidebar */}
      <div className="fixed left-[11rem] lg:left-80 right-0 top-0 bottom-0 bg-black/95 lg:bg-black/90 backdrop-blur-md flex flex-col p-3 lg:p-8 overflow-hidden">
        <div className="flex justify-between items-center mb-3 lg:mb-8 border-b border-gray-700 pb-2 lg:pb-4">
          <div className="flex flex-col">
            <h2 className="text-lg lg:text-3xl font-bold text-white flex items-center gap-2 lg:gap-3">
              Set Preview
            </h2>
            <p className="text-gray-400 text-xs lg:text-base mt-0.5 lg:mt-1">
              <span className="text-white font-bold">{sorted.length}</span> unique cards in this
              set.
              <span className="hidden lg:inline"> Click a card for full details.</span>
            </p>
          </div>
          <button
            onClick={closePreview}
            className="btn btn-secondary px-3 lg:px-6 py-2 lg:py-3 text-sm lg:text-lg flex items-center gap-1 lg:gap-2 hover:scale-105 transition-transform"
          >
            <span>✕</span> <span className="hidden lg:inline">Close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 lg:pr-4 custom-scrollbar">
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No cards in this set.
            </div>
          ) : (
            <div className="grid grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-1 lg:gap-6 pt-2 pb-4 lg:pb-12">
              {sorted.map((card, i) => (
                <div key={`${card.id}-${i}`} className="flex justify-center">
                  <UnitCard
                    card={card}
                    showCost={true}
                    showPitch={true}
                    draggable={false}
                    isSelected={selectedCard?.id === card.id}
                    onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 lg:mt-6 text-center text-gray-500 text-[10px] lg:text-sm border-t border-gray-800 pt-2 lg:pt-4 uppercase tracking-wider lg:tracking-widest">
          Sorted by mana cost, then name
        </div>
      </div>
    </div>
  );
}
