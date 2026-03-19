import React from 'react';
import { toast } from 'react-hot-toast';
import { useGameStore } from '../store/gameStore';
import { useBlockchainStore } from '../store/blockchainStore';
import { useTournamentStore } from '../store/tournamentStore';
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
    <div className="relative w-full aspect-[3/4] bg-warm-800 rounded-lg lg:rounded-xl border-2 border-warm-700 overflow-hidden shadow-inner">
      {/* Emoji shown while loading or on error */}
      {status !== 'loaded' && (
        <div className="absolute inset-0 flex items-center justify-center bg-warm-800">
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
          <span className="px-1.5 py-0.5 bg-red-900/60 text-red-400 border border-red-800/50 rounded text-[10px] lg:text-xs font-bold">
            ATK: {card.attack}
          </span>
          <span className="px-1.5 py-0.5 bg-green-900/60 text-green-400 border border-green-800/50 rounded text-[10px] lg:text-xs font-bold">
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
}

export function CardDetailPanel({ card, isVisible, mode, layout = 'fixed' }: CardDetailPanelProps) {
  const [showForfeitConfirm, setShowForfeitConfirm] = React.useState(false);
  const [forfeitPending, setForfeitPending] = React.useState(false);
  const { cardNameMap, selection, burnHandCard, burnBoardUnit, setSelection, showRawJson, newRun } =
    useGameStore();
  const abandonGame = useBlockchainStore((state) => state.abandonGame);
  const abandonTournament = useTournamentStore((state) => state.abandonTournament);

  const resolvedMode: CardDetailPanelMode = mode ?? { type: 'standard' };
  const resolveCardName = React.useCallback((cardId: number) => cardNameMap[cardId], [cardNameMap]);
  const cardRawJson = React.useMemo(() => prettyJson(card), [card]);
  const isActionDisabled = resolvedMode.type === 'sandbox' || resolvedMode.type === 'readOnly';
  const forfeitContext =
    resolvedMode.type === 'tournament'
      ? {
          title: 'Surrender?',
          subtitle: 'Your tournament journey ends here.',
          confirmation: 'All progress will be sealed. There is no returning to this battle.',
          success: 'You have surrendered.',
          accent: 'from-fuchsia-500/20 via-red-500/10 to-transparent',
        }
      : resolvedMode.type === 'blockchain'
        ? {
            title: 'Surrender?',
            subtitle: 'Your battle record ends here.',
            confirmation: 'This run will be lost to the chain forever. There is no turning back.',
            success: 'You have surrendered.',
            accent: 'from-yellow-500/20 via-red-500/10 to-transparent',
          }
        : {
            title: 'Surrender?',
            subtitle: 'Your current run will be lost.',
            confirmation: 'All progress is gone. You will start fresh from the beginning.',
            success: 'You have surrendered.',
            accent: 'from-amber-500/20 via-red-500/10 to-transparent',
          };

  React.useEffect(() => {
    if (!isVisible && showForfeitConfirm) {
      setShowForfeitConfirm(false);
    }
  }, [isVisible, showForfeitConfirm]);

  const handleForfeit = React.useCallback(async () => {
    setForfeitPending(true);
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
    } finally {
      setForfeitPending(false);
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

  const containerClassName =
    layout === 'contained'
      ? 'relative h-full min-h-0 w-40 sm:w-44 lg:w-80 shrink-0'
      : 'fixed top-0 left-0 bottom-0 w-44 lg:w-80';

  // Get the selected hand/board index for actions
  const selectedHandIndex = selection?.type === 'hand' ? selection.index : -1;
  const selectedBoardIndex = selection?.type === 'board' ? selection.index : -1;
  const isBoardUnit = selection?.type === 'board';

  const renderCardTab = () => {
    if (!card) {
      return (
        <div className="flex flex-col items-center justify-center py-6 lg:py-12 text-center">
          <div className="text-2xl lg:text-4xl mb-2 lg:mb-4">👆</div>
          <h3 className="text-sm lg:text-lg font-bold text-warm-300 mb-1 lg:mb-2">Select a Card</h3>
          <p className="text-[10px] lg:text-sm text-warm-400">Tap any card to view details.</p>
        </div>
      );
    }

    const allAbilities = [...card.shop_abilities, ...card.battle_abilities];

    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {/* Action Buttons */}
        {!isActionDisabled && (
          <div className="mb-3 lg:mb-6 space-y-1.5 lg:space-y-2">
            {isBoardUnit ? (
              // Board unit actions
              <button
                onClick={() => {
                  if (selectedBoardIndex >= 0) {
                    burnBoardUnit(selectedBoardIndex);
                    setSelection(null);
                  }
                }}
                className="w-full btn btn-danger text-[10px] lg:text-sm py-1.5 lg:py-2"
              >
                Burn (+{card.burn_value} Mana)
              </button>
            ) : (
              // Hand card actions
              <>
                <button
                  onClick={() => {
                    if (selectedHandIndex >= 0) {
                      burnHandCard(selectedHandIndex);
                      setSelection(null);
                    }
                  }}
                  className="w-full btn btn-danger text-[10px] lg:text-sm py-1.5 lg:py-2"
                >
                  Burn (+{card.burn_value} Mana)
                </button>
              </>
            )}
          </div>
        )}

        {/* Card Art — full width */}
        <div className="mb-3 lg:mb-6">
          <CardArtImage key={card.id} card={card} />
        </div>

        {/* Ability Section */}
        {allAbilities.length > 0 && (
          <div className="mb-3 lg:mb-6">
            {allAbilities.map((ability, index) => (
              <div
                key={index}
                className="mb-2 lg:mb-4 p-2 lg:p-3 bg-warm-800/50 rounded-lg border border-warm-700"
              >
                <h3 className="text-xs lg:text-md font-bold text-yellow-400 mb-1 lg:mb-2">
                  {allAbilities.length > 1 ? `Ability ${index + 1}` : 'Ability'}
                </h3>
                <div className="text-[10px] lg:text-sm text-warm-200 bg-warm-950/50 p-1.5 lg:p-2 rounded border border-warm-700/50 italic">
                  {formatAbilitySentence(ability, { resolveCardName })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Economy Section */}
        <div className="grid grid-cols-2 gap-1.5 lg:gap-3 mb-3 lg:mb-6">
          <div className="p-1.5 lg:p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
            <div className="text-[8px] lg:text-[10px] text-blue-400 uppercase font-bold mb-0.5 lg:mb-1">
              Cost
            </div>
            <div className="text-sm lg:text-xl font-bold text-white flex items-center gap-0.5 lg:gap-1">
              {card.play_cost} <span className="text-blue-400 text-[10px] lg:text-sm">Mana</span>
            </div>
          </div>
          <div className="p-1.5 lg:p-3 bg-orange-900/20 border border-orange-800/50 rounded-lg">
            <div className="text-[8px] lg:text-[10px] text-orange-400 uppercase font-bold mb-0.5 lg:mb-1">
              Burn
            </div>
            <div className="text-sm lg:text-xl font-bold text-white flex items-center gap-0.5 lg:gap-1">
              +{card.burn_value}{' '}
              <span className="text-orange-400 text-[10px] lg:text-sm">Mana</span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="text-[10px] text-warm-500 font-mono flex flex-col gap-1 border-t border-warm-800 pt-4">
          <div>CARD_ID: {card.id}</div>
        </div>

        {/* Card Raw JSON */}
        {showRawJson && (
          <div className="mt-4 p-2 bg-black/50 rounded border border-warm-800">
            <div className="text-[10px] text-warm-500 mb-1 flex justify-between items-center">
              <span>CARD_DATA.JSON</span>
              <button
                onClick={() => navigator.clipboard.writeText(cardRawJson)}
                className="text-blue-500 hover:text-blue-400 font-mono text-[9px]"
              >
                Copy
              </button>
            </div>
            <pre className="text-[9px] text-blue-400/80 custom-scrollbar max-h-48 overflow-auto">
              {cardRawJson}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className={`card-detail-panel ${containerClassName} bg-warm-950 border-r border-warm-700 shadow-2xl flex flex-col z-30`}
      >
        {/* Header */}
        <div className="border-b border-warm-800 py-2 lg:py-3 px-3 lg:px-5">
          <span className="text-xs font-bold uppercase tracking-wider text-yellow-500">
            Card Details
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 lg:p-5 flex flex-col overflow-hidden">{renderCardTab()}</div>

        {/* Footer */}
        <div className="p-1 lg:p-4 border-t border-warm-800 bg-black/20 text-[6px] lg:text-[10px] text-warm-600 text-center uppercase tracking-tighter">
          Open Auto Battler Engine v0.2.0
        </div>
      </div>

      {showForfeitConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!forfeitPending) {
                setShowForfeitConfirm(false);
              }
            }}
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-warm-700/60 bg-warm-950 shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
            <div className={`absolute inset-0 bg-gradient-to-br ${forfeitContext.accent}`} />
            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-warm-400/30 to-transparent" />

            <div className="relative p-6 lg:p-7 flex flex-col items-center text-center">
              <h2
                className="font-title text-3xl lg:text-4xl font-bold tracking-wide uppercase text-red-300"
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
                  disabled={forfeitPending}
                  className="battle-btn rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Fight On
                </button>
                <button
                  onClick={() => void handleForfeit()}
                  disabled={forfeitPending}
                  className="rounded-xl border border-red-800/70 bg-red-950/60 px-4 py-3 text-sm font-bold uppercase tracking-wider text-red-300 transition-all hover:bg-red-900/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {forfeitPending ? 'Surrendering...' : 'Surrender'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
