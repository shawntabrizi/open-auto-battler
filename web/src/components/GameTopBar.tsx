import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useVersusStore } from '../store/versusStore';
import { useCustomizationStore } from '../store/customizationStore';
import { useMenuStore } from '../store/menuStore';
import { GAME_SHORTCUTS } from './GameKeyboardShortcuts';
import { LivesIcon, StarIcon, BagIcon, HourglassIcon, WarningIcon } from './Icons';
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
                    ? 'bg-negative animate-pulse'
                    : 'bg-card-attack'
                  : 'bg-mana'
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
                className={`text-white text-lg font-bold ${displayTimer <= 5 ? 'text-accent' : ''}`}
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
            className={`theme-button rounded-lg text-xs lg:text-sm px-2 lg:px-3 border font-bold font-button uppercase tracking-wider flex items-center h-7 lg:h-10 transition-all ${
              isWaiting
                ? 'bg-base-600 scale-95 opacity-80 cursor-not-allowed'
                : battleConfirmation.isConfirming
                  ? 'bg-negative hover:bg-negative/85 text-white border-negative/50'
                  : opponentWaiting && displayTimer !== null && displayTimer <= 5
                    ? 'animate-pulse bg-negative hover:bg-negative border-negative/50'
                    : 'battle-btn border-accent/40'
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
          className={`theme-button rounded-lg text-xs lg:text-sm px-2 lg:px-3 border font-bold font-button uppercase tracking-wider flex items-center h-7 lg:h-10 transition-all ${
            customAction.disabled
              ? 'bg-base-600 border-base-600 scale-95 opacity-80 cursor-not-allowed'
              : customActionConfirmation.isConfirming
                ? 'bg-negative hover:bg-negative/85 text-white border-negative/50'
                : customAction.variant === 'chain'
                  ? 'btn-primary'
                  : 'battle-btn border-accent/40'
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
      className={`game-top-bar theme-panel h-12 lg:h-16 bg-surface-dark/90 border-b border-base-800/60 flex items-center px-2 lg:px-6 relative z-20 overflow-hidden ${className}`}
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
          <div className="w-6 h-6 lg:w-10 lg:h-10 rounded-full overflow-hidden border-2 border-accent/50 flex-shrink-0">
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
            <BagIcon className="text-accent w-3.5 h-3.5 lg:w-5 lg:h-5" />
            <span className="font-bold text-xs lg:text-sm font-stat">{view.bag_count}</span>
          </button>
        )}

        {/* Round */}
        <div className="theme-panel theme-pill bg-surface-dark/60 border border-base-800/60 rounded-lg flex items-center gap-1 lg:gap-2 px-2 lg:px-3 h-7 lg:h-10">
          <span className="text-[10px] lg:text-xs text-base-400 font-heading uppercase tracking-wider">
            Round
          </span>
          <span className="text-xs lg:text-sm font-bold text-accent font-stat">{view.round}</span>
        </div>

        {/* Wins */}
        <div className="theme-panel theme-pill bg-surface-dark/60 border border-base-800/60 rounded-lg flex items-center gap-1 lg:gap-1.5 px-2 lg:px-3 h-7 lg:h-10">
          <StarIcon className="text-accent w-3.5 h-3.5 lg:w-4 lg:h-4" />
          <span className="font-bold text-xs lg:text-sm font-stat">
            {view.wins}/{winsToVictory}
          </span>
        </div>

        {/* Lives */}
        <div className="theme-panel theme-pill bg-surface-dark/60 border border-base-800/60 rounded-lg flex items-center gap-1 lg:gap-1.5 px-2 lg:px-3 h-7 lg:h-10">
          <LivesIcon className="text-positive w-3.5 h-3.5 lg:w-4 lg:h-4" />
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
