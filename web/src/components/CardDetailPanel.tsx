import React from 'react';
import { toast } from 'react-hot-toast';
import { useGameStore } from '../store/gameStore';
import { useArenaStore } from '../store/arenaStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useIsSubmitting } from '../store/txStore';
import type { BoardUnitView, CardView } from '../types';
import { getCardEmoji } from '../utils/emoji';
import { getCardArtMd } from '../utils/cardArt';
import { formatAbilitySentence } from '../utils/abilityText';
import { UI_LAYERS } from '../constants/uiLayers';

/** Card art image with loading state — remount via key={card.id} to reset on card change. */
function CardArtImage({ card }: { card: CardView | BoardUnitView }) {
  const artSrc = getCardArtMd(card.id);
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>(
    artSrc ? 'loading' : 'error'
  );

  return (
    <div className="theme-panel relative w-full aspect-[3/4] overflow-hidden rounded-lg border-2 border-warm-700/70 bg-gradient-to-b from-surface-mid/75 to-surface-dark shadow-elevation-rest lg:rounded-xl">
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
          className="text-sm lg:text-xl font-bold text-white leading-tight truncate"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {card.name}
        </h2>
        <div className="flex gap-1.5 mt-1">
          <span className="px-1.5 py-0.5 bg-burn-red/15 text-burn-red border border-burn-red/40 rounded text-[10px] lg:text-xs font-bold">
            ATK: {card.attack}
          </span>
          <span className="px-1.5 py-0.5 bg-victory-green/15 text-victory-green border border-victory-green/40 rounded text-[10px] lg:text-xs font-bold">
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

// Blockchain account type
export interface BlockchainAccount {
  address: string;
  name?: string;
  source?: string;
}

// Discriminated union for panel modes
export type CardDetailPanelMode =
  | { type: 'standard' }
  | { type: 'sandbox' }
  | { type: 'readOnly' }
  | {
      type: 'blockchain';
      blockNumber: number | null;
      accounts: BlockchainAccount[];
      selectedAccount?: BlockchainAccount;
      onSelectAccount?: (account: BlockchainAccount | undefined) => void;
    }
  | {
      type: 'tournament';
      blockNumber: number | null;
      accounts: BlockchainAccount[];
      selectedAccount?: BlockchainAccount;
      onSelectAccount?: (account: BlockchainAccount | undefined) => void;
    };

export interface CardDetailPanelProps {
  card: CardView | BoardUnitView | null;
  isVisible: boolean;
  mode?: CardDetailPanelMode;
  layout?: 'fixed' | 'contained';
  onClose?: () => void;
}

export function CardDetailPanel({
  card,
  isVisible,
  mode,
  layout = 'fixed',
  onClose,
}: CardDetailPanelProps) {
  const [showForfeitConfirm, setShowForfeitConfirm] = React.useState(false);
  const isSubmitting = useIsSubmitting();
  const { cardNameMap, setSelection, showRawJson, newRun } = useGameStore();
  const abandonGame = useArenaStore((state) => state.abandonGame);
  const abandonTournament = useTournamentStore((state) => state.abandonTournament);

  const resolvedMode: CardDetailPanelMode = mode ?? { type: 'standard' };
  const resolveCardName = React.useCallback((cardId: number) => cardNameMap[cardId], [cardNameMap]);
  const cardRawJson = React.useMemo(() => prettyJson(card), [card]);
  const forfeitContext =
    resolvedMode.type === 'tournament'
      ? {
          title: 'Surrender?',
          subtitle: 'Your tournament journey ends here.',
          confirmation: 'All progress will be sealed. There is no returning to this battle.',
          success: 'You have surrendered.',
          accent: 'from-accent-violet/20 via-defeat-red/10 to-transparent',
        }
      : resolvedMode.type === 'blockchain'
        ? {
            title: 'Surrender?',
            subtitle: 'Your battle record ends here.',
            confirmation: 'This run will be lost to the chain forever. There is no turning back.',
            success: 'You have surrendered.',
            accent: 'from-gold/20 via-defeat-red/10 to-transparent',
          }
        : {
            title: 'Surrender?',
            subtitle: 'Your current run will be lost.',
            confirmation: 'All progress is gone. You will start fresh from the beginning.',
            success: 'You have surrendered.',
            accent: 'from-gold/15 via-defeat-red/10 to-transparent',
          };

  React.useEffect(() => {
    if (!isVisible && showForfeitConfirm) {
      setShowForfeitConfirm(false);
    }
  }, [isVisible, showForfeitConfirm]);

  const handleForfeit = React.useCallback(async () => {
    try {
      if (resolvedMode.type === 'blockchain') {
        await abandonGame();
      } else if (resolvedMode.type === 'tournament') {
        await abandonTournament();
      } else {
        newRun();
      }
      toast.success(forfeitContext.success);
      setShowForfeitConfirm(false);
      setSelection(null);
    } catch (err) {
      console.error('Forfeit failed:', err);
    }
  }, [
    abandonGame,
    abandonTournament,
    forfeitContext.success,
    newRun,
    resolvedMode.type,
    setSelection,
  ]);

  if (!isVisible) return null;

  const isContainedLayout = layout === 'contained';
  const containerClassName = isContainedLayout
    ? 'relative h-full min-h-0 w-full shrink-0 rounded-none overflow-hidden sm:rounded-2xl'
    : 'fixed top-0 left-0 bottom-0 w-44 lg:w-80';
  const frameClassName = isContainedLayout
    ? 'border-0 border-warm-700 rounded-none sm:border sm:rounded-2xl'
    : 'border-r border-warm-700';
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
          <div className="theme-icon-warning text-2xl lg:text-4xl mb-2 lg:mb-4">👆</div>
          <h3 className="theme-title-text mb-1 bg-clip-text text-sm font-bold text-transparent lg:mb-2 lg:text-lg">
            Select a Card
          </h3>
          <p className="text-[10px] lg:text-sm text-warm-400">Tap any card to view details.</p>
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
          <div className="theme-panel flex-1 min-w-0 p-1.5 lg:p-3 bg-mana-blue/10 border border-mana-blue/30 rounded-lg">
            <div className="text-[8px] lg:text-[10px] text-mana-blue uppercase font-bold mb-0.5 lg:mb-1">
              Cost
            </div>
            <div className="text-sm lg:text-xl font-bold text-white">
              {card.play_cost} <span className="text-mana-blue text-[10px] lg:text-sm">Mana</span>
            </div>
          </div>
          <div className="theme-panel flex-1 min-w-0 p-1.5 lg:p-3 bg-burn-gold/10 border border-burn-gold/30 rounded-lg">
            <div className="text-[8px] lg:text-[10px] text-burn-gold uppercase font-bold mb-0.5 lg:mb-1">
              Burn
            </div>
            <div className="text-sm lg:text-xl font-bold text-white">
              +{card.burn_value} <span className="text-burn-gold text-[10px] lg:text-sm">Mana</span>
            </div>
          </div>
        </div>

        {/* Ability Section */}
        {allAbilities.length > 0 && (
          <div>
            {allAbilities.map((ability, index) => (
              <div
                key={index}
                className="theme-panel mb-2 rounded-lg border border-warm-700/70 bg-surface-mid/25 p-2 shadow-elevation-rest last:mb-0 lg:mb-4 lg:p-3"
              >
                <h3 className="text-xs lg:text-md font-bold text-gold mb-1 lg:mb-2">
                  {allAbilities.length > 1 ? `Ability ${index + 1}` : 'Ability'}
                </h3>
                <div className="rounded border border-warm-700/50 bg-surface-dark/70 p-1.5 text-[10px] italic text-warm-100 lg:p-2 lg:text-sm">
                  {formatAbilitySentence(ability, { resolveCardName })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-col gap-1 border-t border-warm-700/60 pt-4 font-mono text-[10px] text-warm-500">
          <div>CARD_ID: {card.id}</div>
        </div>

        {/* Card Raw JSON */}
        {showRawJson && (
          <div className="mt-4 rounded border border-warm-700/60 bg-surface-dark/70 p-2">
            <div className="text-[10px] text-warm-500 mb-1 flex justify-between items-center">
              <span>CARD_DATA.JSON</span>
              <button
                onClick={() => navigator.clipboard.writeText(cardRawJson)}
                className="text-mana-blue hover:text-white font-mono text-[9px]"
              >
                Copy
              </button>
            </div>
            <pre className="text-[9px] text-mana-blue/80 custom-scrollbar max-h-48 overflow-auto">
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
    <>
      <div
        className={`card-detail-panel ${
          isContainedLayout ? 'card-detail-panel--contained' : 'card-detail-panel--fixed'
        } ${containerClassName} ${frameClassName} theme-panel app-shell bg-surface-dark/95 shadow-2xl flex flex-col z-30`}
      >
        {/* Header */}
        <div
          className={`border-b border-warm-700/70 bg-gradient-to-r from-surface-mid/30 via-surface-dark/40 to-surface-dark/75 py-2 px-3 lg:px-5 lg:py-3 flex items-center ${
            isContainedLayout ? 'justify-between' : ''
          }`}
        >
          <div className="theme-title-text bg-clip-text text-xs font-bold uppercase tracking-wider text-transparent">
            Card Details
          </div>
          {isContainedLayout && (
            <button
              onClick={handleClose}
              className="text-warm-500 hover:text-warm-200 text-sm leading-none p-1 transition-colors"
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
          className={`flex-1 overflow-y-auto custom-scrollbar outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset ${contentPaddingClass}`}
        >
          {renderCardTab()}
        </div>

        {/* Footer */}
        <div className="border-t border-warm-700/60 bg-surface-dark/70 p-1 text-center text-[6px] uppercase tracking-tighter text-warm-600 lg:p-4 lg:text-[10px]">
          Open Auto Battler Engine v0.2.0
        </div>
      </div>

      {showForfeitConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
          style={{ zIndex: UI_LAYERS.confirmDialog }}
        >
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!isSubmitting) {
                setShowForfeitConfirm(false);
              }
            }}
          />
          <div className="theme-panel relative w-full max-w-sm overflow-hidden rounded-2xl border border-warm-700/60 bg-surface-dark shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
            <div className={`absolute inset-0 bg-gradient-to-br ${forfeitContext.accent}`} />
            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-warm-400/30 to-transparent" />

            <div className="relative p-6 lg:p-7 flex flex-col items-center text-center">
              <h2
                className="font-title text-3xl lg:text-4xl font-bold tracking-wide uppercase text-defeat-red"
                style={{
                  textShadow: '0 2px 12px rgba(168, 58, 42, 0.5), 0 0 40px rgba(168, 58, 42, 0.2)',
                }}
              >
                {forfeitContext.title}
              </h2>

              <p className="mt-4 text-base font-semibold text-warm-200">
                {forfeitContext.subtitle}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-warm-400">
                {forfeitContext.confirmation}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={() => setShowForfeitConfirm(false)}
                  disabled={isSubmitting}
                  className="battle-btn rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Fight On
                </button>
                <button
                  onClick={() => void handleForfeit()}
                  disabled={isSubmitting}
                  className="rounded-xl border border-red-800/70 bg-red-950/60 px-4 py-3 text-sm font-bold uppercase tracking-wider text-red-300 transition-all hover:bg-red-900/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Surrender
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
