import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import React, { useRef } from 'react';
import { DraggableCard, DroppableBurnZone } from './DndComponents';
import { GAME_SHORTCUTS } from './GameKeyboardShortcuts';
import burnIcon from '../../burn.svg';

export function Shop() {
  const { view, selection, setSelection, burnHandCard, burnBoardUnit, undo } = useGameStore();
  const handBg = useCustomizationStore((s) => s.selections.handBackground);
  const [isBurnHovered, setIsBurnHovered] = React.useState(false);
  const [isNewRound, setIsNewRound] = React.useState(false);
  const prevRoundRef = useRef(view?.round);

  // Detect round changes for staggered card entrance.
  // Timeout must cover the last card's delay + animation duration:
  // (maxIndex * 80ms stagger) + 500ms animation + 100ms buffer
  React.useEffect(() => {
    if (view && view.round !== prevRoundRef.current) {
      prevRoundRef.current = view.round;
      setIsNewRound(true);
      const cardCount = view.hand.filter(Boolean).length;
      const duration = Math.max(cardCount - 1, 0) * 80 + 600;
      const timer = setTimeout(() => setIsNewRound(false), duration);
      return () => clearTimeout(timer);
    }
  }, [view]);

  if (!view) return null;

  // Defensive check for hand array
  if (!view.hand || !Array.isArray(view.hand)) {
    console.error('Shop: view.hand is invalid:', view.hand);
    return <div className="text-red-500">Error: Hand data not available</div>;
  }

  const handleHandSlotClick = (index: number) => {
    const card = view.hand[index];

    if (card) {
      // Toggle selection
      if (selection?.type === 'hand' && selection.index === index) {
        setSelection(null);
      } else {
        setSelection({ type: 'hand', index });
      }
    }
  };

  const handleBurnClick = () => {
    if (selection?.type === 'hand') {
      burnHandCard(selection.index);
      setSelection(null);
    } else if (selection?.type === 'board') {
      burnBoardUnit(selection.index);
      setSelection(null);
    }
  };
  const canBurn = selection?.type === 'hand' || selection?.type === 'board';

  return (
    <div
      role="region"
      aria-label="Your Hand"
      className={`shop h-full border-t border-warm-800/60 relative ${handBg ? '' : 'bg-shop-bg'}`}
      style={
        handBg
          ? {
              backgroundImage: `url(${handBg.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {handBg && <div className="absolute inset-0 bg-shop-bg/50" />}
      <div className="flex h-full relative z-10">
        {/* Left: Undo Button */}
        <div className="shop-side w-14 lg:w-32 h-full flex flex-col items-center justify-center border-r border-warm-700/50">
          <button
            onClick={undo}
            disabled={!view.can_undo}
            aria-keyshortcuts={GAME_SHORTCUTS.undo}
            className={`action-circle w-10 h-10 lg:w-16 lg:h-16 rounded-full flex items-center justify-center transition-all border-2 ${
              view.can_undo
                ? 'bg-gradient-to-br from-warm-600 to-warm-700 border-warm-400/50 text-warm-100 hover:from-warm-500 hover:to-warm-600 cursor-pointer shadow-elevation-rest hover:shadow-elevation-hover'
                : 'bg-warm-800 border-warm-700 text-warm-600 cursor-not-allowed'
            }`}
            title={`Undo last action (${GAME_SHORTCUTS.undo})`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 lg:w-8 lg:h-8"
            >
              <path
                fillRule="evenodd"
                d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div className="hidden lg:block text-[10px] text-warm-500 mt-2">
            Undo ({GAME_SHORTCUTS.undo})
          </div>
        </div>

        {/* Center: Hand */}
        <div className="shop-hand flex-1 flex flex-col items-center justify-center overflow-hidden relative">
          {/* Hand label - desktop only */}
          <div className="board-helper hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 items-center gap-3 rounded-full border border-warm-700/60 bg-black/45 px-4 py-1.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm">
            <span className="text-sm text-warm-100">Hand</span>
            <span className="text-xs text-warm-200/85">({view.bag_count} in bag)</span>
          </div>
          <div className="hand-row flex items-center justify-center gap-2 lg:gap-4 h-full w-full lg:max-w-3xl px-2 lg:px-4">
            {view.hand.map((card, i) =>
              card ? (
                <div
                  key={`hand-${card.id}-${i}`}
                  className={`flex-1 min-w-0 h-full flex items-center justify-center ${isNewRound ? 'animate-card-entrance' : ''}`}
                  style={{
                    containerType: 'size',
                    ...(isNewRound ? { animationDelay: `${i * 80}ms` } : undefined),
                  }}
                >
                  <div
                    className="aspect-[3/4]"
                    style={{ width: 'min(100cqw, calc(100cqh * 3 / 4))' }}
                  >
                    <DraggableCard
                      id={`hand-${i}`}
                      card={card}
                      showCost={true}
                      showBurn={true}
                      can_afford={view.can_afford[i]}
                      isSelected={selection?.type === 'hand' && selection.index === i}
                      onClick={() => handleHandSlotClick(i)}
                    />
                  </div>
                </div>
              ) : (
                <div
                  key={`hand-empty-${i}`}
                  className="flex-1 min-w-0 h-full flex items-center justify-center"
                  style={{ containerType: 'size' }}
                >
                  <div
                    className="aspect-[3/4] rounded-lg border-2 border-dashed border-warm-700/50 bg-warm-800/20 flex items-center justify-center"
                    style={{ width: 'min(100cqw, calc(100cqh * 3 / 4))' }}
                  >
                    <span className="text-warm-700/40 text-lg">&#9724;</span>
                  </div>
                </div>
              )
            )}
          </div>
          <div className="board-helper hidden lg:flex absolute bottom-3 left-1/2 -translate-x-1/2 justify-center">
            <div className="rounded-full border border-warm-800/70 bg-black/45 px-4 py-1.5 text-center text-xs text-warm-200/85 shadow-[0_6px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm">
              Select: {GAME_SHORTCUTS.hand}
            </div>
          </div>
        </div>

        {/* Right: Burn Zone */}
        <DroppableBurnZone onHoverChange={setIsBurnHovered}>
          <button
            type="button"
            onClick={handleBurnClick}
            disabled={!canBurn}
            aria-keyshortcuts={GAME_SHORTCUTS.burn}
            title={`Burn selected card or unit (${GAME_SHORTCUTS.burn})`}
            className={`shop-side w-14 lg:w-32 h-full flex flex-col items-center justify-center border-l border-warm-700/50 transition-all duration-200 ${
              isBurnHovered ? 'bg-red-900/20' : ''
            } ${canBurn ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
          >
            <img
              src={burnIcon}
              alt="Burn Card"
              className={`burn-circle w-10 h-10 lg:w-20 lg:h-20 transition-all duration-200 ${
                isBurnHovered
                  ? 'scale-115 drop-shadow-[0_0_12px_rgba(234,88,12,0.4)]'
                  : 'opacity-80 hover:opacity-100 hover:scale-105'
              }`}
            />
            <div
              className={`burn-hint hidden lg:block text-[10px] mt-1 text-center px-2 ${isBurnHovered ? 'text-orange-400 font-bold' : 'text-warm-500'}`}
            >
              {isBurnHovered
                ? `BURN IT! (${GAME_SHORTCUTS.burn})`
                : `Burn (${GAME_SHORTCUTS.burn})`}
            </div>
          </button>
        </DroppableBurnZone>
      </div>
    </div>
  );
}
