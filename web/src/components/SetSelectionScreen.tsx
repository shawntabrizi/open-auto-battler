import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useIsSubmitting } from '../store/txStore';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import { TopBar } from './TopBar';
import type { CardView } from '../types';

/** Fan positions for up to 5 cards */
const FAN_POSITIONS = [
  { x: '-4.5rem', rot: '-12deg', arc: '0.8rem' },
  { x: '-2.2rem', rot: '-6deg', arc: '0.2rem' },
  { x: '0rem', rot: '0deg', arc: '0rem' },
  { x: '2.2rem', rot: '6deg', arc: '0.2rem' },
  { x: '4.5rem', rot: '12deg', arc: '0.8rem' },
];

function CardFan({ cards }: { cards: CardView[] }) {
  const display = cards.slice(0, 5);
  const startIdx = Math.floor((5 - display.length) / 2);

  return (
    <div className="set-card-fan mx-auto">
      {display.map((card, i) => {
        const pos = FAN_POSITIONS[startIdx + i];
        return (
          <div
            key={card.id}
            className="set-card-fan-card"
            style={
              {
                '--fan-x': pos.x,
                '--fan-rot': pos.rot,
                '--fan-arc': pos.arc,
                zIndex: i,
              } as React.CSSProperties
            }
          >
            {getCardArtSm(card.id) ? (
              <img
                src={getCardArtSm(card.id)!}
                alt={card.name}
                className="w-full h-full object-cover object-[center_30%] rounded"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-warm-800 rounded text-2xl">
                {getCardEmoji(card.id)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AllSetsView({ onBack, onSelect }: { onBack: () => void; onSelect: (id: number) => void }) {
  const { setMetas, setPreviewCards, previewSet } = useGameStore();
  const isSubmitting = useIsSubmitting();
  const sorted = [...setMetas].sort((a, b) => a.id - b.id);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 lg:px-8 py-3 lg:py-4 border-b border-warm-800/60">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-warm-400 hover:text-warm-200 transition-colors text-xs lg:text-sm shrink-0"
        >
          <span>&larr;</span>
          <span>Back</span>
        </button>
        <h2 className="text-base lg:text-xl font-heading text-warm-100 tracking-wide">
          All Card Sets
        </h2>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto px-3 lg:px-8 py-4 lg:py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-4 max-w-5xl mx-auto">
          {sorted.map((meta) => {
            const cards = setPreviewCards[meta.id];
            return (
              <div
                key={meta.id}
                className="bg-warm-900/80 border border-warm-700/40 rounded-lg lg:rounded-xl p-2.5 lg:p-4"
              >
                {/* Mini card preview */}
                <div className="flex justify-center gap-0.5 lg:gap-1 mb-2 lg:mb-3">
                  {cards ? (
                    cards.slice(0, 5).map((c) => {
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
                    <span className="text-warm-600">...</span>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-xs lg:text-base font-heading text-warm-100 truncate">
                    {meta.name}
                  </div>
                  <div className="text-[0.65rem] lg:text-xs text-warm-500 mt-0.5">
                    {cards ? `${cards.length} cards` : `Set #${meta.id}`}
                  </div>
                </div>
                <div className="flex gap-1.5 lg:gap-2 mt-2 lg:mt-3">
                  <button
                    onClick={() => previewSet(meta.id)}
                    className="flex-1 text-center text-[0.65rem] lg:text-xs py-1 border border-warm-600/40 text-warm-400 hover:text-warm-200 hover:border-warm-500 rounded transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => onSelect(meta.id)}
                    disabled={isSubmitting}
                    className="flex-1 text-center text-[0.65rem] lg:text-xs py-1 bg-gold/20 text-gold hover:bg-gold/30 rounded transition-colors disabled:opacity-50"
                  >
                    Play
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SetSelectionScreen({
  onStartGame,
  backTo = '/play',
  backLabel = 'Play',
}: {
  /** Override the start game handler. Defaults to gameStore.startGame */
  onStartGame?: (setId: number) => void;
  backTo?: string;
  backLabel?: string;
} = {}) {
  const { setMetas, startGame, previewSet, loadSetPreviews, setPreviewCards } = useGameStore();
  const isSubmitting = useIsSubmitting();
  const [showAllSets, setShowAllSets] = useState(false);
  const handleStart = onStartGame ?? startGame;

  useEffect(() => {
    loadSetPreviews();
  }, [loadSetPreviews]);

  const featuredMeta = setMetas.length > 0 ? [...setMetas].sort((a, b) => a.id - b.id)[0] : null;
  const featuredCards = featuredMeta ? setPreviewCards[featuredMeta.id] : null;

  if (showAllSets) {
    return <AllSetsView onBack={() => setShowAllSets(false)} onSelect={(id) => handleStart(id)} />;
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar backTo={backTo} backLabel={backLabel} title="Choose Your Set" />
      <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-4 py-4">
        <div className="text-center w-full max-w-md lg:max-w-lg">
          {featuredMeta && featuredCards ? (
            <div className="bg-warm-900/60 border border-warm-700/40 rounded-xl lg:rounded-2xl p-3 lg:p-6 mb-3 lg:mb-5 flex flex-col items-center max-h-[50vh] lg:max-h-none">
              <div className="text-[0.65rem] lg:text-xs text-gold/70 uppercase tracking-widest font-heading">
                Featured Set &mdash; {featuredMeta.name}
              </div>
              <div className="text-[0.65rem] lg:text-xs text-warm-500 mb-1 lg:mb-3">
                {featuredCards.length} cards
              </div>

              <div className="relative flex-1 min-h-0 flex items-center justify-center w-full">
                <CardFan cards={featuredCards} />
                <div className="absolute inset-0 flex items-end justify-center pb-2 lg:pb-4 z-10">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => previewSet(featuredMeta.id)}
                      className="px-4 lg:px-5 py-1.5 lg:py-2 text-xs lg:text-sm font-bold border border-warm-600 text-warm-300 hover:text-warm-100 hover:border-warm-400 rounded-lg transition-all bg-warm-900/80 backdrop-blur-sm"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleStart(featuredMeta.id)}
                      disabled={isSubmitting}
                      className="px-6 lg:px-8 py-1.5 lg:py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-warm-950 font-bold rounded-lg text-xs lg:text-sm transition-all transform hover:scale-105 shadow-lg shadow-yellow-500/20 disabled:opacity-50"
                    >
                      Play
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : featuredMeta ? (
            <div className="bg-warm-900/60 border border-warm-700/40 rounded-xl p-6 lg:p-8 mb-4 lg:mb-6">
              <div className="text-warm-500 animate-pulse">Loading...</div>
            </div>
          ) : (
            <div className="text-warm-600 italic py-6 lg:py-8 mb-4 lg:mb-6">No sets available</div>
          )}

          {setMetas.length > 1 && (
            <button
              onClick={() => setShowAllSets(true)}
              className="text-warm-400 hover:text-gold text-xs lg:text-sm transition-colors font-heading tracking-wide"
            >
              See All Sets ({setMetas.length}) &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
