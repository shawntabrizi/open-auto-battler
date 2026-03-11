import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

const STATUS_MASK_KEYS = new Set(['base_statuses', 'perm_statuses', 'active_statuses', 'statuses']);

function stringifyWithCompactStatusMasks(value: unknown): string {
  const encoded = JSON.stringify(
    value,
    (key, currentValue) => {
      if (STATUS_MASK_KEYS.has(key) && Array.isArray(currentValue)) {
        const normalized = currentValue.map((x) => Number(x) & 0xff);
        return `__STATUS_MASK__${JSON.stringify(normalized)}`;
      }
      return currentValue;
    },
    2
  );

  return (encoded ?? 'null').replace(/"__STATUS_MASK__(\[[^"]*\])"/g, '$1');
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

type TabType = 'card' | 'rules' | 'mode';

export function CardDetailPanel({ card, isVisible, mode, layout = 'fixed' }: CardDetailPanelProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>('card');
  const [showForfeitConfirm, setShowForfeitConfirm] = React.useState(false);
  const [forfeitPending, setForfeitPending] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    view,
    cardNameMap,
    selection,
    burnHandCard,
    burnBoardUnit,
    setSelection,
    showRawJson,
    toggleShowRawJson,
    newRun,
  } = useGameStore();
  const abandonGame = useBlockchainStore((state) => state.abandonGame);
  const abandonTournament = useTournamentStore((state) => state.abandonTournament);

  const resolvedMode: CardDetailPanelMode = mode ?? { type: 'standard' };
  const resolveCardName = React.useCallback((cardId: number) => cardNameMap[cardId], [cardNameMap]);
  const cardRawJson = React.useMemo(() => stringifyWithCompactStatusMasks(card), [card]);
  const gameViewRawJson = React.useMemo(() => stringifyWithCompactStatusMasks(view), [view]);

  if (!isVisible) return null;

  const containerClassName =
    layout === 'contained'
      ? 'relative h-full min-h-0 w-40 sm:w-44 lg:w-80 shrink-0'
      : 'fixed top-0 left-0 bottom-0 w-44 lg:w-80';

  // Get the selected hand/board index for actions
  const selectedHandIndex = selection?.type === 'hand' ? selection.index : -1;
  const selectedBoardIndex = selection?.type === 'board' ? selection.index : -1;
  const isBoardUnit = selection?.type === 'board';

  // Check if actions should be disabled
  const isActionDisabled = resolvedMode.type === 'sandbox' || resolvedMode.type === 'readOnly';
  const isChainBackedMode =
    resolvedMode.type === 'blockchain' || resolvedMode.type === 'tournament';
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
      setActiveTab('card');
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

  const renderRulesTab = () => {
    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 text-sm text-warm-300 pb-4">
        <section>
          <h3 className="font-bold text-white mb-2 border-b border-warm-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">01.</span> Planning Phase
          </h3>
          <p className="leading-relaxed">
            Every round, you derive a fresh <strong className="text-white">Hand of 7 cards</strong>{' '}
            from your Bag. The selection is deterministic based on your game seed and the current
            round.
          </p>
          <p className="mt-2 text-warm-400 italic">
            Unused hand cards return to your Bag. The Bag only shrinks when you play or burn cards.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-warm-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">02.</span> Mana & Economy
          </h3>
          <p className="leading-relaxed">
            You start each turn with <strong className="text-blue-400">0 Mana</strong>. Gain mana by{' '}
            <strong className="text-orange-400">burning</strong> cards from your hand or units
            already on your board.
          </p>
          <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
            <li>
              <strong className="text-white">Capacity:</strong> Starts at 3, increases by +1 every
              round (Max 10).
            </li>
            <li>
              <strong className="text-white">Refilling:</strong> You can burn, spend, and burn again
              in one turn.
            </li>
            <li>
              <strong className="text-white">Hard Limit:</strong> You cannot hold more than your
              capacity at once.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-warm-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">03.</span> Priority System
          </h3>
          <p className="mb-2 leading-relaxed text-xs">
            When multiple units share a trigger (e.g. "Battle Start"), the game uses a{' '}
            <strong className="text-white">Priority Queue</strong> to decide who goes first:
          </p>
          <div className="bg-black/30 p-3 rounded-lg border border-warm-800 font-mono text-[11px] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-warm-500">1. Higher Power</span>
              <span className="text-red-400">ATTACK</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-warm-500">2. Higher Vitality</span>
              <span className="text-green-400">HEALTH</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-warm-500">3. Default Team</span>
              <span className="text-blue-400">PLAYER</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-warm-500">4. Physical Lead</span>
              <span className="text-yellow-400">FRONT-MOST</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-warm-500">5. Internal Logic</span>
              <span className="text-purple-400">TOP-ABILITY</span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-warm-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">04.</span> Recursive Logic
          </h3>
          <p className="leading-relaxed">
            The game state is <strong className="text-white">Live</strong>. If an ability kills a
            unit or spawns a new one, that unit's "On Death" or "On Spawn" triggers happen{' '}
            <strong className="text-yellow-500">immediately</strong>—even if it interrupts the
            current priority queue.
          </p>
          <p className="mt-2 text-xs text-warm-400 leading-relaxed">
            Example: If a fast sniper kills a unit with "On Death: Damage", that damage fires before
            the next unit in the sniper's original phase acts.
          </p>
        </section>

        <section>
          <h3 className="font-bold text-white mb-2 border-b border-warm-700 pb-1 flex items-center gap-2">
            <span className="text-blue-400">05.</span> Victory
          </h3>
          <p className="leading-relaxed text-xs">
            Battles are automated from <strong className="text-white">Front to Back</strong>. The
            first team to have all units defeated loses the round. Accumulate{' '}
            <strong className="text-yellow-500">10 Stars</strong> to win the run!
          </p>
        </section>
      </div>
    );
  };

  const renderModeTab = () => {
    const isBlockchain = isChainBackedMode;

    return (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
        {/* Blockchain Connection Status - only shown in blockchain mode */}
        {isBlockchain && (
          <div className="p-4 bg-warm-800/50 rounded-lg border border-warm-700">
            <h3 className="font-bold text-white mb-3">Chain Connection</h3>

            {/* Connection Status */}
            <div className="flex items-center gap-2 mb-3 p-2 bg-warm-900 rounded border border-white/5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-mono text-warm-400">
                {resolvedMode.blockNumber != null
                  ? `Block #${resolvedMode.blockNumber.toLocaleString()}`
                  : 'Connected'}
              </span>
            </div>

            {/* Account Selector */}
            {resolvedMode.accounts.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] text-warm-500 uppercase font-bold">Account</label>
                <select
                  value={resolvedMode.selectedAccount?.address || ''}
                  onChange={(e) => {
                    const account = resolvedMode.accounts.find((a) => a.address === e.target.value);
                    resolvedMode.onSelectAccount?.(account);
                  }}
                  className="w-full bg-warm-800 border border-white/10 rounded px-2 py-1.5 text-xs outline-none focus:border-yellow-500/50"
                >
                  {resolvedMode.accounts.map((acc) => (
                    <option key={acc.address} value={acc.address}>
                      {acc.source === 'dev' ? '🛠️ ' : ''}
                      {acc.name} ({acc.address.slice(0, 6)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-warm-800/50 rounded-lg border border-warm-700">
          <div className="space-y-3">
            <button
              onClick={() =>
                navigate('/settings', {
                  state: { returnTo: `${location.pathname}${location.search}` },
                })
              }
              className="w-full btn bg-yellow-900/50 hover:bg-yellow-800 text-yellow-200 border border-yellow-700 text-xs py-2"
            >
              Settings
            </button>
            <button
              onClick={() => setShowForfeitConfirm(true)}
              className="w-full btn bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 text-xs py-2"
            >
              Forfeit
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full btn bg-warm-700/50 hover:bg-warm-600 text-warm-300 border border-warm-600 text-xs py-2"
            >
              Exit to Menu
            </button>
          </div>
        </div>

        <div className="p-4 bg-warm-800/50 rounded-lg border border-warm-700">
          <h3 className="font-bold text-white mb-2">Debug Tools</h3>
          <div className="space-y-3">
            <button
              onClick={toggleShowRawJson}
              className="w-full btn bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700 text-xs py-2"
            >
              {showRawJson ? 'Hide Raw State' : 'View Raw Game State'}
            </button>
          </div>
        </div>

        {showRawJson && view && (
          <div className="mt-4 p-2 bg-black/50 rounded border border-warm-800">
            <div className="text-[10px] text-warm-500 mb-1 flex justify-between items-center">
              <span>GAME_VIEW.JSON</span>
              <button
                onClick={() => navigator.clipboard.writeText(gameViewRawJson)}
                className="text-blue-500 hover:text-blue-400"
              >
                Copy
              </button>
            </div>
            <pre className="text-[9px] text-green-500/80 custom-scrollbar max-h-64 overflow-auto">
              {gameViewRawJson}
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
        {/* Tabs */}
        <div className="flex border-b border-warm-800">
          <button
            onClick={() => setActiveTab('card')}
            className={`flex-1 py-2 lg:py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'card'
                ? 'bg-warm-800 text-yellow-500 border-b-2 border-yellow-500'
                : 'text-warm-500 hover:text-warm-300'
            }`}
          >
            <span className="lg:hidden text-base">🃏</span>
            <span className="hidden lg:inline">Card</span>
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 py-2 lg:py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'rules'
                ? 'bg-warm-800 text-yellow-500 border-b-2 border-yellow-500'
                : 'text-warm-500 hover:text-warm-300'
            }`}
          >
            <span className="lg:hidden text-base">📖</span>
            <span className="hidden lg:inline">Rules</span>
          </button>
          <button
            onClick={() => setActiveTab('mode')}
            className={`flex-1 py-2 lg:py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === 'mode'
                ? 'bg-warm-800 text-yellow-500 border-b-2 border-yellow-500'
                : 'text-warm-500 hover:text-warm-300'
            }`}
          >
            <span className="lg:hidden text-base">⚙️</span>
            <span className="hidden lg:inline">System</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-3 lg:p-5 flex flex-col overflow-hidden">
          {activeTab === 'card' && renderCardTab()}
          {activeTab === 'rules' && renderRulesTab()}
          {activeTab === 'mode' && renderModeTab()}
        </div>

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
                  textShadow:
                    '0 2px 12px rgba(168, 58, 42, 0.5), 0 0 40px rgba(168, 58, 42, 0.2)',
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
