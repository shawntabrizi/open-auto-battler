import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { useInitGuard } from '../hooks';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
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
  const previewCards = cards?.slice(0, 5) ?? [];

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border p-3 lg:p-4 transition-all cursor-pointer ${
        isSelected
          ? 'border-yellow-500 bg-yellow-500/10 ring-1 ring-yellow-500/30'
          : 'border-warm-700/40 bg-warm-900/80 hover:border-warm-500'
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

      {/* Card thumbnails */}
      <div className="flex items-center gap-1 mb-2 lg:mb-3 h-8 lg:h-11 pr-7">
        {previewCards.length > 0 ? (
          previewCards.map((c) => {
            const art = getCardArtSm(c.id);
            return art ? (
              <img
                key={c.id}
                src={art}
                alt=""
                className="w-6 h-8 lg:w-8 lg:h-11 object-cover object-[center_30%] rounded-sm border border-warm-700/50"
              />
            ) : (
              <div
                key={c.id}
                className="w-6 h-8 lg:w-8 lg:h-11 flex items-center justify-center bg-warm-800 rounded-sm border border-warm-700/50 text-xs"
              >
                {getCardEmoji(c.id)}
              </div>
            );
          })
        ) : (
          <span className="text-warm-600 text-xs">...</span>
        )}
      </div>

      {/* Set info */}
      <h3 className="font-heading font-bold text-sm lg:text-base text-white truncate">{name}</h3>
      <p className="text-warm-500 text-[10px] lg:text-xs mt-0.5">
        {cards?.length ?? '?'} cards
      </p>

      {/* Preview button — stops propagation so it doesn't trigger selection */}
      <Link
        to={`/sets/${id}`}
        onClick={(e) => e.stopPropagation()}
        className="block mt-2 lg:mt-3 w-full text-center text-xs lg:text-sm py-1.5 lg:py-2 bg-warm-800 hover:bg-warm-700 border border-warm-600/50 hover:border-warm-500 text-warm-200 font-bold rounded-lg transition-all"
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
        <div className="w-full max-w-4xl mx-auto p-3 lg:p-6">
          {sorted.length === 0 ? (
            <div className="text-center py-16 text-warm-500 text-sm">
              {engine ? 'No sets found.' : 'Loading...'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-4">
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

              <div className="mt-6 lg:mt-10 text-center">
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
