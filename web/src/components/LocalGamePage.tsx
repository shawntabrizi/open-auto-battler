import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useInitGuard } from '../hooks';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { RotatePrompt } from './RotatePrompt';
import { TopBar } from './TopBar';
import { Navigate } from 'react-router-dom';

/** Smart redirect: routes to /practice/select or /practice/game based on game state. */
export function LocalGamePage() {
  const {
    isConnected,
    isConnecting,
    connectionError,
    connect,
    fetchCards,
    fetchSets,
    allCards,
    availableSets,
    hydrateGameEngineFromChainData,
  } = useArenaStore();
  const { initEngine, engine, engineReady, gameStarted } = useGameStore();

  const chainContentReady = allCards.length > 0 && availableSets.length > 0;

  useInitGuard(() => {
    void initEngine();
    if (!isConnected) {
      void connect();
    }
  }, [connect, initEngine, isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    if (allCards.length === 0) void fetchCards();
    if (availableSets.length === 0) void fetchSets();
  }, [allCards.length, availableSets.length, fetchCards, fetchSets, isConnected]);

  useEffect(() => {
    if (!isConnected || !engine) return;
    hydrateGameEngineFromChainData();
  }, [allCards, availableSets, engine, hydrateGameEngineFromChainData, isConnected]);

  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-warm-950 text-white flex flex-col">
        <TopBar backTo="/play" backLabel="Play" title="Practice" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-warm-800 bg-warm-900/70 p-6 lg:p-8 text-center">
            <div className="text-[10px] lg:text-xs font-heading tracking-[0.35em] text-warm-500 uppercase">
              Practice
            </div>
            <h1 className="mt-2 text-2xl lg:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500">
              Blockchain Required
            </h1>
            <p className="mt-3 text-sm lg:text-base text-warm-300">
              Practice runs use blockchain cards, sets, and opponents. Connect to a node before
              starting.
            </p>
            {connectionError && (
              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {connectionError}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={() => void connect()}
                disabled={isConnecting}
                className="rounded-xl bg-yellow-500 px-4 py-3 text-sm font-bold text-warm-950 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:bg-warm-700 disabled:text-warm-400"
              >
                {isConnecting ? 'CONNECTING...' : 'RETRY CONNECTION'}
              </button>
              <Link
                to="/network"
                className="rounded-xl border border-warm-700 px-4 py-3 text-sm font-bold text-warm-200 transition-colors hover:border-warm-500 hover:text-white"
              >
                NETWORK SETTINGS
              </Link>
            </div>
          </div>
        </div>
        <RotatePrompt />
      </div>
    );
  }

  if (!engineReady || !chainContentReady) {
    return (
      <div className="h-screen h-svh flex items-center justify-center bg-warm-950">
        <div className="text-xl text-warm-400">
          {isConnecting && !chainContentReady
            ? 'Connecting to blockchain...'
            : 'Loading blockchain content...'}
        </div>
      </div>
    );
  }

  if (gameStarted) {
    return <Navigate to="/practice/game" replace />;
  }

  return <Navigate to="/practice/select" replace />;
}
