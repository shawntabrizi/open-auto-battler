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
    accounts,
    selectedAccount,
    selectAccount,
    blockNumber,
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
      <div className="h-screen h-svh flex items-center justify-center bg-warm-950">
        <div className="text-xl text-warm-400">Saving results...</div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="h-screen h-svh flex items-center justify-center bg-warm-950">
        <div className="text-xl text-warm-400">Loading tournament game...</div>
      </div>
    );
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-warm-200 overflow-hidden font-sans selection:bg-purple-500/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: 'Commit',
          onClick: () => void submitTournamentTurn(),
          disabled: isSubmitting,
          variant: 'chain',
        }}
        blockchainMode={true}
        detailMode="tournament"
        blockNumber={blockNumber}
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectAccount={selectAccount}
      />
    </div>
  );
}
