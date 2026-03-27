import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useConstructedStore } from '../store/constructedStore';
import { useGameStore } from '../store/gameStore';
import { useInitGuard } from '../hooks';
import { CardFan } from './CardFan';
import { TopBar } from './TopBar';
import type { CardView } from '../types';

export function ConstructedBattlePage() {
  const { decks, selectedDeckId, loadDecks, loaded } = useConstructedStore();
  const { engine, initEngine, engineReady, gameStarted, cardSet } = useGameStore();

  useInitGuard(() => {
    void initEngine();
    void loadDecks();
  }, [initEngine, loadDecks]);

  // Load full card pool for previews and game start
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

  if (gameStarted) {
    return <Navigate to="/constructed/game" replace />;
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

  const handleStart = () => {
    if (!engine || !selectedDeck) return;

    try {
      if (typeof engine.load_full_card_pool === 'function') {
        engine.load_full_card_pool();
      } else {
        engine.load_card_set(0);
      }
      const seed = BigInt(Date.now());
      engine.new_run_constructed(seed, selectedDeck.cards);
      useGameStore.setState({
        view: engine.get_view(),
        cardSet: engine.get_card_set(),
        gameStarted: true,
        isLoading: false,
      });
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
                  onClick={handleStart}
                  className="theme-button btn-primary w-full font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 uppercase tracking-wider"
                >
                  Start Battle
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
