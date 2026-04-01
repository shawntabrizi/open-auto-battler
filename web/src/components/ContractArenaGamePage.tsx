import { useEffect } from 'react';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { Navigate } from 'react-router-dom';

/** Contract arena gameplay — renders GameShell with contract-backed commit. */
export function ContractArenaGamePage() {
  const { isConnected, hasActiveGame, submitTurnOnChain, refreshGameState } = useContractStore();
  const { init, view } = useGameStore();

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    if (isConnected) void refreshGameState();
  }, [isConnected, refreshGameState]);

  if (view?.phase === 'completed') {
    return <GameOverScreen />;
  }

  if (!hasActiveGame) {
    return <Navigate to="/contract/arena" replace />;
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-base-200 overflow-hidden font-sans selection:bg-accent/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: 'Commit',
          onClick: () => void submitTurnOnChain(),
          disabled: false,
          variant: 'chain',
        }}
      />
    </div>
  );
}
