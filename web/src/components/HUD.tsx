import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMultiplayerStore } from '../store/multiplayerStore';
import { useCustomizationStore } from '../store/customizationStore';
import {
  HeartIcon,
  HeartOutlineIcon,
  StarIcon,
  StarOutlineIcon,
  BagIcon,
  HourglassIcon,
  WarningIcon,
} from './Icons';
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

/** Inline battle / custom-action buttons that sit inside the HUD bar */
function InlineEndTurn({ hideEndTurn, customAction }: HUDProps) {
  const { view, endTurn, engine } = useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady, battleTimer } =
    useMultiplayerStore();
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

  if (!view || view.phase !== 'shop') return null;
  if (hideEndTurn && !customAction) return null;

  const handleEndTurn = () => {
    if (status === 'in-game') {
      const board = engine?.get_board();
      setIsReady(true);
      sendMessage({ type: 'END_TURN_READY', board });
    } else {
      endTurn();
    }
  };

  const isWaiting = status === 'in-game' && isReady && !opponentReady;
  const opponentWaiting = status === 'in-game' && !isReady && opponentReady;
  const displayTimer = isWaiting ? waitingTimer : opponentWaiting ? battleTimer : null;

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
                  <><WarningIcon className="w-4 h-4" /> Submit in:</>
                ) : (
                  <><HourglassIcon className="w-4 h-4" /> Waiting:</>
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
            onClick={handleEndTurn}
            disabled={isWaiting}
            className={`battle-btn rounded-lg text-sm lg:text-base px-4 lg:px-6 py-1.5 lg:py-2 transition-all font-bold ${
              isWaiting
                ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed'
                : opponentWaiting && displayTimer !== null && displayTimer <= 5
                  ? 'animate-pulse bg-red-500 hover:bg-red-400'
                  : ''
            }`}
          >
            {isWaiting ? 'Waiting...' : 'Battle!'}
          </button>
        </>
      )}
      {customAction && (
        <button
          onClick={customAction.onClick}
          disabled={customAction.disabled}
          className={`rounded-lg text-sm lg:text-base px-4 lg:px-6 py-1.5 lg:py-2 transition-all font-bold ${
            customAction.disabled
              ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed'
              : customAction.variant === 'chain'
                ? 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-warm-900'
                : 'battle-btn'
          }`}
        >
          {customAction.label}
        </button>
      )}
    </div>
  );
}

export function HUD({ hideEndTurn, customAction }: HUDProps = {}) {
  const { view, setShowBag, showBag, selection, startingLives, winsToVictory } = useGameStore();
  const playerAvatar = useCustomizationStore((s) => s.selections.playerAvatar);

  // Keyboard shortcut for Bag view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b') {
        setShowBag(!showBag);
      } else if (e.key === 'Escape') {
        setShowBag(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShowBag, showBag]);

  if (!view) return null;

  const showCardPanel = view?.phase === 'shop' || selection?.type === 'board' || showBag;

  return (
    <div className={`hud h-12 lg:h-16 bg-warm-950/90 border-b border-warm-800/60 flex items-center justify-between px-2 lg:px-6 relative z-20 overflow-hidden ${showCardPanel ? 'show-card-panel' : ''}`}
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
    >
      {/* Left: Lives */}
      <div className="flex items-center gap-1 lg:gap-2">
        {playerAvatar && (
          <div className="w-6 h-6 lg:w-10 lg:h-10 rounded-full overflow-hidden border-2 border-yellow-500/50 flex-shrink-0">
            <img src={playerAvatar.imageUrl} alt="avatar" className="w-full h-full object-cover" />
          </div>
        )}
        <span className="text-warm-400 hidden lg:inline">Lives:</span>
        {/* Mobile: compact numeric */}
        <div className="flex lg:hidden items-center gap-1">
          <HeartIcon className="w-4 h-4 text-red-500" />
          <span className="font-bold text-sm">{view.lives}/{startingLives}</span>
        </div>
        {/* Desktop: full hearts */}
        <div className="hidden lg:flex gap-1">
          {Array.from({ length: startingLives }).map((_, i) =>
            i < view.lives ? (
              <HeartIcon key={i} className="w-5 h-5 text-red-500" />
            ) : (
              <HeartOutlineIcon key={i} className="w-5 h-5 text-warm-600" />
            )
          )}
        </div>
      </div>

      {/* Center: Round & End Turn */}
      <div className="flex items-center gap-2 lg:gap-4">
        <div className="flex items-center gap-1 lg:block lg:text-center">
          <span className="text-xs lg:text-sm text-warm-400">Round</span>
          <span className="text-sm lg:text-2xl font-bold text-gold">{view.round}</span>
        </div>

        {view.phase === 'shop' && (
          <div className="flex items-center gap-2 lg:gap-3">
            <button
              onClick={() => setShowBag(true)}
              className="bg-warm-800 hover:bg-warm-700 text-warm-100 border border-warm-700 rounded-lg flex items-center gap-1 lg:gap-2 px-2 lg:px-4 py-1"
              title="View your draw pool (B)"
            >
              <BagIcon className="w-4 h-4 lg:w-5 lg:h-5 text-amber-400" />
              <span className="font-bold text-sm lg:text-base">{view.bag_count}</span>
            </button>
            <InlineEndTurn hideEndTurn={hideEndTurn} customAction={customAction} />
          </div>
        )}
      </div>

      {/* Right: Wins */}
      <div className="flex items-center gap-1 lg:gap-2">
        <span className="text-warm-400 hidden lg:inline">Wins:</span>
        {/* Mobile: compact numeric */}
        <div className="flex lg:hidden items-center gap-1">
          <StarIcon className="w-4 h-4 text-gold" />
          <span className="font-bold text-sm">{view.wins}/{winsToVictory}</span>
        </div>
        {/* Desktop: full stars */}
        <div className="hidden lg:flex gap-1">
          {Array.from({ length: winsToVictory }).map((_, i) =>
            i < view.wins ? (
              <StarIcon key={i} className="w-5 h-5 text-gold" />
            ) : (
              <StarOutlineIcon key={i} className="w-5 h-5 text-warm-600" />
            )
          )}
        </div>
      </div>
    </div>
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
  const { view, endTurn, engine } = useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady, battleTimer } =
    useMultiplayerStore();
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

  if (!view || view.phase !== 'shop') return null;
  if (hideEndTurn && !customAction) return null;

  const handleEndTurn = () => {
    if (status === 'in-game') {
      const board = engine?.get_board();
      setIsReady(true);
      sendMessage({ type: 'END_TURN_READY', board });
    } else {
      endTurn();
    }
  };

  const isWaiting = status === 'in-game' && isReady && !opponentReady;
  const opponentWaiting = status === 'in-game' && !isReady && opponentReady;
  const displayTimer = isWaiting ? waitingTimer : opponentWaiting ? battleTimer : null;

  // Compact mode: thin vertical column button for mobile board tab
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full pointer-events-auto px-1.5 py-1">
        {!hideEndTurn && (
          <button
            onClick={handleEndTurn}
            disabled={isWaiting}
            className={`flex-1 w-full flex flex-col items-center justify-center rounded-lg border transition-colors ${
              isWaiting
                ? 'bg-warm-800 border-warm-700 opacity-50 cursor-not-allowed'
                : 'battle-btn border-amber-500/60 active:scale-95'
            }`}
          >
            {isWaiting ? (
              <>
                <span className="font-bold text-xs text-warm-400">Wait</span>
                {displayTimer !== null && (
                  <span className={`font-bold text-sm ${displayTimer <= 5 ? 'text-yellow-300' : 'text-white'}`}>
                    {displayTimer}s
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-lg font-bold leading-none">&#9876;</span>
                <span className="text-[0.55rem] font-bold uppercase tracking-wide mt-0.5">Battle</span>
              </>
            )}
          </button>
        )}
        {customAction && (
          <button
            onClick={customAction.onClick}
            disabled={customAction.disabled}
            className={`w-full rounded-lg text-[0.55rem] px-1 py-2 transition-all font-bold uppercase tracking-wide border ${
              customAction.disabled
                ? 'bg-warm-800 border-warm-700 opacity-50 cursor-not-allowed text-warm-500'
                : customAction.variant === 'chain'
                  ? 'bg-gradient-to-b from-yellow-400 to-orange-500 border-orange-400/60 text-warm-900'
                  : 'btn-primary border-amber-500/60'
            }`}
          >
            {customAction.label}
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
              onClick={handleEndTurn}
              disabled={isWaiting}
              className={`battle-btn rounded-xl transition-all flex items-center justify-center ${
                isWaiting
                  ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed px-4 lg:px-12 py-1.5 lg:py-4'
                  : opponentWaiting && displayTimer !== null && displayTimer <= 5
                    ? 'animate-pulse bg-red-500 hover:bg-red-400 px-2 lg:px-4 py-0.5 lg:py-1'
                    : 'px-2 lg:px-4 py-0.5 lg:py-1'
              }`}
            >
              {isWaiting ? (
                <span className="font-bold tracking-wide text-base lg:text-2xl">Waiting...</span>
              ) : (
                <img
                  src={battleSwordIcon}
                  alt="Battle"
                  className="h-16 lg:h-28"
                />
              )}
            </button>
          </>
        )}
        {customAction && (
          <button
            onClick={customAction.onClick}
            disabled={customAction.disabled}
            className={`btn rounded-xl text-base lg:text-xl px-6 lg:px-10 py-2.5 lg:py-4 transition-all font-bold ${
              customAction.disabled
                ? 'bg-warm-600 scale-95 opacity-80 cursor-not-allowed'
                : customAction.variant === 'chain'
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-warm-900'
                  : 'btn-primary'
            }`}
          >
            {customAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
