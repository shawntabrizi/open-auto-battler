import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useConstructedStore } from '../store/constructedStore';
import { useArenaStore } from '../store/arenaStore';
import { useGameStore } from '../store/gameStore';
import { useIsSubmitting } from '../store/txStore';
import { useInitGuard } from '../hooks';
import { CardFan } from './CardFan';
import { TopBar } from './TopBar';
import type { CardView } from '../types';

export function ConstructedBattlePage() {
  const { decks, selectedDeckId, loadDecks, loaded } = useConstructedStore();
  const {
    isConnected,
    isConnecting,
    connect,
    selectedAccount,
    constructedChainState,
    refreshConstructedGameState,
    startConstructedGame,
    fetchCards,
    hydrateGameEngineFromChainData,
    connectionError,
  } = useArenaStore();
  const { engine, initEngine, engineReady, cardSet, gameStarted } = useGameStore();
  const isSubmitting = useIsSubmitting();
  const refreshCalled = useRef(false);

  useInitGuard(() => {
    void initEngine();
    void loadDecks();
    if (!isConnected) {
      void connect();
    }
  }, [initEngine, loadDecks, connect, isConnected]);

  useEffect(() => {
    if (isConnected) {
      void fetchCards();
    }
  }, [isConnected, fetchCards]);

  useEffect(() => {
    if (engine && isConnected) {
      hydrateGameEngineFromChainData();
    }
  }, [engine, hydrateGameEngineFromChainData, isConnected]);

  useEffect(() => {
    if (!engine || !isConnected || !selectedAccount) return;
    if (refreshCalled.current) return;
    refreshCalled.current = true;
    void refreshConstructedGameState();
  }, [engine, isConnected, selectedAccount, refreshConstructedGameState]);

  // Load full card pool for previews
  useEffect(() => {
    if (engine && !cardSet) {
      try {
        if (typeof engine.load_full_card_pool === 'function') {
          engine.load_full_card_pool();
        } else {
          engine.load_card_set(0);
        }
        useGameStore.setState({ cardSet: engine.get_card_set() });
      } catch (err) {
        console.error('Failed to load card pool:', err);
      }
    }
  }, [engine, cardSet]);

  // Active game on chain — go to game page
  if (constructedChainState || gameStarted) {
    return <Navigate to="/constructed/game" replace />;
  }

  if (!isConnected) {
    return (
      <div className="app-shell min-h-screen min-h-svh text-white flex flex-col">
        <TopBar backTo="/constructed" backLabel="Constructed" title="Battle" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
          <div className="theme-panel w-full max-w-md rounded-3xl border border-base-800 bg-base-900/70 p-6 lg:p-8 text-center">
            <h1 className="theme-title-text mt-2 text-2xl lg:text-4xl font-black tracking-tight text-transparent bg-clip-text">
              Blockchain Required
            </h1>
            <p className="mt-3 text-sm lg:text-base text-base-300">
              Constructed battles run on the blockchain. Connect to a node before starting.
            </p>
            {connectionError && (
              <p className="mt-3 rounded-xl theme-error-panel border px-3 py-2 text-xs text-negative">
                {connectionError}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={() => void connect()}
                disabled={isConnecting}
                className="theme-button btn-primary rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-base-700 disabled:text-base-400"
              >
                {isConnecting ? 'CONNECTING...' : 'RETRY CONNECTION'}
              </button>
              <Link
                to="/network"
                className="theme-button theme-surface-button rounded-xl border px-4 py-3 text-sm font-bold transition-colors"
              >
                NETWORK SETTINGS
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded || !engineReady) {
    return (
      <div className="app-shell h-screen h-svh flex items-center justify-center">
        <div className="text-xl text-base-400">Loading...</div>
      </div>
    );
  }

  const selectedDeck = decks.find((d) => d.id === selectedDeckId && d.cards.length === 50);

  const cardLookup = new Map<number, CardView>();
  if (cardSet) {
    for (const c of cardSet) cardLookup.set(c.id, c);
  }

  const getPreviewCards = (cardIds: number[]): CardView[] => {
    const unique = [...new Set(cardIds)];
    return unique.slice(0, 5).map((id) => cardLookup.get(id)).filter(Boolean) as CardView[];
  };

  const handleStart = async () => {
    if (!selectedDeck) return;
    try {
      await startConstructedGame(selectedDeck.cards);
    } catch (err) {
      console.error('Failed to start constructed game:', err);
      toast.error(`Failed to start: ${err}`);
    }
  };

  const previewCards = selectedDeck ? getPreviewCards(selectedDeck.cards) : [];

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/constructed" backLabel="Constructed" title="Battle" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          {!selectedDeck ? (
            <>
              <p className="text-base-400 text-sm mb-4">No deck selected.</p>
              <Link
                to="/constructed/decks"
                className="theme-button btn-primary inline-block font-bold py-3 px-8 rounded-xl text-sm transition-all"
              >
                Select a Deck
              </Link>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <h2 className="text-xl lg:text-2xl font-heading font-bold text-white">
                {selectedDeck.name}
              </h2>
              <p className="text-base-500 text-xs lg:text-sm">50 cards</p>
              <div className="set-tile">
                {previewCards.length > 0 ? (
                  <CardFan cards={previewCards} />
                ) : (
                  <div className="set-card-fan flex items-center justify-center">
                    <span className="text-base-600 text-sm">...</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 mt-6 w-full">
                <button
                  onClick={() => void handleStart()}
                  disabled={isSubmitting}
                  className="theme-button btn-primary w-full font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 uppercase tracking-wider disabled:opacity-50"
                >
                  {isSubmitting ? 'Starting...' : 'Start Battle'}
                </button>
                <Link
                  to="/constructed/decks"
                  className="text-base-400 hover:text-base-200 text-sm transition-colors"
                >
                  Change Deck
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
