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
  isSelected,
  previewCards,
  onSelect,
  onEdit,
  onDelete,
}: {
  name: string;
  cardCount: number;
  isComplete: boolean;
  isSelected: boolean;
  previewCards: CardView[];
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={isComplete ? onSelect : undefined}
      onKeyDown={(e) => {
        if (isComplete && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      role="radio"
      aria-checked={isSelected}
      aria-label={`${name}, ${cardCount} cards`}
      tabIndex={isComplete ? 0 : -1}
      className={`theme-panel set-tile relative flex flex-col items-center text-center rounded-xl border p-3 lg:p-5 transition-all ${
        isSelected
          ? 'set-tile-selected border-2 cursor-pointer'
          : isComplete
            ? 'border-base-700/40 bg-surface-dark/60 hover:border-base-500/80 hover:bg-surface-mid/20 cursor-pointer'
            : 'border-base-700/20 bg-surface-dark/30'
      }`}
    >
      {/* Radio indicator — top right */}
      {isComplete && (
        <div className="absolute top-2.5 right-2.5 lg:top-3 lg:right-3">
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected ? 'set-radio-selected' : 'border-base-600'
            }`}
          >
            {isSelected && <div className="set-radio-dot h-2.5 w-2.5 rounded-full" />}
          </div>
        </div>
      )}

      {/* Status badge for incomplete */}
      {!isComplete && (
        <div className="absolute top-2.5 right-2.5 lg:top-3 lg:right-3">
          <span className="text-[9px] lg:text-[10px] font-mono px-1.5 py-0.5 rounded bg-base-700/40 text-base-500">
            {cardCount}/50
          </span>
        </div>
      )}

      {/* Deck name */}
      <h3 className="font-button font-bold text-sm lg:text-xl text-white">{name}</h3>
      <p className="text-base-500 text-[10px] lg:text-sm">
        {isComplete ? '50 cards' : 'Incomplete'}
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
      <div className="flex gap-3 mt-1 lg:mt-2 w-full">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="theme-button theme-surface-button flex-1 text-center text-xs lg:text-sm py-1.5 lg:py-2 border font-bold rounded-lg transition-all"
        >
          Edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="theme-button text-center text-xs lg:text-sm py-1.5 lg:py-2 px-4 border border-negative/30 text-negative/70 hover:border-negative/60 hover:text-negative font-bold rounded-lg transition-all flex-shrink-0"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function DeckListPage() {
  const navigate = useNavigate();
  const { decks, loadDecks, saveDeck, deleteDeck, selectedDeckId, selectDeck, loaded } =
    useConstructedStore();
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
      <TopBar backTo="/constructed" backLabel="Constructed" title="Select a Deck" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-5xl mx-auto px-3 lg:px-6 py-6 lg:py-12">
          {!loaded ? (
            <div className="text-center py-16 text-base-500 text-sm">Loading...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-base-500 text-sm mb-4">No decks yet.</p>
              <button
                onClick={() => void handleNewDeck()}
                className="theme-button btn-primary inline-block font-bold py-3 px-8 rounded-xl text-sm transition-all"
              >
                Build Your First Deck
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 lg:mb-6 text-right">
                <button
                  onClick={() => void handleNewDeck()}
                  className="theme-button theme-surface-button text-xs lg:text-sm py-2 px-4 border font-bold rounded-lg transition-all"
                >
                  + New Deck
                </button>
              </div>

              <div
                role="radiogroup"
                aria-label="Select a deck"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-6"
              >
                {sorted.map((deck) => (
                  <DeckCard
                    key={deck.id}
                    name={deck.name}
                    cardCount={deck.cards.length}
                    isComplete={deck.cards.length === 50}
                    isSelected={selectedDeckId === deck.id}
                    previewCards={getPreviewCards(deck)}
                    onSelect={() => selectDeck(deck.id)}
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
