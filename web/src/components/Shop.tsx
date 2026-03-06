import { useGameStore } from '../store/gameStore';
import { useCustomizationStore } from '../store/customizationStore';
import React, { useRef } from 'react';
import { DraggableCard, DroppableAshPile } from './DndComponents';
import { CARD_SIZES } from '../constants/cardSizes';
import ashpileIcon from '../../ashpile.svg';

export function Shop({ expandMobile = false }: { expandMobile?: boolean }) {
  const { view, selection, setSelection, setMobileTab, pitchHandCard, pitchBoardUnit, playHandCard, undo } = useGameStore();
  const handBg = useCustomizationStore((s) => s.selections.handBackground);
  const [isAshHovered, setIsAshHovered] = React.useState(false);
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
  }, [view?.round]);

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

  const handleAshClick = () => {
    if (selection?.type === 'hand') {

      pitchHandCard(selection.index);
      setSelection(null);
    } else if (selection?.type === 'board') {

      pitchBoardUnit(selection.index);
      setSelection(null);
    }
  };

  // Mobile: selected hand card data
  const mobileSelected = expandMobile && selection?.type === 'hand' ? view.hand[selection.index] : null;
  const mobileCanAfford = expandMobile && selection?.type === 'hand' ? view.can_afford[selection.index] : false;

  // Ability cycling for mobile bottom bar
  const [abilityIdx, setAbilityIdx] = React.useState(0);
  const prevSelKey = useRef<string | null>(null);
  const selKey = mobileSelected ? `${mobileSelected.id}-${selection?.index}` : null;
  if (selKey !== prevSelKey.current) {
    prevSelKey.current = selKey;
    if (abilityIdx !== 0) setAbilityIdx(0);
  }

  const handleMobilePitch = () => {
    if (selection?.type === 'hand') {

      pitchHandCard(selection.index);
      setSelection(null);
    }
  };

  const boardFull = !view.board.some((u) => !u);

  const handleMobileDeploy = () => {
    if (selection?.type === 'hand') {
      // Find first empty board slot and place card there
      const emptySlot = view.board.findIndex((u) => !u);
      if (emptySlot !== -1) {

        playHandCard(selection.index, emptySlot);
        // playHandCard switches to board tab automatically
      } else {
        // Board full — just switch to board view
        setMobileTab('board');
      }
    }
  };

  return (
    <div
      className={`shop zone-divider ${expandMobile ? 'h-full' : 'h-[8.5rem]'} lg:h-[17rem] border-t border-warm-800/60 relative ${handBg ? '' : 'bg-shop-bg'}`}
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
      <div className={`flex ${expandMobile ? 'flex-col' : ''} h-full relative z-10`}>
        {/* Main row: [Cards] [Actions (right)] */}
        <div className="flex flex-1 min-h-0">
          {/* Desktop left: Undo Button */}
          <div className="shop-side hidden lg:flex w-32 h-full flex-col items-center justify-center border-r border-warm-700/50">
            <button
              onClick={undo}
              disabled={!view.can_undo}
              className={`action-circle w-16 h-16 rounded-full flex items-center justify-center transition-all border-2 ${
                view.can_undo
                  ? 'bg-gradient-to-br from-warm-600 to-warm-700 border-warm-400/50 text-warm-100 hover:from-warm-500 hover:to-warm-600 cursor-pointer shadow-elevation-rest hover:shadow-elevation-hover'
                  : 'bg-warm-800 border-warm-700 text-warm-600 cursor-not-allowed'
              }`}
              title="Undo last action"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-8 h-8"
              >
                <path
                  fillRule="evenodd"
                  d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <div className="text-[10px] text-warm-500 mt-2">Undo</div>
          </div>

          {/* Center: Hand */}
          <div className="shop-hand flex-1 flex flex-col items-center justify-center overflow-hidden relative">
            {/* Hand label - desktop only */}
            <div className="hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 items-center gap-2">
              <span className="text-sm text-warm-400">Hand</span>
              <span className="text-xs text-warm-500">({view.bag_count} in deck)</span>
            </div>
            <div className="hand-row flex gap-2 lg:gap-4 lg:mt-4">
              {view.hand.map((card, i) =>
                card ? (
                  <div
                    key={`hand-${card.id}-${i}`}
                    className={isNewRound ? 'animate-card-entrance' : ''}
                    style={
                      isNewRound
                        ? { animationDelay: `${i * 80}ms` }
                        : undefined
                    }
                  >
                    <DraggableCard
                      id={`hand-${i}`}
                      card={card}
                      showCost={true}
                      showPitch={true}
                      can_afford={view.can_afford[i]}
                      isSelected={selection?.type === 'hand' && selection.index === i}
                      onClick={() => handleHandSlotClick(i)}
                    />
                  </div>
                ) : (
                  <div
                    key={`hand-empty-${i}`}
                    className={`card-slot-placeholder ${CARD_SIZES.standard.tw} rounded-lg border-2 border-dashed border-warm-700/50 bg-warm-800/20 flex items-center justify-center`}
                  >
                    <span className="text-warm-700/40 text-lg">&#9724;</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Mobile right: Deploy column (full height, like battle button) */}
          {expandMobile && (
            <div className="lg:hidden flex flex-col items-center justify-center w-20 flex-shrink-0 border-l border-warm-700/50 px-1.5 py-1">
              <button
                onClick={handleMobileDeploy}
                disabled={!mobileSelected || !mobileCanAfford || boardFull}
                className={`flex-1 w-full flex flex-col items-center justify-center rounded-lg border transition-colors ${
                  mobileSelected && mobileCanAfford && !boardFull
                    ? 'battle-btn border-amber-500/60 active:scale-95'
                    : 'bg-warm-800 border-warm-700 opacity-40 cursor-not-allowed'
                }`}
              >
                <svg className={`w-7 h-7 ${mobileSelected && mobileCanAfford && !boardFull ? 'text-amber-900' : 'text-warm-500'}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className={`text-[0.55rem] font-bold uppercase tracking-wide mt-0.5 ${mobileSelected && mobileCanAfford && !boardFull ? 'text-amber-900' : 'text-warm-500'}`}>
                  {boardFull ? 'Full' : 'Deploy'}
                </span>
                {mobileSelected && (
                  <span className={`text-[0.6rem] font-bold flex items-center gap-0.5 ${mobileCanAfford ? 'text-mana-blue' : 'text-red-300'}`}>
                    {mobileSelected.play_cost}
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Desktop right: Ash Pile */}
          <DroppableAshPile onHoverChange={setIsAshHovered}>
            <div
              className={`shop-side hidden lg:flex w-32 h-full flex-col items-center justify-center border-l border-warm-700/50 transition-all duration-200 cursor-pointer ${isAshHovered ? 'bg-red-900/20' : ''}`}
              onClick={handleAshClick}
            >
              <img
                src={ashpileIcon}
                alt="Ash Pile"
                className={`ash-circle w-14 h-14 lg:w-20 lg:h-20 transition-all duration-200 ${
                  isAshHovered
                    ? 'scale-115 drop-shadow-[0_0_12px_rgba(234,88,12,0.4)]'
                    : 'opacity-80 hover:opacity-100 hover:scale-105'
                }`}
              />
              <div className={`ash-hint text-[10px] mt-1 text-center px-2 ${isAshHovered ? 'text-orange-400 font-bold' : 'text-warm-500'}`}>
                {isAshHovered ? 'BURN IT!' : 'Ash Pile'}
              </div>
            </div>
          </DroppableAshPile>
        </div>

        {/* Mobile bottom bar: ability info + pitch (droppable) + undo */}
        {expandMobile && (
          <div className="lg:hidden flex-shrink-0 flex items-center gap-2 safe-area-lr py-1 bg-warm-900/95 border-t border-warm-700/50">
            <div
              className="flex-1 min-w-0 mr-2 cursor-pointer"
              onClick={() => {
                if (mobileSelected && mobileSelected.abilities.length > 1) {
                  setAbilityIdx((i) => (i + 1) % mobileSelected.abilities.length);
                }
              }}
            >
              {mobileSelected && mobileSelected.abilities.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-warm-300 italic truncate flex-1 min-w-0">
                    <span className="text-amber-400 font-bold not-italic">{mobileSelected.abilities[abilityIdx % mobileSelected.abilities.length].name}:</span>{' '}
                    {mobileSelected.abilities[abilityIdx % mobileSelected.abilities.length].description}
                  </p>
                  {mobileSelected.abilities.length > 1 && (
                    <div className="flex-shrink-0 flex items-center gap-0.5">
                      {mobileSelected.abilities.map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === abilityIdx % mobileSelected.abilities.length ? 'bg-amber-400' : 'bg-warm-600'}`} />
                      ))}
                    </div>
                  )}
                </div>
              ) : mobileSelected ? (
                <p className="text-xs text-warm-500 italic">No abilities</p>
              ) : (
                <p className="text-xs text-warm-500 italic">Tap a card to see details</p>
              )}
            </div>
            {/* Pitch button — also a drag target */}
            <DroppableAshPile onHoverChange={setIsAshHovered} zoneId="ash-pile-mobile">
              <button
                onClick={handleMobilePitch}
                disabled={!mobileSelected}
                className={`flex-shrink-0 h-10 px-5 rounded-none flex items-center gap-2 border-2 border-dashed transition-colors ${
                  isAshHovered
                    ? 'bg-red-900/40 border-red-500/70'
                    : mobileSelected
                      ? 'bg-warm-800/80 border-warm-500/40 active:bg-warm-700/80'
                      : 'bg-warm-800/50 border-warm-700/30 opacity-40 cursor-not-allowed'
                }`}
                title="Pitch card — or drag here"
              >
                <img src={ashpileIcon} alt="Pitch" className={`w-6 h-6 ${mobileSelected || isAshHovered ? 'opacity-90' : 'opacity-40'}`} />
                <span className={`text-[0.6rem] font-bold uppercase ${isAshHovered ? 'text-orange-400' : mobileSelected ? 'text-red-400' : 'text-warm-600'}`}>
                  {isAshHovered ? 'Burn!' : 'Pitch'}
                </span>
                {mobileSelected && !isAshHovered && (
                  <span className="text-[0.6rem] font-bold text-mana-blue">
                    +{mobileSelected.pitch_value}
                  </span>
                )}
              </button>
            </DroppableAshPile>
            {/* Undo button */}
            <button
              onClick={undo}
              disabled={!view.can_undo}
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                view.can_undo
                  ? 'bg-warm-700 text-warm-200 active:bg-warm-600'
                  : 'bg-warm-800 text-warm-600 cursor-not-allowed'
              }`}
              title="Undo"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
