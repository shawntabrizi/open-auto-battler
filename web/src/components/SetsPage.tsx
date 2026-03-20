import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { useInitGuard } from '../hooks';
import { CardFan } from './CardFan';
import { TopBar } from './TopBar';
import type { CardView } from '../types';

function SetCard({
  id,
  name,
  cards,
  isSelected,
  onSelect,
}: {
  id: number;
  name: string;
  cards: CardView[] | undefined;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`set-tile relative flex flex-col items-center text-center rounded-xl border p-3 lg:p-5 cursor-pointer transition-all ${
        isSelected
          ? 'border-2 border-yellow-400 bg-yellow-500/10'
          : 'border-warm-700/40 bg-warm-900/50 hover:border-warm-500'
      }`}
    >
      {/* Radio indicator — top right */}
      <div className="absolute top-2.5 right-2.5 lg:top-3 lg:right-3">
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            isSelected ? 'border-yellow-400' : 'border-warm-600'
          }`}
        >
          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />}
        </div>
      </div>

      {/* Set name */}
      <h3 className="font-heading font-bold text-sm lg:text-xl text-white">
        {name}
      </h3>
      <p className="text-warm-500 text-[10px] lg:text-sm">
        {cards?.length ?? '?'} cards
      </p>

      {/* Card fan */}
      {cards && cards.length > 0 ? (
        <CardFan cards={cards} />
      ) : (
        <div className="set-card-fan flex items-center justify-center">
          <span className="text-warm-600 text-sm">...</span>
        </div>
      )}

      {/* Preview button */}
      <Link
        to={`/sets/${id}`}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 lg:mt-2 w-full text-center text-xs lg:text-sm py-1.5 lg:py-2 bg-warm-800 hover:bg-warm-700 border border-warm-600/50 hover:border-warm-500 text-warm-200 font-bold rounded-lg transition-all"
      >
        Preview Cards
      </Link>
    </div>
  );
}

export function SetsPage() {
  const { engine, init, setMetas, loadSetPreviews, setPreviewCards } = useGameStore();
  const { selectedSetId, selectSet } = useSettingsStore();

  useInitGuard(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (engine && setMetas.length > 0) {
      loadSetPreviews();
    }
  }, [engine, setMetas, loadSetPreviews]);

  const sorted = [...setMetas].sort((a, b) => a.id - b.id);

  return (
    <div className="fixed inset-0 bg-warm-950 text-white flex flex-col">
      <TopBar backTo="/" backLabel="Menu" title="Card Sets" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-5xl mx-auto px-3 lg:px-6 py-6 lg:py-12">
          {sorted.length === 0 ? (
            <div className="text-center py-16 text-warm-500 text-sm">
              {engine ? 'No sets found.' : 'Loading...'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:gap-6">
                {sorted.map((meta) => (
                  <SetCard
                    key={meta.id}
                    id={meta.id}
                    name={meta.name}
                    cards={setPreviewCards[meta.id]}
                    isSelected={selectedSetId === meta.id}
                    onSelect={() => selectSet(meta.id)}
                  />
                ))}
              </div>

              <div className="mt-4 lg:mt-8 text-center">
                <Link
                  to="/creator"
                  className="text-warm-500 hover:text-warm-300 text-xs lg:text-sm transition-colors"
                >
                  Want to create your own set? Visit the Creator Studio &rarr;
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
