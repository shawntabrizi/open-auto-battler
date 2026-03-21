import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useVersusStore } from '../store/versusStore';
import { useCustomizationStore } from '../store/customizationStore';
import { useMenuStore } from '../store/menuStore';
import { GAME_SHORTCUTS } from './GameKeyboardShortcuts';
import { HeartIcon, StarIcon, BagIcon, HourglassIcon, WarningIcon } from './Icons';
import battleSwordIcon from '../../battle-sword.svg';

const BATTLE_TIMER_SECONDS = 20;

interface HUDProps {
  hideEndTurn?: boolean;
  customAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'chain';
  };
}

function useCommitConfirmation(commitWarning: string | null, disabled: boolean) {
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    setIsConfirming(false);
  }, [commitWarning, disabled]);

  const trigger = (action: () => void) => {
    if (disabled) return;

    if (commitWarning && !isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsConfirming(false);
    action();
  };

  return { isConfirming, trigger };
}

/** Inline battle / custom-action buttons that sit inside the HUD bar */
function InlineEndTurn({ hideEndTurn, customAction }: HUDProps) {
  const { view, endTurn, engine, getCommitWarning, setSelection } = useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady, battleTimer } = useVersusStore();
  const [waitingTimer, setWaitingTimer] = useState<number | null>(null);
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (status === 'in-game' && isReady && !opponentReady && view?.phase === 'shop') {
      setWaitingTimer(BATTLE_TIMER_SECONDS);
      waitingTimerRef.current = setInterval(() => {
        setWaitingTimer((prev) => (prev !== null && prev > 1 ? prev - 1 : prev));
      }, 1000);
    }
    if (!isReady || opponentReady) {
      if (waitingTimerRef.current) {
        clearInterval(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
      setWaitingTimer(null);
    }
    return () => {
      if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
    };
  }, [isReady, opponentReady, status, view?.phase]);

  const isWaiting = status === 'in-game' && isReady && !opponentReady;
  const opponentWaiting = status === 'in-game' && !isReady && opponentReady;
  const displayTimer = isWaiting ? waitingTimer : opponentWaiting ? battleTimer : null;
  const commitWarning = getCommitWarning();
  const battleConfirmation = useCommitConfirmation(commitWarning, isWaiting);
  const customActionConfirmation = useCommitConfirmation(
    commitWarning,
    Boolean(customAction?.disabled)
  );

  if (!view || view.phase !== 'shop') return null;
  if (hideEndTurn && !customAction) return null;

  const handleEndTurn = () => {
    setSelection(null);

    if (status === 'in-game') {
      const board = engine?.get_board();
      setIsReady(true);
      sendMessage({ type: 'END_TURN_READY', board });
    } else {
      endTurn();
    }
  };

  return (
    <div className="flex items-center gap-2 lg:gap-3">
      {!hideEndTurn && (
        <>
          {displayTimer !== null && (
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
                opponentWaiting
                  ? displayTimer <= 5
                    ? 'bg-red-600 animate-pulse'
                    : 'bg-orange-600'
                  : 'bg-blue-600'
              }`}
            >
              <span className="text-white text-sm font-bold flex items-center gap-1">
                {opponentWaiting ? (
                  <>
                    <WarningIcon className="w-4 h-4" /> Submit in:
                  </>
                ) : (
                  <>
                    <HourglassIcon className="w-4 h-4" /> Waiting:
                  </>
                )}
              </span>
              <span
                className={`text-white text-lg font-bold ${displayTimer <= 5 ? 'text-yellow-300' : ''}`}
              >
                {displayTimer}s
              </span>
            </div>
          )}
          <button
            onClick={() => battleConfirmation.trigger(handleEndTurn)}
            disabled={isWaiting}
            data-game-end-turn-action="true"
            aria-keyshortcuts={GAME_SHORTCUTS.commit}
            title={`Focus ${isWaiting ? 'Waiting' : battleConfirmation.isConfirming ? 'Are you sure' : 'Battle'} button (${GAME_SHORTCUTS.commit})`}
            className={`theme-button rounded-lg text-xs lg:text-sm px-2 lg:px-3 border font-bold font-heading uppercase tracking-wider flex items-center h-7 lg:h-10 transition-all ${
              isWaiting
                ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed'
                : battleConfirmation.isConfirming
                  ? 'bg-red-700 hover:bg-red-600 text-white border-red-400/70'
                  : opponentWaiting && displayTimer !== null && displayTimer <= 5
                    ? 'animate-pulse bg-red-500 hover:bg-red-400 border-warm-700'
                    : 'battle-btn border-warm-700'
            }`}
          >
            {isWaiting
              ? 'Waiting...'
              : battleConfirmation.isConfirming
                ? 'Are you sure?'
                : 'Battle!'}
          </button>
        </>
      )}
      {customAction && (
        <button
          onClick={() => {
            customActionConfirmation.trigger(() => {
              setSelection(null);
              customAction.onClick();
            });
          }}
          disabled={customAction.disabled}
          data-game-custom-action="true"
          aria-keyshortcuts={GAME_SHORTCUTS.commit}
          title={`Focus ${customActionConfirmation.isConfirming ? 'Are you sure' : customAction.label} button (${GAME_SHORTCUTS.commit})`}
          className={`theme-button rounded-lg text-xs lg:text-sm px-2 lg:px-3 border font-bold font-heading uppercase tracking-wider flex items-center h-7 lg:h-10 transition-all ${
            customAction.disabled
              ? 'bg-warm-600 border-warm-600 scale-95 opacity-80 cursor-not-allowed'
              : customActionConfirmation.isConfirming
                ? 'bg-red-700 hover:bg-red-600 text-white border-red-400/70'
                : customAction.variant === 'chain'
                  ? 'btn-primary'
                  : 'battle-btn border-warm-700'
          }`}
        >
          {customActionConfirmation.isConfirming ? 'Are you sure?' : customAction.label}
        </button>
      )}
    </div>
  );
}

export function GameTopBar({
  hideEndTurn,
  customAction,
  className = '',
}: HUDProps & { className?: string } = {}) {
  const { view, setShowBag, selection, setSelection, startingLives, winsToVictory } =
    useGameStore();
  const playerAvatar = useCustomizationStore((s) => s.selections.playerAvatar);
  const openMenu = useMenuStore((s) => s.open);

  if (!view) return null;

  return (
    <nav
      aria-label="Game controls"
      className={`game-top-bar h-12 lg:h-16 bg-warm-950/90 border-b border-warm-800/60 flex items-center px-2 lg:px-6 relative z-20 overflow-hidden ${className}`}
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
      onClick={(event) => {
        if (!selection) return;

        const clickTarget = event.target;
        if (!(clickTarget instanceof Element)) return;

        if (clickTarget.closest('button, a, input, select, textarea, [role="button"]')) {
          return;
        }

        setSelection(null);
      }}
    >
      {/* HUD items — all same height */}
      <div className="flex items-center gap-1.5 lg:gap-2">
        {playerAvatar && (
          <div className="w-6 h-6 lg:w-10 lg:h-10 rounded-full overflow-hidden border-2 border-gold/50 flex-shrink-0">
            <img src={playerAvatar.imageUrl} alt="avatar" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Bag */}
        {view.phase === 'shop' && (
          <button
            onClick={() => setShowBag(true)}
            className="hud-pill theme-button theme-surface-button theme-pill border flex items-center gap-1 lg:gap-2 px-2 lg:px-3 h-7 lg:h-10"
            title={`View your draw pool (${GAME_SHORTCUTS.bag})`}
            aria-keyshortcuts={GAME_SHORTCUTS.bag}
          >
            <BagIcon className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-gold" />
            <span className="font-bold text-xs lg:text-sm font-stat">{view.bag_count}</span>
          </button>
        )}

        {/* Round */}
        <div className="theme-pill bg-warm-900/60 border border-warm-800/60 rounded-lg flex items-center gap-1 lg:gap-2 px-2 lg:px-3 h-7 lg:h-10">
          <span className="text-[10px] lg:text-xs text-warm-400 font-heading uppercase tracking-wider">
            Round
          </span>
          <span className="text-xs lg:text-sm font-bold text-gold font-stat">{view.round}</span>
        </div>

        {/* Wins */}
        <div className="theme-pill bg-warm-900/60 border border-warm-800/60 rounded-lg flex items-center gap-1 lg:gap-1.5 px-2 lg:px-3 h-7 lg:h-10">
          <StarIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-gold" />
          <span className="font-bold text-xs lg:text-sm font-stat">
            {view.wins}/{winsToVictory}
          </span>
        </div>

        {/* Lives */}
        <div className="theme-pill bg-warm-900/60 border border-warm-800/60 rounded-lg flex items-center gap-1 lg:gap-1.5 px-2 lg:px-3 h-7 lg:h-10">
          <HeartIcon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-burn-red" />
          <span className="font-bold text-xs lg:text-sm font-stat">
            {view.lives}/{startingLives}
          </span>
        </div>

        {/* Combat button */}
        {view.phase === 'shop' && (
          <InlineEndTurn hideEndTurn={hideEndTurn} customAction={customAction} />
        )}
      </div>

      {/* Hamburger — right-aligned */}
      <button
        onClick={openMenu}
        aria-label="Open menu"
        aria-keyshortcuts={GAME_SHORTCUTS.menu}
        title={`Open menu (${GAME_SHORTCUTS.menu})`}
        className="theme-button theme-surface-button ml-auto p-2 rounded-lg border transition-colors shrink-0"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 lg:w-5 lg:h-5">
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
        </svg>
      </button>
    </nav>
  );
}

/** Floating Battle button — rendered in the arena area, centered above the board */
export function BattleAction({
  hideEndTurn,
  customAction,
  compact = false,
}: {
  hideEndTurn?: boolean;
  customAction?: HUDProps['customAction'];
  compact?: boolean;
}) {
  const { view, endTurn, engine, getCommitWarning, setSelection } = useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady, battleTimer } = useVersusStore();
  const [waitingTimer, setWaitingTimer] = useState<number | null>(null);
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (status === 'in-game' && isReady && !opponentReady && view?.phase === 'shop') {
      setWaitingTimer(BATTLE_TIMER_SECONDS);
      waitingTimerRef.current = setInterval(() => {
        setWaitingTimer((prev) => (prev !== null && prev > 1 ? prev - 1 : prev));
      }, 1000);
    }
    if (!isReady || opponentReady) {
      if (waitingTimerRef.current) {
        clearInterval(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
      setWaitingTimer(null);
    }
    return () => {
      if (waitingTimerRef.current) {
        clearInterval(waitingTimerRef.current);
      }
    };
  }, [isReady, opponentReady, status, view?.phase]);

  const isWaiting = status === 'in-game' && isReady && !opponentReady;
  const opponentWaiting = status === 'in-game' && !isReady && opponentReady;
  const displayTimer = isWaiting ? waitingTimer : opponentWaiting ? battleTimer : null;
  const commitWarning = getCommitWarning();
  const battleConfirmation = useCommitConfirmation(commitWarning, isWaiting);
  const customActionConfirmation = useCommitConfirmation(
    commitWarning,
    Boolean(customAction?.disabled)
  );

  if (!view || view.phase !== 'shop') return null;
  if (hideEndTurn && !customAction) return null;

  const handleEndTurn = () => {
    setSelection(null);

    if (status === 'in-game') {
      const board = engine?.get_board();
      setIsReady(true);
      sendMessage({ type: 'END_TURN_READY', board });
    } else {
      endTurn();
    }
  };

  // Compact mode: thin vertical column button for mobile board tab
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full pointer-events-auto px-1.5 py-1">
        {!hideEndTurn && (
          <button
            onClick={() => battleConfirmation.trigger(handleEndTurn)}
            disabled={isWaiting}
            className={`theme-button flex-1 w-full flex flex-col items-center justify-center rounded-lg border transition-colors ${
              isWaiting
                ? 'bg-warm-800 border-warm-700 opacity-50 cursor-not-allowed'
                : battleConfirmation.isConfirming
                  ? 'bg-red-700 hover:bg-red-600 text-white border-red-400/70'
                  : 'battle-btn border-amber-500/60 active:scale-95'
            }`}
          >
            {isWaiting ? (
              <>
                <span className="font-bold text-xs text-warm-400">Wait</span>
                {displayTimer !== null && (
                  <span
                    className={`font-bold text-sm ${displayTimer <= 5 ? 'text-yellow-300' : 'text-white'}`}
                  >
                    {displayTimer}s
                  </span>
                )}
              </>
            ) : battleConfirmation.isConfirming ? (
              <>
                <span className="font-bold text-xs text-white">Are you</span>
                <span className="font-bold text-[0.55rem] uppercase tracking-wide mt-0.5">
                  sure?
                </span>
              </>
            ) : (
              <>
                <span className="text-lg font-bold leading-none">&#9876;</span>
                <span className="text-[0.55rem] font-bold uppercase tracking-wide mt-0.5">
                  Battle
                </span>
              </>
            )}
          </button>
        )}
        {customAction && (
          <button
            onClick={() => {
              customActionConfirmation.trigger(() => {
                setSelection(null);
                customAction.onClick();
              });
            }}
            disabled={customAction.disabled}
            className={`theme-button w-full rounded-lg text-[0.55rem] px-1 py-2 transition-all font-bold uppercase tracking-wide border ${
              customAction.disabled
                ? 'bg-warm-800 border-warm-700 opacity-50 cursor-not-allowed text-warm-500'
                : customActionConfirmation.isConfirming
                  ? 'bg-red-700 hover:bg-red-600 text-white border-red-400/70'
                  : customAction.variant === 'chain'
                    ? 'btn-primary'
                    : 'btn-primary border-amber-500/60'
            }`}
          >
            {customActionConfirmation.isConfirming ? 'Are you sure?' : customAction.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-center pt-1 lg:pt-5 pb-0.5 lg:pb-1 z-30 pointer-events-none">
      <div className="flex items-center gap-3 pointer-events-auto">
        {!hideEndTurn && (
          <>
            {displayTimer !== null && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  opponentWaiting
                    ? displayTimer <= 5
                      ? 'bg-red-600 animate-pulse'
                      : 'bg-orange-600'
                    : 'bg-blue-600'
                }`}
              >
                <span className="text-white text-sm lg:text-base font-bold flex items-center gap-1">
                  {opponentWaiting ? (
                    <>
                      <WarningIcon className="w-4 h-4" /> Submit in:
                    </>
                  ) : (
                    <>
                      <HourglassIcon className="w-4 h-4" /> Waiting:
                    </>
                  )}
                </span>
                <span
                  className={`text-white text-lg lg:text-xl font-bold ${displayTimer <= 5 ? 'text-yellow-300' : ''}`}
                >
                  {displayTimer}s
                </span>
              </div>
            )}
            <button
              onClick={() => battleConfirmation.trigger(handleEndTurn)}
              disabled={isWaiting}
              className={`theme-button battle-btn rounded-xl transition-all flex items-center justify-center ${
                isWaiting
                  ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed px-4 lg:px-12 py-1.5 lg:py-4'
                  : battleConfirmation.isConfirming
                    ? 'bg-red-700 hover:bg-red-600 text-white border border-red-400/70 px-5 lg:px-10 py-3 lg:py-4'
                    : opponentWaiting && displayTimer !== null && displayTimer <= 5
                      ? 'animate-pulse bg-red-500 hover:bg-red-400 px-2 lg:px-4 py-0.5 lg:py-1'
                      : 'px-2 lg:px-4 py-0.5 lg:py-1'
              }`}
            >
              {isWaiting ? (
                <span className="font-bold tracking-wide text-base lg:text-2xl">Waiting...</span>
              ) : battleConfirmation.isConfirming ? (
                <span className="font-bold tracking-wide text-base lg:text-2xl">Are you sure?</span>
              ) : (
                <img src={battleSwordIcon} alt="Battle" className="h-16 lg:h-28" />
              )}
            </button>
          </>
        )}
        {customAction && (
          <button
            onClick={() => {
              customActionConfirmation.trigger(() => {
                setSelection(null);
                customAction.onClick();
              });
            }}
            disabled={customAction.disabled}
            className={`theme-button btn rounded-xl text-base lg:text-xl px-6 lg:px-10 py-2.5 lg:py-4 transition-all font-bold ${
              customAction.disabled
                ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed'
                : customActionConfirmation.isConfirming
                  ? 'bg-red-700 hover:bg-red-600 text-white border border-red-400/70'
                  : customAction.variant === 'chain'
                    ? 'btn-primary'
                    : 'btn-primary'
            }`}
          >
            {customActionConfirmation.isConfirming ? 'Are you sure?' : customAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
