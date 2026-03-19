import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import { SetPreviewOverlay } from './SetPreviewOverlay';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';

export function CardsPage() {
  const { engine, init, setMetas, setPreviewCards, loadSetPreviews, previewSet } = useGameStore();

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
      <TopBar backTo="/" backLabel="Menu" title="Cards" />

      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto p-3 lg:p-6">
          {/* Sandbox CTA */}
          <Link
            to="/sandbox"
            className="block w-full mb-4 lg:mb-6 p-3 lg:p-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-600/5 hover:border-amber-400 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] active:scale-[0.99] transition-all text-center"
          >
            <span className="font-heading text-sm lg:text-base font-bold text-white tracking-wide">
              See All Cards in the Sandbox
            </span>
            <p className="text-warm-500 text-[10px] lg:text-xs mt-0.5">
              Browse every card and test battles
            </p>
          </Link>

          {sorted.length === 0 ? (
            <div className="text-center py-16 text-warm-500 text-sm">
              {engine ? 'No card sets available.' : 'Loading...'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 lg:gap-4">
              {sorted.map((meta) => {
                const cards = setPreviewCards[meta.id];
                return (
                  <button
                    key={meta.id}
                    onClick={() => previewSet(meta.id)}
                    className="bg-warm-900/80 border border-warm-700/40 hover:border-warm-500 rounded-xl p-3 lg:p-4 transition-all active:scale-[0.98] text-left group"
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
                        <span className="text-warm-600 text-sm">...</span>
                      )}
                    </div>

                    <div className="text-center">
                      <div className="text-xs lg:text-base font-heading text-warm-100 group-hover:text-yellow-400 transition-colors truncate">
                        {meta.name}
                      </div>
                      <div className="text-[0.65rem] lg:text-xs text-warm-500 mt-0.5">
                        {cards ? `${cards.length} cards` : `Set #${meta.id}`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Creator actions */}
          <div className="mt-6 lg:mt-8 grid grid-cols-2 gap-2.5 lg:gap-4">
            <Link
              to="/blockchain/create-card"
              className="p-3 lg:p-4 rounded-xl border border-warm-700 bg-warm-900/30 hover:border-warm-500 transition-all text-center group"
            >
              <div className="font-heading text-sm lg:text-base font-bold text-warm-200 group-hover:text-yellow-400 transition-colors">
                Create a Card
              </div>
              <div className="text-warm-500 text-[10px] lg:text-xs mt-0.5">Design a new card</div>
            </Link>
            <Link
              to="/blockchain/create-set"
              className="p-3 lg:p-4 rounded-xl border border-warm-700 bg-warm-900/30 hover:border-warm-500 transition-all text-center group"
            >
              <div className="font-heading text-sm lg:text-base font-bold text-warm-200 group-hover:text-yellow-400 transition-colors">
                Create a Set
              </div>
              <div className="text-warm-500 text-[10px] lg:text-xs mt-0.5">Build a card set</div>
            </Link>
          </div>
        </div>
      </div>

      <SetPreviewOverlay />
    </div>
  );
}
