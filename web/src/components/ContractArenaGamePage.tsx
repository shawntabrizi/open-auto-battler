import { useEffect } from 'react';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { ContractGameOverScreen } from './ContractGameOverScreen';
import { GameShell } from './GameShell';
import { Navigate } from 'react-router-dom';

/** Contract arena gameplay — renders GameShell with contract-backed commit. */
export function ContractArenaGamePage() {
  const {
    isConnected,
    hasActiveGame,
    submitTurnOnChain,
    refreshGameState,
    isSubmitting,
    refreshError,
  } = useContractStore();
  const { initEngine, engine, view, showBattleOverlay } = useGameStore();

  useEffect(() => {
    if (!engine) void initEngine();
  }, [engine, initEngine]);

  useEffect(() => {
    if (isConnected) void refreshGameState();
  }, [isConnected, refreshGameState]);

  if (view?.phase === 'completed' && !showBattleOverlay) {
    return <ContractGameOverScreen />;
  }

  if (!hasActiveGame) {
    return <Navigate to="/contract/arena" replace />;
  }

  if (!view) {
    return (
      <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans selection:bg-accent/30 flex items-center justify-center">
        {refreshError ? (
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <div className="text-sm lg:text-base text-red-400 uppercase tracking-wider">
              Failed to load game
            </div>
            <p className="text-xs text-base-400 max-w-xs">{refreshError}</p>
            <button
              onClick={() => void refreshGameState()}
              className="theme-button btn-primary font-black py-2 px-6 rounded-xl text-sm uppercase tracking-wider"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="text-sm lg:text-base text-base-400 uppercase tracking-wider">
            Loading game...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans selection:bg-accent/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: isSubmitting ? 'Committing...' : 'Commit',
          onClick: () => void submitTurnOnChain(),
          disabled: isSubmitting,
          variant: 'chain',
        }}
      />
    </div>
  );
}
