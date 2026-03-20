import { useEffect, useRef } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { useIsSubmitting } from '../store/txStore';
import { CardFan } from './CardFan';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import { Link, Navigate } from 'react-router-dom';

/** Arena pre-game: confirm selected set, start game, or redirect to active game. */
export function BlockchainPage() {
  const {
    isConnected,
    isConnecting,
    connect,
    chainState,
    selectedAccount,
    refreshGameState,
    startGame,
    fetchSets,
    fetchCards,
    hydrateGameEngineFromChainData,
    connectionError,
  } = useArenaStore();

  const { init, engine, setMetas, loadSetPreviews, setPreviewCards } = useGameStore();
  const { selectedSetId } = useSettingsStore();
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

  useEffect(() => {
    if (engine && setMetas.length > 0) {
      loadSetPreviews();
    }
  }, [engine, setMetas, loadSetPreviews]);

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen min-h-svh bg-warm-900 flex flex-col text-white">
        <TopBar backTo="/play" backLabel="Play" title="Online Arena" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl lg:text-4xl font-black mb-6 lg:mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600">
            ONLINE ARENA
          </h1>
          <button
            onClick={() => void connect()}
            disabled={isConnecting}
            className="bg-yellow-500 hover:bg-yellow-400 text-warm-900 font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {isConnecting ? 'CONNECTING...' : 'RETRY CONNECTION'}
          </button>
          <Link
            to="/network"
            className="mt-3 text-sm text-warm-400 hover:text-warm-200 transition-colors"
          >
            Network Settings
          </Link>
          {connectionError && (
            <p className="mt-3 max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
              {connectionError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Active game exists — go straight to game
  if (chainState) {
    return <Navigate to="/arena/game" replace />;
  }

  // Pre-game confirmation
  const setMeta = setMetas.find((m) => m.id === selectedSetId);
  const cards = selectedSetId !== null ? setPreviewCards[selectedSetId] : undefined;

  return (
    <div className="min-h-screen min-h-svh bg-warm-950 flex flex-col text-white">
      <TopBar backTo="/play" backLabel="Play" title="Online Arena" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          {selectedSetId === null || !setMeta ? (
            <>
              <p className="text-warm-400 text-sm mb-4">No set selected.</p>
              <Link
                to="/sets"
                className="inline-block bg-yellow-500 hover:bg-yellow-400 text-warm-950 font-bold py-3 px-8 rounded-xl text-sm transition-all"
              >
                Choose a Set
              </Link>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <h2 className="text-xl lg:text-2xl font-heading font-bold text-white">
                {setMeta.name}
              </h2>
              <p className="text-warm-500 text-xs lg:text-sm">
                {cards?.length ?? '?'} cards
              </p>
              <div className="set-tile">
                {cards && cards.length > 0 ? (
                  <CardFan cards={cards} />
                ) : (
                  <div className="set-card-fan flex items-center justify-center">
                    <span className="text-warm-600 text-sm">...</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 mt-6 w-full">
                <button
                  onClick={() => void startGame(selectedSetId)}
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-warm-950 font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50 shadow-lg shadow-yellow-500/20 uppercase tracking-wider"
                >
                  Start Game
                </button>
                <Link
                  to="/sets"
                  className="text-warm-400 hover:text-warm-200 text-sm transition-colors"
                >
                  Change Set
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
