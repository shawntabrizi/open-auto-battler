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
  const { decks, selectedDeckId, selectDeck, loadDecks, loaded } = useConstructedStore();
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

  const validDecks = decks.filter((d) => d.cards.length === 50);

  const cardLookup = new Map<number, CardView>();
  if (cardSet) {
    for (const c of cardSet) cardLookup.set(c.id, c);
  }

  const getPreviewCards = (cardIds: number[]): CardView[] => {
    const unique = [...new Set(cardIds)];
    return unique.slice(0, 5).map((id) => cardLookup.get(id)).filter(Boolean) as CardView[];
  };

  const handleStart = () => {
    if (!engine || !selectedDeckId) return;
    const deck = decks.find((d) => d.id === selectedDeckId);
    if (!deck || deck.cards.length !== 50) {
      toast.error('Selected deck is not complete');
      return;
    }

    try {
      // Ensure full card pool is loaded
      if (typeof engine.load_full_card_pool === 'function') {
        engine.load_full_card_pool();
      } else {
        engine.load_card_set(0);
      }
      const seed = BigInt(Date.now());
      engine.new_run_constructed(seed, deck.cards);
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

  const selectedDeck = validDecks.find((d) => d.id === selectedDeckId);

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/constructed" backLabel="Constructed" title="Battle" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          {validDecks.length === 0 ? (
            <>
              <p className="text-base-400 text-sm mb-4">No complete decks.</p>
              <Link
                to="/constructed/decks"
                className="theme-button btn-primary inline-block font-bold py-3 px-8 rounded-xl text-sm transition-all"
              >
                Build a Deck
              </Link>
            </>
          ) : (
            <>
              {/* Deck selection */}
              <div
                role="radiogroup"
                aria-label="Select a deck"
                className="flex flex-col gap-3 mb-6"
              >
                {validDecks.map((deck) => {
                  const isSelected = selectedDeckId === deck.id;
                  return (
                    <div
                      key={deck.id}
                      onClick={() => selectDeck(deck.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectDeck(deck.id);
                        }
                      }}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      className={`theme-panel relative flex flex-col items-center text-center rounded-xl border p-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'set-tile-selected border-2'
                          : 'border-base-700/40 bg-surface-dark/60 hover:border-base-500/80'
                      }`}
                    >
                      <div className="absolute top-2.5 right-2.5">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected ? 'set-radio-selected' : 'border-base-600'
                          }`}
                        >
                          {isSelected && (
                            <div className="set-radio-dot h-2.5 w-2.5 rounded-full" />
                          )}
                        </div>
                      </div>
                      <h3 className="font-button font-bold text-sm lg:text-lg text-white">
                        {deck.name}
                      </h3>
                      <p className="text-base-500 text-[10px] lg:text-sm">50 cards</p>
                      <div className="set-tile">
                        <CardFan cards={getPreviewCards(deck.cards)} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Start button */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleStart}
                  disabled={!selectedDeck}
                  className={`theme-button w-full font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform uppercase tracking-wider ${
                    selectedDeck
                      ? 'btn-primary hover:scale-105'
                      : 'bg-base-700 text-base-500 cursor-not-allowed'
                  }`}
                >
                  Start Battle
                </button>
                <Link
                  to="/constructed/decks"
                  className="text-base-400 hover:text-base-200 text-sm transition-colors"
                >
                  Edit Decks
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
