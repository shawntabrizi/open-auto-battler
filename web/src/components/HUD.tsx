import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMultiplayerStore } from '../store/multiplayerStore';

interface HUDProps {
  hideEndTurn?: boolean;
}

export function HUD({ hideEndTurn }: HUDProps) {
  const { view, endTurn, engine, setShowBag, showBag, selection } = useGameStore();
  const { status, setIsReady, sendMessage, isReady, opponentReady } = useMultiplayerStore();
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

  return (
    <div className={`hud h-12 md:h-16 bg-gray-900/80 border-b border-gray-700 flex items-center justify-between px-2 md:px-6 relative z-20 ${showCardPanel ? 'show-card-panel' : ''}`}>
      {/* Left: Lives */}
      <div className="flex items-center gap-1 md:gap-2">
        <span className="text-gray-400 hidden md:inline">Lives:</span>
        {/* Mobile: compact numeric */}
        <div className="flex md:hidden items-center gap-1">
          <span className="text-red-500 text-lg">♥</span>
          <span className="font-bold text-sm">{view.lives}/3</span>
        </div>
        {/* Desktop: full hearts */}
        <div className="hidden md:flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
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
      <div className="flex items-center gap-2 md:gap-4">
        <div className="text-center">
          <div className="text-xs md:text-sm text-gray-400">Round</div>
          <div className="text-lg md:text-2xl font-bold text-gold">{view.round}</div>
        </div>

        {view.phase === 'shop' && (
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setShowBag(true)}
              className="btn bg-gray-800 hover:bg-gray-700 text-white border-gray-600 flex items-center gap-1 md:gap-2 px-2 md:px-4"
              title="View your draw pool"
            >
              <span className="text-lg md:text-xl">🎒</span>
              <span className="font-bold text-sm md:text-base">{view.bag_count}</span>
            </button>
            {!hideEndTurn && (
              <button
                onClick={handleEndTurn}
                disabled={isWaiting}
                className={`btn btn-primary text-sm md:text-lg px-3 md:px-6 py-2 md:py-3 transition-all ${isWaiting ? 'bg-gray-600 scale-95 opacity-80 cursor-not-allowed' : ''}`}
              >
                {isWaiting ? 'Waiting...' : 'Battle!'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Wins */}
      <div className="flex items-center gap-1 md:gap-2">
        <span className="text-gray-400 hidden md:inline">Wins:</span>
        {/* Mobile: compact numeric */}
        <div className="flex md:hidden items-center gap-1">
          <span className="text-gold text-lg">★</span>
          <span className="font-bold text-sm">{view.wins}/10</span>
        </div>
        {/* Desktop: full stars */}
        <div className="hidden md:flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={`text-lg ${i < view.wins ? 'text-gold' : 'text-gray-600'}`}>
              ★
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
