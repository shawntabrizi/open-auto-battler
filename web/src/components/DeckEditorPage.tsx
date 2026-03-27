import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useConstructedStore } from '../store/constructedStore';
import { useGameStore } from '../store/gameStore';
import { useInitGuard } from '../hooks';
import { UnitCard } from './UnitCard';
import { CardFilterBar, type SortOption } from './CardFilterBar';
import { TopBar } from './TopBar';
import type { CardView } from '../types';

const MAX_COPIES = 5;
const BAG_SIZE = 50;

/** MTG-style stacked column view of deck contents, grouped by mana cost. */
function DeckColumnsView({
  deckSummary,
  onRemove,
}: {
  deckSummary: { card: CardView; count: number }[];
  onRemove: (cardId: number) => void;
}) {
  const MANA_COSTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // Group by mana cost
  const grouped = useMemo(() => {
    const map = new Map<number, { card: CardView; count: number }[]>();
    for (const entry of deckSummary) {
      const cost = entry.card.play_cost;
      const existing = map.get(cost) ?? [];
      existing.push(entry);
      map.set(cost, existing);
    }
    // Sort cards within each group by name
    for (const entries of map.values()) {
      entries.sort((a, b) => a.card.name.localeCompare(b.card.name));
    }
    return map;
  }, [deckSummary]);

  return (
    <div className="flex gap-1.5 lg:gap-2 items-start lg:justify-center">
      {MANA_COSTS.map((cost) => {
        const entries = grouped.get(cost) ?? [];
        const colTotal = entries.reduce((sum, e) => sum + e.count, 0);
        return (
          <div key={cost} className="flex flex-col items-center flex-shrink-0 lg:flex-shrink lg:flex-1 lg:min-w-0" style={{ width: '4.5rem', maxWidth: '5rem' }}>
            {/* Mana cost header */}
            <div className={`text-[10px] lg:text-xs font-mono mb-1 w-full text-center ${entries.length > 0 ? 'text-base-400' : 'text-base-700'}`}>
              {cost}
            </div>
            {/* Stacked cards or empty slot */}
            <div className="relative w-[4.5rem]" style={{ minHeight: '6rem' }}>
              {entries.length === 0 ? (
                <div className="w-[4.5rem] h-[6rem] rounded-lg border border-dashed border-base-700/30" />
              ) : (
                entries.map((entry, i) => (
                  <button
                    key={entry.card.id}
                    onClick={() => onRemove(entry.card.id)}
                    className="relative block w-[4.5rem] h-[6rem] group cursor-pointer"
                    style={{
                      marginTop: i === 0 ? 0 : '-2.5rem',
                      zIndex: i,
                    }}
                    title={`${entry.card.name} (${entry.count}x) — click to remove`}
                  >
                    <UnitCard card={entry.card} showCost draggable={false} />
                    {/* Copy count badge — centered on card */}
                    {entry.count > 1 && (
                      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                        <div className="bg-black/70 text-white text-xs font-bold px-1.5 py-0.5 rounded-md border border-base-500/50">
                          {entry.count}x
                        </div>
                      </div>
                    )}
                    {/* Hover remove indicator */}
                    <div className="absolute inset-0 rounded-lg bg-negative/0 group-hover:bg-negative/20 transition-colors flex items-center justify-center pointer-events-none">
                      <span className="text-negative text-lg font-bold opacity-0 group-hover:opacity-80 transition-opacity">
                        -
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
            {/* Column card count */}
            <div className={`text-[9px] font-mono mt-1 ${colTotal > 0 ? 'text-base-500' : 'text-base-700/50'}`}>
              {colTotal}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DeckEditorPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { getDeck, saveDeck, loadDecks, loaded } = useConstructedStore();
  const { engine, initEngine, cardSet } = useGameStore();

  const [deckName, setDeckName] = useState('');
  const [deckCards, setDeckCards] = useState<number[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('cost');

  useInitGuard(() => {
    void initEngine();
    void loadDecks();
  }, [initEngine, loadDecks]);

  // Load the full card pool (falls back to set 0 if WASM not rebuilt yet)
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

  // Initialize deck state from store once loaded
  useEffect(() => {
    if (!loaded || !deckId || initialized) return;
    const deck = getDeck(deckId);
    if (deck) {
      setDeckName(deck.name);
      setDeckCards([...deck.cards]);
    } else {
      toast.error('Deck not found');
      navigate('/constructed/decks', { replace: true });
    }
    setInitialized(true);
  }, [loaded, deckId, getDeck, initialized, navigate]);

  // Count copies of each card in the deck
  const cardCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const id of deckCards) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [deckCards]);

  // All available cards (sorted/filtered)
  const allCards = useMemo(() => {
    if (!cardSet) return [];
    return [...cardSet].filter((c) => c.play_cost > 0).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return a.play_cost - b.play_cost || a.name.localeCompare(b.name);
    });
  }, [cardSet, sortBy]);

  const filtered = useMemo(() => {
    if (!searchQuery) return allCards;
    const q = searchQuery.toLowerCase();
    return allCards.filter((card) => JSON.stringify(card).toLowerCase().includes(q));
  }, [allCards, searchQuery]);

  const addCard = (card: CardView) => {
    if (deckCards.length >= BAG_SIZE) {
      toast.error(`Deck is full (${BAG_SIZE} cards)`);
      return;
    }
    const copies = cardCounts.get(card.id) ?? 0;
    if (copies >= MAX_COPIES) {
      toast.error(`Max ${MAX_COPIES} copies of ${card.name}`);
      return;
    }
    setDeckCards((prev) => [...prev, card.id]);
  };

  const removeCard = (cardId: number) => {
    setDeckCards((prev) => {
      const idx = prev.lastIndexOf(cardId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  };

  const handleSave = async () => {
    if (!deckId) return;
    const deck = getDeck(deckId);
    if (!deck) return;
    await saveDeck({ ...deck, name: deckName, cards: deckCards });
    toast.success('Deck saved');
    navigate('/constructed/decks');
  };

  // Build a summary of cards in the deck grouped by card
  const deckSummary = useMemo(() => {
    if (!cardSet) return [];
    const cardLookup = new Map<number, CardView>();
    for (const c of cardSet) cardLookup.set(c.id, c);

    const entries: { card: CardView; count: number }[] = [];
    const seen = new Set<number>();
    for (const id of deckCards) {
      if (seen.has(id)) continue;
      seen.add(id);
      const card = cardLookup.get(id);
      if (card) {
        entries.push({ card, count: cardCounts.get(id) ?? 0 });
      }
    }
    return entries;
  }, [deckCards, cardSet, cardCounts]);

  if (!initialized || !cardSet) {
    return (
      <div className="app-shell h-screen h-svh flex items-center justify-center">
        <div className="text-xl text-base-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/constructed/decks" backLabel="Decks" title="Edit Deck" />

      {/* Deck header bar */}
      <div className="flex-shrink-0 px-3 lg:px-4 py-2 border-b border-base-700/40 flex items-center gap-3">
        <input
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          className="bg-transparent border border-base-700 rounded-lg px-3 py-1.5 text-sm font-heading font-bold text-white focus:outline-none focus:border-accent flex-1 min-w-0"
          placeholder="Deck name"
        />
        <span
          className={`text-xs font-mono flex-shrink-0 ${
            deckCards.length === BAG_SIZE ? 'text-positive' : 'text-base-500'
          }`}
        >
          {deckCards.length}/{BAG_SIZE}
        </span>
        <button
          onClick={() => void handleSave()}
          className={`theme-button font-bold text-xs px-4 py-1.5 rounded-lg transition-all flex-shrink-0 ${
            deckCards.length === BAG_SIZE
              ? 'btn-primary'
              : 'border border-base-600 text-base-400 hover:border-base-500'
          }`}
        >
          Save
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Card pool */}
        <div className="flex-1 min-h-0 flex flex-col p-3 lg:p-4 order-2">
          <div className="flex-shrink-0 pb-2">
            <CardFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              showRaritySort={false}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="flex flex-wrap gap-2 lg:gap-3 justify-center pt-1 pb-4">
              {filtered.map((card, idx) => {
                const copies = cardCounts.get(card.id) ?? 0;
                const atLimit = copies >= MAX_COPIES || deckCards.length >= BAG_SIZE;
                return (
                  <div
                    key={`${card.id}-${idx}`}
                    className={`w-[4.5rem] h-[6rem] md:w-[6rem] md:h-[8rem] lg:w-[7.5rem] lg:h-[10rem] relative ${atLimit ? 'opacity-40' : 'cursor-pointer'}`}
                    onClick={() => !atLimit && addCard(card)}
                  >
                    <UnitCard card={card} showCost draggable={false} />
                    {copies > 0 && (
                      <div className="absolute -top-1 -right-1 bg-accent text-white text-[9px] lg:text-[10px] font-bold w-4 h-4 lg:w-5 lg:h-5 rounded-full flex items-center justify-center z-10">
                        {copies}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right/Top: Deck view — MTG-style mana curve columns */}
        <div className="w-full flex-shrink-0 border-b border-base-700/40 flex flex-col bg-surface-dark/30 order-1 max-h-[40vh]">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto custom-scrollbar p-3 lg:p-4">
            <DeckColumnsView deckSummary={deckSummary} onRemove={removeCard} />
          </div>
        </div>
      </div>
    </div>
  );
}
