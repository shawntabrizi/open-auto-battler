import { useEffect } from 'react';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { ContractGameOverScreen } from './ContractGameOverScreen';
import { GameShell } from './GameShell';
import { Navigate } from 'react-router-dom';

/** Contract arena gameplay — renders GameShell with contract-backed commit. */
export function ContractArenaGamePage() {
  const { isConnected, hasActiveGame, submitTurnOnChain, refreshGameState, isSubmitting } =
    useContractStore();
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
        <div className="text-sm lg:text-base text-base-400 uppercase tracking-wider">
          Loading game...
        </div>
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
