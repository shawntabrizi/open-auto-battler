import { useEffect, useRef } from 'react';
import { useIsSubmitting } from '../store/txStore';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { useInitGuard } from '../hooks';
import { Navigate } from 'react-router-dom';

export function ArenaGamePage() {
  const {
    isConnected,
    accounts,
    selectedAccount,
    selectAccount,
    chainState,
    blockNumber,
    refreshGameState,
    submitTurnOnChain,
    fetchSets,
    fetchCards,
    hydrateGameEngineFromChainData,
  } = useArenaStore();

  const { init, engine, view } = useGameStore();
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
    void refreshGameState();
  }, [engine, isConnected, selectedAccount, refreshGameState]);

  if (view?.phase === 'completed') {
    return <GameOverScreen />;
  }

  // No active game — redirect back to parent which will route to select
  if (!chainState) {
    return <Navigate to="/arena" replace />;
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans selection:bg-accent/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: 'Commit',
          onClick: () => void submitTurnOnChain(),
          disabled: isSubmitting,
          variant: 'chain',
        }}
        blockchainMode={true}
        blockNumber={blockNumber}
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectAccount={selectAccount}
      />
    </div>
  );
}
