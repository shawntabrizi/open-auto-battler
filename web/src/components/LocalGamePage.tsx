import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useInitGuard } from '../hooks';
import { useBlockchainStore } from '../store/blockchainStore';
import { useGameStore } from '../store/gameStore';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { RotatePrompt } from './RotatePrompt';
import { SetPreviewOverlay } from './SetPreviewOverlay';
import { SetSelectionScreen } from './SetSelectionScreen';
import { BackLink } from './PageHeader';

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
    getLocalBattleOpponent,
  } = useBlockchainStore();
  const {
    initEngine,
    isLoading,
    error,
    engine,
    engineReady,
    gameStarted,
    view,
    currentSetId,
    resolveMultiplayerBattle,
  } = useGameStore();

  const [battleLoading, setBattleLoading] = useState(false);

  useInitGuard(() => {
    void initEngine();
    if (!isConnected) {
      void connect();
    }
  }, [connect, initEngine, isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    if (allCards.length === 0) {
      void fetchCards();
    }
    if (availableSets.length === 0) {
      void fetchSets();
    }
  }, [allCards.length, availableSets.length, fetchCards, fetchSets, isConnected]);

  useEffect(() => {
    if (!isConnected || !engine) return;
    hydrateGameEngineFromChainData();
  }, [allCards, availableSets, engine, hydrateGameEngineFromChainData, isConnected]);

  const handleBattle = async () => {
    if (!view || currentSetId === null) {
      toast.error('Select a blockchain set before starting a run.');
      return;
    }

    setBattleLoading(true);
    try {
      const opponent = await getLocalBattleOpponent(
        currentSetId,
        view.round,
        view.wins,
        view.lives
      );

      if (!opponent) {
        toast.error('No blockchain opponent is available for this run yet.');
        return;
      }

      resolveMultiplayerBattle(opponent.board, opponent.seed);
    } finally {
      setBattleLoading(false);
    }
  };

  const chainContentReady = allCards.length > 0 && availableSets.length > 0;

  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-warm-950 text-white flex flex-col p-4">
        <BackLink to="/" label="Menu" />
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-md rounded-3xl border border-warm-800 bg-warm-900/70 p-6 lg:p-8 text-center">
            <div className="text-[10px] lg:text-xs font-heading tracking-[0.35em] text-warm-500 uppercase">
              Local Play
            </div>
            <h1 className="mt-2 text-2xl lg:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500">
              Blockchain Required
            </h1>
            <p className="mt-3 text-sm lg:text-base text-warm-300">
              Local runs now use blockchain cards, sets, and opponents. Connect to a node before
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
                to="/settings/network"
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

  if (view?.phase === 'victory' || view?.phase === 'defeat') {
    return <GameOverScreen />;
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (isLoading || !engineReady || !chainContentReady) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-warm-400">
          {isConnecting && !chainContentReady
            ? 'Connecting to blockchain...'
            : 'Loading blockchain content...'}
        </div>
      </div>
    );
  }

  if (engineReady && !gameStarted) {
    return (
      <>
        <SetSelectionScreen />
        <SetPreviewOverlay />
      </>
    );
  }

  if (!view) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-warm-400">Initializing game...</div>
      </div>
    );
  }

  return (
    <div className="h-screen h-svh bg-board-bg text-warm-200 overflow-hidden font-sans selection:bg-yellow-500/30 flex flex-col">
      <GameShell
        hideEndTurn={true}
        customAction={{
          label: battleLoading ? 'Loading Opponent...' : 'Battle',
          onClick: handleBattle,
          disabled: battleLoading,
        }}
      />
      <SetPreviewOverlay />
      <RotatePrompt />
    </div>
  );
}
