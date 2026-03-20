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
    <button
      onClick={onSelect}
      className={`set-tile flex flex-col items-center text-center w-full ${
        isSelected ? 'ring-2 ring-yellow-500/50 rounded-xl bg-yellow-500/5' : ''
      }`}
    >
      {/* Card fan */}
      {cards && cards.length > 0 ? (
        <CardFan cards={cards} />
      ) : (
        <div className="set-card-fan flex items-center justify-center">
          <span className="text-warm-600 text-sm">...</span>
        </div>
      )}

      {/* Set name */}
      <h3 className="font-heading font-bold text-sm lg:text-xl text-white mt-1 lg:mt-2">
        {name}
      </h3>
      <p className="text-warm-500 text-[10px] lg:text-sm">
        {cards?.length ?? '?'} cards
      </p>

      {/* Preview link */}
      <Link
        to={`/sets/${id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-warm-500 hover:text-warm-300 text-[10px] lg:text-xs mt-1 transition-colors"
      >
        Preview cards &rsaquo;
      </Link>
    </button>
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
          {/* Header */}
          <div className="text-center mb-6 lg:mb-12">
            <h1 className="text-2xl lg:text-4xl font-title font-bold text-gold">
              Choose Your Set
            </h1>
            <p className="text-warm-500 text-xs lg:text-sm mt-1 lg:mt-2">
              Each set brings unique cards and strategies.
            </p>
          </div>

          {sorted.length === 0 ? (
            <div className="text-center py-16 text-warm-500 text-sm">
              {engine ? 'No sets found.' : 'Loading...'}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-4 lg:gap-8">
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

              <div className="mt-8 lg:mt-14 text-center">
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
