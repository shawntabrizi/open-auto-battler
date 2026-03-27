import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConstructedStore, createEmptyDeck } from '../store/constructedStore';
import { useGameStore } from '../store/gameStore';
import { useInitGuard } from '../hooks';
import { CardFan } from './CardFan';
import { TopBar } from './TopBar';
import type { CardView } from '../types';

function DeckCard({
  name,
  cardCount,
  isComplete,
  previewCards,
  onEdit,
  onDelete,
}: {
  name: string;
  cardCount: number;
  isComplete: boolean;
  previewCards: CardView[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`theme-panel relative flex flex-col items-center text-center rounded-xl border p-3 lg:p-5 transition-all ${
        isComplete
          ? 'border-base-700/40 bg-surface-dark/60 hover:border-base-500/80 hover:bg-surface-mid/20'
          : 'border-base-700/20 bg-surface-dark/30'
      }`}
    >
      {/* Status badge */}
      <div className="absolute top-2.5 right-2.5 lg:top-3 lg:right-3">
        <span
          className={`text-[9px] lg:text-[10px] font-mono px-1.5 py-0.5 rounded ${
            isComplete ? 'bg-positive/20 text-positive' : 'bg-base-700/40 text-base-500'
          }`}
        >
          {cardCount}/50
        </span>
      </div>

      {/* Deck name */}
      <h3 className="font-button font-bold text-sm lg:text-xl text-white">{name}</h3>
      <p className="text-base-500 text-[10px] lg:text-sm">
        {isComplete ? 'Ready to battle' : 'Incomplete'}
      </p>

      {/* Card fan preview */}
      {previewCards.length > 0 ? (
        <CardFan cards={previewCards} />
      ) : (
        <div className="set-card-fan flex items-center justify-center">
          <span className="text-base-600 text-sm">Empty</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-1 lg:mt-2 w-full">
        <button
          onClick={onEdit}
          className="theme-button theme-surface-button flex-1 text-center text-xs lg:text-sm py-1.5 lg:py-2 border font-bold rounded-lg transition-all"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="theme-button text-center text-xs lg:text-sm py-1.5 lg:py-2 border border-negative/30 text-negative/70 hover:border-negative/60 hover:text-negative font-bold rounded-lg transition-all"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function DeckListPage() {
  const navigate = useNavigate();
  const { decks, loadDecks, saveDeck, deleteDeck, loaded } = useConstructedStore();
  const { engine, initEngine, cardSet } = useGameStore();

  useInitGuard(() => {
    void initEngine();
    void loadDecks();
  }, [initEngine, loadDecks]);

  // Load the full card pool once engine is ready so we can resolve card previews
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

  const cardLookup = new Map<number, CardView>();
  if (cardSet) {
    for (const c of cardSet) {
      cardLookup.set(c.id, c);
    }
  }

  const getPreviewCards = (deck: { cards: number[] }): CardView[] => {
    const unique = [...new Set(deck.cards)];
    return unique.slice(0, 5).map((id) => cardLookup.get(id)).filter(Boolean) as CardView[];
  };

  const handleNewDeck = async () => {
    const deck = createEmptyDeck();
    await saveDeck(deck);
    navigate(`/constructed/edit/${deck.id}`);
  };

  const handleDelete = async (id: string) => {
    await deleteDeck(id);
  };

  const sorted = [...decks].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/constructed" backLabel="Constructed" title="Deck Builder" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-5xl mx-auto px-3 lg:px-6 py-6 lg:py-12">
          {!loaded ? (
            <div className="text-center py-16 text-base-500 text-sm">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-6">
                {/* New Deck tile */}
                <button
                  onClick={() => void handleNewDeck()}
                  className="theme-panel flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-base-600/60 p-3 lg:p-5 cursor-pointer hover:border-accent/60 hover:bg-accent/5 transition-all min-h-[10rem]"
                >
                  <span className="text-3xl lg:text-4xl text-base-500">+</span>
                  <span className="font-button font-bold text-sm lg:text-base text-base-400 mt-1">
                    New Deck
                  </span>
                </button>

                {/* Existing decks */}
                {sorted.map((deck) => (
                  <DeckCard
                    key={deck.id}
                    name={deck.name}
                    cardCount={deck.cards.length}
                    isComplete={deck.cards.length === 50}
                    previewCards={getPreviewCards(deck)}
                    onEdit={() => navigate(`/constructed/edit/${deck.id}`)}
                    onDelete={() => void handleDelete(deck.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
