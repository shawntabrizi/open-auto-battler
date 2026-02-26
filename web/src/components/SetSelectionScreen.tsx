import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { getCardArtSm } from '../utils/cardArt';

export function SetSelectionScreen() {
  const { setMetas, startGame, previewSet, setPreviewCards, loadSetPreviews } = useGameStore();

  useEffect(() => {
    loadSetPreviews();
  }, [loadSetPreviews]);

  const sortedSets = [...setMetas].sort((a, b) => a.id - b.id);

  return (
    <div
      className="h-full flex flex-col items-center justify-center px-4 lg:px-8 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 30%, rgba(212,168,67,0.08) 0%, transparent 60%), radial-gradient(ellipse at 50% 80%, rgba(180,83,9,0.05) 0%, transparent 50%), #0e0c09',
      }}
    >
      {/* Header */}
      <div className="text-center mb-4 lg:mb-8 flex-shrink-0">
        <h1 className="font-title text-2xl lg:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-orange-500 mb-1 lg:mb-2">
          Choose Your Set
        </h1>
        <p className="text-warm-400 text-xs lg:text-base">
          Each set brings unique cards and strategies.
        </p>
      </div>

      {/* Set tiles — fill remaining space */}
      {sortedSets.length > 0 ? (
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 w-full max-w-6xl flex-1 min-h-0 items-stretch justify-center pb-2 lg:pb-4">
          {sortedSets.map((meta, i) => {
            const cards = setPreviewCards[meta.id] || [];
            const fanCards = [...cards].sort((a, b) => b.play_cost - a.play_cost).slice(0, 5);
            const fanImages = fanCards
              .map((c) => ({ id: c.id, src: getCardArtSm(c.id) }))
              .filter((x) => x.src !== null) as { id: number; src: string }[];

            return (
              <div
                key={meta.id}
                onClick={() => startGame(meta.id)}
                className="set-tile opacity-0 animate-stagger-fade-in rounded-2xl lg:rounded-3xl p-4 lg:p-8 flex flex-col items-center justify-center flex-1 min-h-0 cursor-pointer"
                style={{
                  animationDelay: `${i * 100}ms`,
                  animationFillMode: 'forwards',
                }}
              >
                {/* Card art fan */}
                <div className="set-card-fan mx-auto mb-3 lg:mb-6">
                  {fanImages.slice(0, 5).map((img, j) => {
                    const count = Math.min(fanImages.length, 5);
                    const mid = (count - 1) / 2;
                    const rotation = (j - mid) * 8;
                    const translateX = (j - mid) * 36;
                    return (
                      <img
                        key={img.id}
                        src={img.src}
                        alt=""
                        className="set-card-fan-img"
                        style={
                          {
                            '--fan-x': `${translateX}px`,
                            '--fan-rot': `${rotation}deg`,
                            zIndex: j,
                          } as React.CSSProperties
                        }
                      />
                    );
                  })}
                </div>

                {/* Set info */}
                <h2 className="font-heading text-xl lg:text-3xl text-white mb-1 text-center w-full">
                  {meta.name}
                </h2>
                <p className="text-warm-400 text-sm lg:text-base text-center w-full">
                  {cards.length} cards
                </p>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    previewSet(meta.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      previewSet(meta.id);
                    }
                  }}
                  className="text-warm-500 hover:text-amber-400 text-xs lg:text-sm mt-1 transition-colors"
                >
                  Preview cards &rsaquo;
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-warm-600 italic py-8">No sets available</div>
      )}

      {/* Back link */}
      <Link
        to="/"
        className="flex-shrink-0 mt-2 lg:mt-4 pb-2 text-sm text-warm-500 hover:text-warm-300 transition-colors"
      >
        &larr; Back to Main Menu
      </Link>
    </div>
  );
}
