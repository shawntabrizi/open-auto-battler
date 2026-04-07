import { useEffect } from 'react';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { TopBar } from './TopBar';
import { Navigate } from 'react-router-dom';

const CONTRACT_SET_ID = 0;

/** Contract arena pre-game: start game with set 0, or redirect to active game. */
export function ContractArenaPage() {
  const { isConnected, hasActiveGame, startGame, refreshGameState } = useContractStore();
  const { initEngine, engine } = useGameStore();

  useEffect(() => {
    void initEngine();
  }, [initEngine]);

  useEffect(() => {
    if (isConnected) void refreshGameState();
  }, [isConnected, refreshGameState]);

  if (!isConnected) {
    return <Navigate to="/contract" replace />;
  }

  if (hasActiveGame) {
    return <Navigate to="/contract/arena/game" replace />;
  }

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/contract" backLabel="Contract" title="Contract Arena" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h2 className="text-xl lg:text-2xl font-heading font-bold text-white mb-2">
            Foundations of War
          </h2>
          <p className="text-base-500 text-xs lg:text-sm mb-6">Set 0</p>

          <button
            onClick={() => {
              console.log('Starting contract game with set', CONTRACT_SET_ID);
              void startGame(CONTRACT_SET_ID);
            }}
            disabled={!engine}
            className="theme-button btn-primary w-full font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50 uppercase tracking-wider"
          >
            {engine ? 'Start Game' : 'Loading Engine...'}
          </button>
        </div>
      </div>
    </div>
  );
}
