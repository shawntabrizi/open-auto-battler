import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useMultiplayerStore } from '../store/multiplayerStore';

interface HUDProps {
  hideEndTurn?: boolean;
}

export function HUD({ hideEndTurn }: HUDProps) {
  const { view, endTurn, engine, setShowBag, showBag } = useGameStore();
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
    <div className="h-16 bg-gray-900/80 border-b border-gray-700 flex items-center justify-between px-6">
      {/* Left: Lives */}
      <div className="flex items-center gap-2">
        <span className="text-gray-400">Lives:</span>
        <div className="flex gap-1">
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
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-sm text-gray-400">Round</div>
          <div className="text-2xl font-bold text-gold">{view.round}</div>
        </div>

        {view.phase === 'shop' && (
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setShowBag(true)}
          className="btn bg-gray-800 hover:bg-gray-700 text-white border-gray-600 flex items-center gap-2 px-4"
          title="View your draw pool"
        >
          <span className="text-xl">🎒</span>
          <span className="font-bold">{view.bagCount}</span>
        </button>
          {!hideEndTurn && (
            <button 
              onClick={handleEndTurn} 
              disabled={isWaiting}
              className={`btn btn-primary text-lg px-6 py-3 transition-all ${isWaiting ? 'bg-gray-600 scale-95 opacity-80 cursor-not-allowed' : ''}`}
            >
              {isWaiting ? 'Waiting...' : 'Battle!'}
            </button>
          )}
      </div>
        )}
      </div>

      {/* Right: Wins */}
      <div className="flex items-center gap-2">
        <span className="text-gray-400">Wins:</span>
        <div className="flex gap-1">
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
