import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMultiplayerStore } from '../store/multiplayerStore';

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

export function HUD({ hideEndTurn, customAction }: HUDProps) {
  const { view, endTurn, engine, setShowBag, showBag, selection, startingLives, winsToVictory } = useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady, battleTimer } = useMultiplayerStore();

  // Local timer for the waiting player (who already submitted)
  const [waitingTimer, setWaitingTimer] = useState<number | null>(null);
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Start waiting timer when we submit and opponent hasn't
  useEffect(() => {
    if (status === 'in-game' && isReady && !opponentReady && view?.phase === 'shop') {
      setWaitingTimer(BATTLE_TIMER_SECONDS);
      waitingTimerRef.current = setInterval(() => {
        setWaitingTimer(prev => {
          if (prev !== null && prev > 1) return prev - 1;
          return prev;
        });
      }, 1000);
    }

    // Clear when opponent is ready or we're no longer ready
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
        waitingTimerRef.current = null;
      }
    };
  }, [isReady, opponentReady, status, view?.phase]);
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

  // Check if card panel is visible (same logic as GameLayout)
  const showCardPanel = view?.phase === 'shop' || selection?.type === 'board' || showBag;

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

  // Determine display timer
  const displayTimer = isWaiting ? waitingTimer : (opponentWaiting ? battleTimer : null);

  return (
    <div className={`hud h-12 lg:h-16 bg-gray-900/80 border-b border-gray-700 flex items-center justify-between px-2 lg:px-6 relative z-20 ${showCardPanel ? 'show-card-panel' : ''}`}>
      {/* Left: Lives */}
      <div className="flex items-center gap-1 lg:gap-2">
        <span className="text-gray-400 hidden lg:inline">Lives:</span>
        {/* Mobile: compact numeric */}
        <div className="flex lg:hidden items-center gap-1">
          <span className="text-red-500 text-lg">♥</span>
          <span className="font-bold text-sm">{view.lives}/{startingLives}</span>
        </div>
        {/* Desktop: full hearts */}
        <div className="hidden lg:flex gap-1">
          {Array.from({ length: startingLives }).map((_, i) => (
            <span
              key={i}
              className={`text-2xl ${i < view.lives ? 'text-red-500' : 'text-gray-600'}`}
            >
              ♥
            </span>
          ))}
        </div>
      </div>

      {/* Center: Round & End Turn */}
      <div className="flex items-center gap-2 lg:gap-4">
        <div className="text-center">
          <div className="text-xs lg:text-sm text-gray-400">Round</div>
          <div className="text-lg lg:text-2xl font-bold text-gold">{view.round}</div>
        </div>

        {view.phase === 'shop' && (
          <div className="flex items-center gap-2 lg:gap-3">
            <button
              onClick={() => setShowBag(true)}
              className="btn bg-gray-800 hover:bg-gray-700 text-white border-gray-600 flex items-center gap-1 lg:gap-2 px-2 lg:px-4"
              title="View your draw pool"
            >
              <span className="text-lg lg:text-xl">🎒</span>
              <span className="font-bold text-sm lg:text-base">{view.bag_count}</span>
            </button>
            {!hideEndTurn && (
              <>
                {/* Timer display when either player is waiting */}
                {displayTimer !== null && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
                    opponentWaiting
                      ? (displayTimer <= 5 ? 'bg-red-600 animate-pulse' : 'bg-orange-600')
                      : 'bg-blue-600'
                  }`}>
                    <span className="text-white text-sm lg:text-base font-bold">
                      {opponentWaiting ? '⚠️ Submit in:' : '⏳ Waiting:'}
                    </span>
                    <span className={`text-white text-lg lg:text-xl font-bold ${displayTimer <= 5 ? 'text-yellow-300' : ''}`}>
                      {displayTimer}s
                    </span>
                  </div>
                )}
                <button
                  onClick={handleEndTurn}
                  disabled={isWaiting}
                  className={`btn btn-primary text-sm lg:text-lg px-3 lg:px-6 py-2 lg:py-3 transition-all ${
                    isWaiting
                      ? 'bg-gray-600 scale-95 opacity-80 cursor-not-allowed'
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
                className={`btn text-sm lg:text-lg px-3 lg:px-6 py-2 lg:py-3 transition-all font-bold ${
                  customAction.disabled
                    ? 'bg-gray-600 scale-95 opacity-80 cursor-not-allowed'
                    : customAction.variant === 'chain'
                      ? 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-slate-900'
                      : 'btn-primary'
                }`}
              >
                {customAction.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Wins */}
      <div className="flex items-center gap-1 lg:gap-2">
        <span className="text-gray-400 hidden lg:inline">Wins:</span>
        {/* Mobile: compact numeric */}
        <div className="flex lg:hidden items-center gap-1">
          <span className="text-gold text-lg">★</span>
          <span className="font-bold text-sm">{view.wins}/{winsToVictory}</span>
        </div>
        {/* Desktop: full stars */}
        <div className="hidden lg:flex gap-1">
          {Array.from({ length: winsToVictory }).map((_, i) => (
            <span key={i} className={`text-lg ${i < view.wins ? 'text-gold' : 'text-gray-600'}`}>
              ★
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
