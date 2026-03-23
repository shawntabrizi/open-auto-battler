import { useEffect, useRef } from 'react';
import { useIsSubmitting } from '../store/txStore';
import { useArenaStore } from '../store/arenaStore';
import { useTournamentStore } from '../store/tournamentStore';
import { useGameStore } from '../store/gameStore';
import { GameShell } from './GameShell';
import { useInitGuard } from '../hooks';
import { Navigate } from 'react-router-dom';

export function TournamentGamePage() {
  const {
    isConnected,
    selectedAccount,
    fetchSets,
    fetchCards,
    hydrateGameEngineFromChainData,
  } = useArenaStore();

  const { init, engine, view } = useGameStore();

  const {
    hasActiveTournamentGame,
    tournamentGameOver,
    submitTournamentTurn,
    refreshTournamentGameState,
  } = useTournamentStore();

  const isSubmitting = useIsSubmitting();
  const refreshCalled = useRef(false);

  useInitGuard(() => {
    void init();
    if (isConnected) {
      void fetchSets();
      void fetchCards();
    }
  }, [fetchCards, fetchSets, init, isConnected]);

  useEffect(() => {
    if (!engine || !isConnected) return;
    hydrateGameEngineFromChainData();
  }, [engine, hydrateGameEngineFromChainData, isConnected]);

  useEffect(() => {
    if (!engine || !isConnected || !selectedAccount) return;
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    void refreshTournamentGameState();
  }, [engine, isConnected, selectedAccount, refreshTournamentGameState]);

  // Game ended or no active game — redirect to lobby
  if (tournamentGameOver || (!hasActiveTournamentGame && !view)) {
    return <Navigate to="/tournament/lobby" replace />;
  }

  // Fallback game over from view phase
  if (view?.phase === 'completed') {
    // The endTournamentGame callback in the store will set tournamentGameOver
    // which will trigger the redirect above on re-render
    return (
      <div className="app-shell h-screen h-svh flex items-center justify-center">
        <div className="text-xl text-base-400">Saving results...</div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="app-shell h-screen h-svh flex items-center justify-center">
        <div className="text-xl text-base-400">Loading tournament game...</div>
      </div>
    );
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans selection:bg-accent/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: 'Commit',
          onClick: () => void submitTournamentTurn(),
          disabled: isSubmitting,
          variant: 'chain',
        }}
      />
    </div>
  );
}
