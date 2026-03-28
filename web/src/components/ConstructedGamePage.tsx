import { useEffect, useRef } from 'react';
import { useIsSubmitting } from '../store/txStore';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { useInitGuard } from '../hooks';
import { Navigate } from 'react-router-dom';

export function ConstructedGamePage() {
  const {
    isConnected,
    selectedAccount,
    constructedChainState,
    refreshConstructedGameState,
    submitConstructedTurnOnChain,
    fetchCards,
    hydrateGameEngineFromChainData,
  } = useArenaStore();

  const { init, engine, view } = useGameStore();
  const isSubmitting = useIsSubmitting();
  const refreshCalled = useRef(false);

  useInitGuard(() => {
    void init();
    if (isConnected) {
      void fetchCards();
    }
  }, [fetchCards, init, isConnected]);

  useEffect(() => {
    if (!engine || !isConnected) return;
    hydrateGameEngineFromChainData();
  }, [engine, hydrateGameEngineFromChainData, isConnected]);

  useEffect(() => {
    if (!engine || !isConnected || !selectedAccount) return;
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    void refreshConstructedGameState();
  }, [engine, isConnected, selectedAccount, refreshConstructedGameState]);

  if (view?.phase === 'completed') {
    return <GameOverScreen />;
  }

  // No active game — redirect back
  if (!constructedChainState) {
    return <Navigate to="/constructed/battle" replace />;
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans selection:bg-accent/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: 'Commit',
          onClick: () => void submitConstructedTurnOnChain(),
          disabled: isSubmitting,
          variant: 'chain',
        }}
      />
    </div>
  );
}
