import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { useAchievementStore } from '../store/achievementStore';
import { useArenaStore } from '../store/arenaStore';
import { CARD_SIZES } from '../constants/cardSizes';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import { CardDetailPanel } from './CardDetailPanel';
import { CardFilterBar, type SortOption } from './CardFilterBar';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import type { CardView } from '../types';

type TrophyTier = 'bronze' | 'silver' | 'gold';

function TrophyIcon({ tier, earned }: { tier: TrophyTier; earned: boolean }) {
  const colors: Record<TrophyTier, { bg: string; dim: string }> = {
    bronze: { bg: 'achievement-tier1', dim: 'text-base-700' },
    silver: { bg: 'achievement-tier2', dim: 'text-base-700' },
    gold: { bg: 'achievement-tier3', dim: 'text-base-700' },
  };
  const c = colors[tier];

  return (
    <div
      className={`w-4 h-4 lg:w-5 lg:h-5 rounded-full flex items-center justify-center ${
        earned ? c.bg : 'bg-base-800'
      }`}
      title={`${tier === 'bronze' ? 'Win' : tier === 'silver' ? 'Victory' : 'Perfect'} — ${
        tier === 'bronze'
          ? 'Win a battle with this card on your board'
          : tier === 'silver'
            ? 'Achieve a 10-win run with this card'
            : 'Perfect 10-win run, no losses'
      }${earned ? ' (Earned!)' : ''}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`w-2.5 h-2.5 lg:w-3 lg:h-3 ${earned ? 'text-white' : c.dim}`}
      >
        <path d="M12 2l2.94 6.34L22 9.27l-5.15 4.64L18.18 22 12 18.27 5.82 22l1.33-8.09L2 9.27l7.06-.93z" />
      </svg>
    </div>
  );
}

export function AchievementsPage() {
  const { engine, init, loadSetPreviews, setPreviewCards, setMetas } = useGameStore();
  const { fetchAchievements, hasBronze, hasSilver, hasGold } = useAchievementStore();
  const { api, selectedAccount } = useArenaStore();
  const [selectedCard, setSelectedCard] = useState<CardView | null>(null);

  useInitGuard(() => {
    void init();
  }, [init]);

  // Load set previews to get full CardView objects
  useEffect(() => {
    if (engine && setMetas.length > 0) {
      loadSetPreviews();
    }
  }, [engine, setMetas, loadSetPreviews]);

  // Always refetch achievements on mount
  useEffect(() => {
    if (api && selectedAccount) {
      void fetchAchievements(api, selectedAccount.address);
    }
  }, [api, selectedAccount, fetchAchievements]);

  // Build a flat list of all unique cards from all sets
  const allCards: CardView[] = [];
  const seenIds = new Set<number>();
  for (const cards of Object.values(setPreviewCards)) {
    for (const card of cards) {
      if (!seenIds.has(card.id)) {
        seenIds.add(card.id);
        allCards.push(card);
      }
    }
  }
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');

  const sorted = [...allCards].sort((a, b) =>
    sortBy === 'name'
      ? a.name.localeCompare(b.name)
      : a.play_cost - b.play_cost || a.name.localeCompare(b.name)
  );

  type FilterMode = 'all' | 'earned' | 'missing';
  type FilterTier = 'bronze' | 'silver' | 'gold';
  const [filterTier, setFilterTier] = useState<FilterTier | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const setFilter = useCallback((tier: FilterTier, mode: FilterMode) => {
    if (mode === 'all') {
      setFilterTier(null);
      setFilterMode('all');
    } else {
      setFilterTier(tier);
      setFilterMode(mode);
    }
  }, []);

  const totalCards = sorted.length;
  const bronzeCount = sorted.filter((c) => hasBronze(c.id)).length;
  const silverCount = sorted.filter((c) => hasSilver(c.id)).length;
  const goldCount = sorted.filter((c) => hasGold(c.id)).length;

  const filtered = sorted.filter((c) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !JSON.stringify(c).toLowerCase().includes(q)) {
        return false;
      }
    }
    // Achievement tier filter
    if (filterTier && filterMode !== 'all') {
      const has =
        filterTier === 'bronze'
          ? hasBronze(c.id)
          : filterTier === 'silver'
            ? hasSilver(c.id)
            : hasGold(c.id);
      return filterMode === 'earned' ? has : !has;
    }
    return true;
  });

  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      {/* Card Detail Panel — left side, full height */}
      <CardDetailPanel card={selectedCard} isVisible={true} mode={{ type: 'readOnly' }} />

      {/* Top bar — starts after card panel */}
      <TopBar backTo="/history" backLabel="History" title="Achievements" hasCardPanel />

      {/* Main content — offset for panel */}
      <div className="flex-1 ml-44 lg:ml-80 overflow-y-auto">
        <div className="w-full max-w-5xl mx-auto p-3 lg:p-6">
          {sorted.length === 0 ? (
            <div className="text-center py-16 text-base-500 text-sm">
              {engine ? 'No cards found.' : 'Loading...'}
            </div>
          ) : (
            <>
              {/* Achievement tiers */}
              <div className="mb-4 lg:mb-6 grid grid-cols-1 sm:grid-cols-3 gap-2 lg:gap-3">
                {[
                  {
                    tier: 'bronze' as FilterTier,
                    label: 'Win',
                    desc: 'Win a battle with this card',
                    count: bronzeCount,
                    activeColor: 'achievement-tier1-active',
                    segActive: 'achievement-tier1-seg',
                  },
                  {
                    tier: 'silver' as FilterTier,
                    label: 'Victory',
                    desc: '10-win run with this card',
                    count: silverCount,
                    activeColor: 'achievement-tier2-active',
                    segActive: 'achievement-tier2-seg',
                  },
                  {
                    tier: 'gold' as FilterTier,
                    label: 'Perfect',
                    desc: 'Perfect run, no losses',
                    count: goldCount,
                    activeColor: 'achievement-tier3-active',
                    segActive: 'achievement-tier3-seg',
                  },
                ].map(({ tier, label, desc, count, activeColor, segActive }) => {
                  const isActive = filterTier === tier;
                  const modes: { mode: FilterMode; text: string }[] = [
                    { mode: 'all', text: 'All' },
                    { mode: 'earned', text: 'Earned' },
                    { mode: 'missing', text: 'Missing' },
                  ];
                  return (
                    <div
                      key={tier}
                      className={`theme-panel p-2.5 lg:p-4 bg-base-900/60 border rounded-xl transition-colors flex sm:flex-col items-center sm:items-stretch gap-3 sm:gap-0 sm:text-center ${
                        isActive ? activeColor : 'border-base-700/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 sm:justify-center sm:mb-1">
                        <TrophyIcon tier={tier} earned={true} />
                        <span className="text-sm lg:text-lg font-stat font-bold">
                          {count}/{totalCards}
                        </span>
                      </div>
                      <div className="flex flex-col sm:items-center">
                        <div
                          className={`text-[10px] lg:text-xs font-heading font-bold uppercase tracking-wider mb-0.5 ${
                            tier === 'bronze'
                              ? 'achievement-tier1-text'
                              : tier === 'silver'
                                ? 'achievement-tier2-text'
                                : 'achievement-tier3-text'
                          }`}
                        >
                          {label}
                        </div>
                        <p className="text-[9px] lg:text-[10px] text-base-500 leading-tight mb-2">
                          {desc}
                        </p>
                      </div>
                      <div className="inline-flex rounded border border-base-700/60 overflow-hidden ml-auto sm:ml-0 sm:self-center">
                        {modes.map(({ mode, text }) => {
                          const active =
                            (isActive && filterMode === mode) || (!isActive && mode === 'all');
                          return (
                            <button
                              key={mode}
                              onClick={() => setFilter(tier, mode)}
                              className={`text-[8px] lg:text-[10px] px-1.5 lg:px-2 py-0.5 transition-colors ${
                                active
                                  ? segActive
                                  : 'text-base-600 hover:text-base-300 hover:bg-base-800/50'
                              }`}
                            >
                              {text}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Search & Sort */}
              <div className="mb-4 lg:mb-6">
                <CardFilterBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
              </div>

              {/* Card grid */}
              <div className="flex flex-wrap gap-2 lg:gap-3 justify-center">
                {filtered.map((card) => {
                  const cardBronze = hasBronze(card.id);
                  const cardSilver = hasSilver(card.id);
                  const cardGold = hasGold(card.id);
                  const art = getCardArtSm(card.id);
                  const isSelected = selectedCard?.id === card.id;

                  return (
                    <div key={card.id} className="flex flex-col items-center">
                      <button
                        onClick={() => setSelectedCard(isSelected ? null : card)}
                        className={`card relative ${CARD_SIZES.compact.tw} overflow-hidden bg-black cursor-pointer flex flex-col ${
                          isSelected ? 'card-selected ring-2 ring-accent' : ''
                        }`}
                      >
                        {art ? (
                          <>
                            <img
                              src={art}
                              alt={card.name}
                              className="absolute inset-0 w-full h-full object-cover object-[center_30%]"
                              style={{ filter: 'brightness(1.15) saturate(1.1)' }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
                          </>
                        ) : (
                          <>
                            <div className="absolute inset-0 flex items-center justify-center text-2xl lg:text-4xl bg-card-bg">
                              {getCardEmoji(card.id)}
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          </>
                        )}
                        <div
                          className="relative z-[11] text-[0.6rem] lg:text-xs font-bold text-center truncate text-white pt-0.5 px-0.5"
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                        >
                          {card.name}
                        </div>
                      </button>

                      <div className="flex items-center gap-0.5 lg:gap-1 mt-1">
                        <TrophyIcon tier="bronze" earned={cardBronze} />
                        <TrophyIcon tier="silver" earned={cardSilver} />
                        <TrophyIcon tier="gold" earned={cardGold} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
