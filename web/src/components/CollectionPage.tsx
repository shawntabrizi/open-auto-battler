import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useInitGuard } from '../hooks';
import { UnitCard } from './UnitCard';
import { CardDetailPanel } from './CardDetailPanel';
import type { CardView } from '../types';

type SortKey = 'name' | 'play_cost' | 'attack' | 'health';

export function CollectionPage() {
  const { engine, engineReady, setMetas, cardSet, initEngine } = useGameStore();

  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [costFilter, setCostFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('play_cost');
  const [selectedCard, setSelectedCard] = useState<CardView | null>(null);
  const [abilityFilter, setAbilityFilter] = useState<'all' | 'has' | 'none'>('all');

  // Initialize engine if needed
  useInitGuard(() => {
    if (!engineReady) {
      initEngine();
    }
  }, [engineReady, initEngine]);

  // Get cards for current set
  const allCards = useMemo(() => {
    if (!engine || !engineReady) return [];
    if (selectedSetId !== null) {
      try {
        return engine.get_set_cards(selectedSetId);
      } catch {
        return [];
      }
    }
    return cardSet || [];
  }, [engine, engineReady, selectedSetId, cardSet]);

  // Apply filters and sort
  const filteredCards = useMemo(() => {
    let cards = [...allCards];

    // Search filter
    if (search) {
      const lower = search.toLowerCase();
      cards = cards.filter((c) => c.name.toLowerCase().includes(lower));
    }

    // Cost filter
    if (costFilter !== null) {
      if (costFilter >= 6) {
        cards = cards.filter((c) => c.play_cost >= 6);
      } else {
        cards = cards.filter((c) => c.play_cost === costFilter);
      }
    }

    // Ability filter
    if (abilityFilter === 'has') {
      cards = cards.filter((c) => c.abilities.length > 0);
    } else if (abilityFilter === 'none') {
      cards = cards.filter((c) => c.abilities.length === 0);
    }

    // Sort
    cards.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return a[sortBy] - b[sortBy];
    });

    return cards;
  }, [allCards, search, costFilter, sortBy, abilityFilter]);

  if (!engineReady) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center text-white">
        <div className="animate-pulse text-warm-400">Loading engine...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-surface-dark/95 backdrop-blur border-b border-warm-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-warm-400 hover:text-white transition-colors text-sm">
              &larr; Back
            </Link>
            <h1 className="font-heading text-xl lg:text-2xl font-bold tracking-wide">COLLECTION</h1>
          </div>
          {setMetas.length > 0 && (
            <select
              value={selectedSetId ?? ''}
              onChange={(e) => setSelectedSetId(e.target.value ? Number(e.target.value) : null)}
              className="bg-warm-800 border border-warm-700 rounded px-2 py-1 text-sm"
            >
              <option value="">Default Set</option>
              {setMetas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 p-4">
        {/* Filter Sidebar */}
        <div className="lg:w-56 flex-shrink-0 flex flex-col gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-warm-800 border border-warm-700 rounded-lg px-3 py-2 text-sm placeholder-warm-500 focus:outline-none focus:border-amber-500"
          />

          {/* Cost filter */}
          <div>
            <span className="text-xs text-warm-400 mb-1 block">Cost</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setCostFilter(null)}
                className={`px-2 py-1 text-xs rounded ${costFilter === null ? 'bg-amber-600 text-white' : 'bg-warm-800 text-warm-400 hover:bg-warm-700'}`}
              >
                All
              </button>
              {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                <button
                  key={c}
                  onClick={() => setCostFilter(c)}
                  className={`px-2 py-1 text-xs rounded ${costFilter === c ? 'bg-mana-blue text-white' : 'bg-warm-800 text-warm-400 hover:bg-warm-700'}`}
                >
                  {c >= 6 ? '6+' : c}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div>
            <span className="text-xs text-warm-400 mb-1 block">Sort</span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['name', 'Name'],
                  ['play_cost', 'Cost'],
                  ['attack', 'Atk'],
                  ['health', 'HP'],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-2 py-1 text-xs rounded ${sortBy === key ? 'bg-accent-violet text-white' : 'bg-warm-800 text-warm-400 hover:bg-warm-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Ability filter */}
          <div>
            <span className="text-xs text-warm-400 mb-1 block">Ability</span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['all', 'All'],
                  ['has', 'Has Ability'],
                  ['none', 'No Ability'],
                ] as ['all' | 'has' | 'none', string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAbilityFilter(key)}
                  className={`px-2 py-1 text-xs rounded ${abilityFilter === key ? 'bg-accent-emerald text-white' : 'bg-warm-800 text-warm-400 hover:bg-warm-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Card Grid */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-warm-500 mb-3">
            Showing {filteredCards.length} of {allCards.length} cards
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 lg:gap-3">
            {filteredCards.map((card, i) => (
              <div
                key={card.id}
                className="flex justify-center opacity-0 animate-stagger-fade-in"
                style={{
                  animationDelay: `${Math.min(i * 30, 300)}ms`,
                  animationFillMode: 'forwards',
                }}
              >
                <UnitCard
                  card={card}
                  sizeVariant="compact"
                  showCost={true}
                  showPitch={true}
                  enableWobble={false}
                  isSelected={selectedCard?.id === card.id}
                  onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)}
                />
              </div>
            ))}
          </div>
          {filteredCards.length === 0 && (
            <div className="text-center text-warm-500 py-12">No cards match your filters.</div>
          )}
        </div>
      </div>

      {/* Card Detail Panel */}
      <CardDetailPanel card={selectedCard} isVisible={selectedCard !== null} topOffset="0" />
    </div>
  );
}
