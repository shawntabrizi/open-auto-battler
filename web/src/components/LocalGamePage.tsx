import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useInitGuard } from '../hooks';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import { RotatePrompt } from './RotatePrompt';
import { TopBar } from './TopBar';
import { Navigate } from 'react-router-dom';

/** Practice pre-game: confirm selected set, start game, or redirect to active game. */
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
  const { initEngine, engine, engineReady, gameStarted, setMetas, loadSetPreviews, setPreviewCards, startGame } = useGameStore();
  const { selectedSetId } = useSettingsStore();

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

  useEffect(() => {
    if (engine && setMetas.length > 0) {
      loadSetPreviews();
    }
  }, [engine, setMetas, loadSetPreviews]);

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

  // Active game — go to game
  if (gameStarted) {
    return <Navigate to="/practice/game" replace />;
  }

  // Pre-game confirmation
  const setMeta = setMetas.find((m) => m.id === selectedSetId);
  const cards = selectedSetId !== null ? setPreviewCards[selectedSetId] : undefined;

  return (
    <div className="min-h-screen min-h-svh bg-warm-950 flex flex-col text-white">
      <TopBar backTo="/play" backLabel="Play" title="Practice" />
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
            <>
              <div className="bg-warm-900/80 border border-warm-700/40 rounded-xl p-4 lg:p-6 mb-4">
                <p className="text-[10px] lg:text-xs text-warm-500 uppercase tracking-wider mb-2">
                  Card Set
                </p>
                <h2 className="text-xl lg:text-2xl font-heading font-bold text-white mb-3">
                  {setMeta.name}
                </h2>
                {cards && (
                  <div className="flex items-center justify-center gap-1 mb-3">
                    {cards.slice(0, 5).map((c) => {
                      const art = getCardArtSm(c.id);
                      return art ? (
                        <img
                          key={c.id}
                          src={art}
                          alt=""
                          className="w-8 h-11 object-cover object-[center_30%] rounded-sm border border-warm-700/50"
                        />
                      ) : (
                        <div
                          key={c.id}
                          className="w-8 h-11 flex items-center justify-center bg-warm-800 rounded-sm border border-warm-700/50 text-sm"
                        >
                          {getCardEmoji(c.id)}
                        </div>
                      );
                    })}
                    {cards.length > 5 && (
                      <span className="text-warm-500 text-xs ml-1">+{cards.length - 5}</span>
                    )}
                  </div>
                )}
                <p className="text-warm-500 text-xs">{cards?.length ?? '?'} cards</p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => startGame(selectedSetId)}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-warm-950 font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 shadow-lg shadow-yellow-500/20 uppercase tracking-wider"
                >
                  Start Practice
                </button>
                <Link
                  to="/sets"
                  className="text-warm-400 hover:text-warm-200 text-sm transition-colors"
                >
                  Change Set
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      <RotatePrompt />
    </div>
  );
}
