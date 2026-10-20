import { useEffect, useState } from 'react';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { TopBar } from './TopBar';
import { RankedPanel } from './RankedPanel';
import { Link, Navigate } from 'react-router-dom';

const CONTRACT_SET_ID = 0;

/** Contract arena pre-game: start a casual or ranked game with set 0, or redirect to active game. */
export function ContractArenaPage() {
  const { isConnected, hasActiveGame, isRefreshing, startGame, refreshGameState } =
    useContractStore();
  const { initEngine, engine } = useGameStore();
  // Start stays disabled until the first active-game check finishes, so a
  // player with a game on chain is redirected instead of hitting a rejected
  // startGame (and, in sponsored mode, a needless session setup).
  const [checkedActiveGame, setCheckedActiveGame] = useState(false);
  const canStart = !!engine && checkedActiveGame && !isRefreshing;

  useEffect(() => {
    if (!engine) void initEngine();
  }, [engine, initEngine]);

  useEffect(() => {
    if (!isConnected) return;
    void refreshGameState().finally(() => setCheckedActiveGame(true));
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
            disabled={!canStart}
            className="theme-button btn-primary w-full font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50 uppercase tracking-wider"
          >
            {!engine ? 'Loading Engine...' : canStart ? 'Start Game' : 'Checking for a game...'}
          </button>

          <div className="mt-4">
            <RankedPanel setId={CONTRACT_SET_ID} disabled={!canStart} />
          </div>

          <div className="flex justify-center gap-6 mt-6 text-sm">
            <Link to="/contract/leaderboard" className="text-base-400 hover:text-white">
              Leaderboard
            </Link>
            <Link to="/contract/badges" className="text-base-400 hover:text-white">
              Badges
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
