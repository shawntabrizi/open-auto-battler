import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';

export function ConstructedGamePage() {
  const { gameStarted, view, resolveVersusBattle, engineReady } = useGameStore();
  const [battleLoading, setBattleLoading] = useState(false);

  // No active game — redirect back to battle selection
  if (!gameStarted && engineReady) {
    return <Navigate to="/constructed/battle" replace />;
  }

  if (view?.phase === 'completed') {
    return <GameOverScreen />;
  }

  if (!view) {
    return (
      <div className="app-shell h-screen h-svh flex items-center justify-center">
        <div className="text-xl text-base-400">Initializing game...</div>
      </div>
    );
  }

  // For now, constructed offline uses a random opponent board (self-play)
  const handleBattle = async () => {
    setBattleLoading(true);
    try {
      // Generate a random opponent: use the player's own board as opponent for testing
      const engine = useGameStore.getState().engine;
      if (!engine) {
        toast.error('Engine not ready');
        return;
      }
      const board = engine.get_board();
      const seed = Date.now();
      resolveVersusBattle(board, seed);
    } finally {
      setBattleLoading(false);
    }
  };

  return (
    <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans selection:bg-accent/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: battleLoading ? 'Loading...' : 'Battle',
          onClick: handleBattle,
          disabled: battleLoading,
        }}
      />
    </div>
  );
}
