import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { Navigate } from 'react-router-dom';

export function PracticeGamePage() {
  const { getLocalBattleOpponent } = useArenaStore();
  const {
    gameStarted,
    view,
    currentSetId,
    resolveVersusBattle,
    restoreLocalResumePoint,
    engineReady,
  } = useGameStore();

  const [battleLoading, setBattleLoading] = useState(false);
  const [resumeAttempted, setResumeAttempted] = useState(false);

  // Attempt to restore a saved local session on mount
  useEffect(() => {
    if (!engineReady || gameStarted || resumeAttempted) return;
    const resumed = restoreLocalResumePoint();
    if (resumed) {
      toast.success('Resumed local run.');
    }
    setResumeAttempted(true);
  }, [engineReady, gameStarted, restoreLocalResumePoint, resumeAttempted]);

  // No active game — redirect back to parent
  if (!gameStarted && resumeAttempted) {
    return <Navigate to="/practice" replace />;
  }

  if (view?.phase === 'completed') {
    return <GameOverScreen />;
  }

  if (!view) {
    return (
      <div className="app-shell h-screen h-svh flex items-center justify-center">
        <div className="text-xl text-warm-400">Initializing game...</div>
      </div>
    );
  }

  const handleBattle = async () => {
    if (!view || currentSetId === null) {
      toast.error('Select a blockchain set before starting a run.');
      return;
    }

    setBattleLoading(true);
    try {
      const opponent = await getLocalBattleOpponent(
        currentSetId,
        view.round,
        view.wins,
        view.lives
      );

      if (!opponent) {
        toast.error('No blockchain opponent is available for this run yet.');
        return;
      }

      resolveVersusBattle(opponent.board, opponent.seed);
    } finally {
      setBattleLoading(false);
    }
  };

  return (
    <div className="h-screen h-svh bg-board-bg text-warm-200 overflow-hidden font-sans selection:bg-gold/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: battleLoading ? 'Loading Opponent...' : 'Battle',
          onClick: handleBattle,
          disabled: battleLoading,
        }}
      />
    </div>
  );
}
