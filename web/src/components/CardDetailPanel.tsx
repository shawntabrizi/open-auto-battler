import React from 'react';
import { useGameStore } from '../store/gameStore';
import type { BoardUnitView, CardView } from '../types';
import { getCardEmoji } from '../utils/emoji';
import { getCardArtMd } from '../utils/cardArt';
import { formatAbilitySentence } from '../utils/abilityText';

/** Card art image with loading state — remount via key={card.id} to reset on card change. */
function CardArtImage({ card }: { card: CardView | BoardUnitView }) {
  const artSrc = getCardArtMd(card.id);
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>(
    artSrc ? 'loading' : 'error'
  );

  return (
    <div className="theme-panel relative w-full aspect-[3/4] overflow-hidden rounded-lg border-2 border-base-700/70 bg-gradient-to-b from-surface-mid/75 to-surface-dark shadow-elevation-rest lg:rounded-xl">
      {/* Emoji shown while loading or on error */}
      {status !== 'loaded' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-mid/80">
          <span className={`text-5xl ${status === 'loading' ? 'animate-pulse' : ''}`}>
            {getCardEmoji(card.id)}
          </span>
        </div>
      )}
      {artSrc && status !== 'error' && (
        <img
          src={artSrc}
          alt={card.name}
          className={`w-full h-full object-cover object-[center_30%] ${status !== 'loaded' ? 'opacity-0' : ''}`}
          style={{ filter: 'brightness(1.1) saturate(1.1)' }}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
      {/* Name overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 lg:p-3">
        <h2
          className="text-sm lg:text-xl font-heading font-bold text-white leading-tight truncate"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {card.name}
        </h2>
        <div className="flex gap-1.5 mt-1">
          <span className="px-1.5 py-0.5 bg-card-attack/15 text-card-attack border border-card-attack/40 rounded text-[10px] lg:text-xs font-stat font-bold">
            ATK: {card.attack}
          </span>
          <span className="px-1.5 py-0.5 bg-victory/15 text-victory border border-victory/40 rounded text-[10px] lg:text-xs font-stat font-bold">
            HP: {card.health}
          </span>
        </div>
      </div>
    </div>
  );
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

export interface CardDetailPanelProps {
  card: CardView | BoardUnitView | null;
  isVisible: boolean;
  layout?: 'fixed' | 'contained';
  onClose?: () => void;
}

export function CardDetailPanel({
  card,
  isVisible,
  layout = 'fixed',
  onClose,
}: CardDetailPanelProps) {
  const { cardNameMap, setSelection, showRawJson } = useGameStore();
  const resolveCardName = React.useCallback((cardId: number) => cardNameMap[cardId], [cardNameMap]);
  const cardRawJson = React.useMemo(() => prettyJson(card), [card]);

  if (!isVisible) return null;

  const isContainedLayout = layout === 'contained';
  const containerClassName = isContainedLayout
    ? 'relative h-full min-h-0 w-full shrink-0 rounded-none overflow-hidden sm:rounded-2xl'
    : 'fixed top-0 left-0 bottom-0 w-44 lg:w-80';
  const frameClassName = isContainedLayout
    ? 'border-0 border-base-700 rounded-none sm:border sm:rounded-2xl'
    : 'border-r border-base-700';
  const contentPaddingClass = isContainedLayout ? 'p-4 lg:p-6' : 'p-3 pr-5 lg:p-5 lg:pr-7';

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }

    setSelection(null);
  };

  const renderCardTab = () => {
    if (!card) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center py-6 lg:py-12 text-center">
          <div className="w-12 h-16 lg:w-32 lg:h-44 mb-2 lg:mb-4 board-slot-engraved rounded-lg border border-base-700/50 flex items-center justify-center">
            <span className="text-base-600/60 text-xl lg:text-5xl font-heading font-bold select-none">?</span>
          </div>
          <h3 className="theme-title-text font-heading mb-1 bg-clip-text text-sm font-bold text-transparent lg:mb-2 lg:text-lg">
            Select a Card
          </h3>
          <p className="text-[10px] lg:text-sm text-base-400">Tap any card to view details.</p>
        </div>
      );
    }

    const allAbilities = [...card.shop_abilities, ...card.battle_abilities];
    const artSection = (
      <div className={isContainedLayout ? 'sticky top-0 self-start' : ''}>
        <CardArtImage key={card.id} card={card} />
      </div>
    );
    const detailSection = (
      <div className="space-y-3 lg:space-y-6">
        {/* Economy Section */}
        <div className="flex gap-1.5 lg:gap-3">
          <div className="theme-panel flex-1 min-w-0 p-1.5 lg:p-3 bg-mana/10 border border-mana/30 rounded-lg">
            <div className="text-[8px] lg:text-[10px] text-mana uppercase font-heading font-bold mb-0.5 lg:mb-1">
              Cost
            </div>
            <div className="text-sm lg:text-xl font-stat font-bold text-white">
              {card.play_cost} <span className="text-mana text-[10px] lg:text-sm">Mana</span>
            </div>
          </div>
          <div className="theme-panel flex-1 min-w-0 p-1.5 lg:p-3 bg-card-burn/10 border border-card-burn/30 rounded-lg">
            <div className="text-[8px] lg:text-[10px] text-card-burn uppercase font-heading font-bold mb-0.5 lg:mb-1">
              Burn
            </div>
            <div className="text-sm lg:text-xl font-stat font-bold text-white">
              +{card.burn_value} <span className="text-card-burn text-[10px] lg:text-sm">Mana</span>
            </div>
          </div>
        </div>

        {/* Ability Section */}
        {allAbilities.length > 0 && (
          <div>
            {allAbilities.map((ability, index) => (
              <div
                key={index}
                className="theme-panel mb-2 rounded-lg border border-base-700/70 bg-surface-mid/25 p-2 shadow-elevation-rest last:mb-0 lg:mb-4 lg:p-3"
              >
                <h3 className="text-xs lg:text-md font-heading font-bold text-accent mb-1 lg:mb-2">
                  {allAbilities.length > 1 ? `Ability ${index + 1}` : 'Ability'}
                </h3>
                <div className="rounded border border-base-700/50 bg-surface-dark/70 p-1.5 text-[10px] italic text-base-100 font-body lg:p-2 lg:text-sm">
                  {formatAbilitySentence(ability, { resolveCardName })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-col gap-1 border-t border-base-700/60 pt-4 font-mono text-[10px] text-base-500">
          <div>CARD_ID: {card.id}</div>
        </div>

        {/* Card Raw JSON */}
        {showRawJson && (
          <div className="mt-4 rounded border border-base-700/60 bg-surface-dark/70 p-2">
            <div className="text-[10px] text-base-500 mb-1 flex justify-between items-center">
              <span>CARD_DATA.JSON</span>
              <button
                onClick={() => navigator.clipboard.writeText(cardRawJson)}
                className="text-mana hover:text-white font-mono text-[9px]"
              >
                Copy
              </button>
            </div>
            <pre className="text-[9px] text-mana/80 custom-scrollbar max-h-48 overflow-auto">
              {cardRawJson}
            </pre>
          </div>
        )}
      </div>
    );

    if (!isContainedLayout) {
      return (
        <>
          <div className="mb-3 lg:mb-6">{artSection}</div>
          {detailSection}
        </>
      );
    }

    return (
      <div className="grid grid-cols-[0.9fr_1.1fr] items-start gap-3 lg:gap-8">
        {artSection}
        {detailSection}
      </div>
    );
  };

  return (
    <div
      className={`card-detail-panel ${
        isContainedLayout ? 'card-detail-panel--contained' : 'card-detail-panel--fixed'
      } ${containerClassName} ${frameClassName} theme-panel app-shell bg-surface-dark/95 shadow-2xl flex flex-col z-30`}
    >
      {/* Header */}
      <div
        className={`border-b border-base-700/70 bg-gradient-to-r from-surface-mid/30 via-surface-dark/40 to-surface-dark/75 py-2 px-3 lg:px-5 lg:py-3 flex items-center ${
          isContainedLayout ? 'justify-between' : ''
        }`}
      >
        <div className="theme-title-text font-heading bg-clip-text text-xs font-bold uppercase tracking-wider text-transparent lg:text-sm">
          Card Details
        </div>
        {isContainedLayout && (
          <button
            onClick={handleClose}
            className="text-base-500 hover:text-base-200 text-sm leading-none p-1 transition-colors"
            aria-label="Close card details"
          >
            &#x2715;
          </button>
        )}
      </div>

      {/* Content */}
      <div
        data-card-detail-scroll-region="true"
        role="region"
        aria-label="Card details"
        tabIndex={0}
        className={`flex-1 overflow-y-auto custom-scrollbar outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${contentPaddingClass}`}
      >
        {renderCardTab()}
      </div>

      {/* Footer */}
      {isContainedLayout && onClose ? (
        <div className="border-t border-base-700/60 bg-surface-dark/70 p-3 lg:p-4">
          <button
            onClick={handleClose}
            className="w-full py-2.5 lg:py-3 rounded-lg bg-base-700/60 hover:bg-base-600/60 border border-base-600/50 text-base-300 hover:text-white text-sm lg:text-base font-heading font-bold uppercase tracking-wider transition-colors"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="border-t border-base-700/60 bg-surface-dark/70 p-1 text-center text-[6px] uppercase tracking-tighter text-base-600 font-mono lg:p-4 lg:text-[10px]">
          Open Auto Battler Engine v0.2.0
        </div>
      )}
    </div>
  );
}
