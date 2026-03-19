import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useAchievementStore } from '../store/achievementStore';
import { useArenaStore } from '../store/arenaStore';
import { CARD_SIZES } from '../constants/cardSizes';
import { getCardArtSm } from '../utils/cardArt';
import { getCardEmoji } from '../utils/emoji';
import { CardDetailPanel } from './CardDetailPanel';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import type { CardView } from '../types';

type TrophyTier = 'bronze' | 'silver' | 'gold';

function TrophyIcon({ tier, earned }: { tier: TrophyTier; earned: boolean }) {
  const colors: Record<TrophyTier, { bg: string; dim: string }> = {
    bronze: { bg: 'bg-amber-800', dim: 'text-warm-700' },
    silver: { bg: 'bg-gray-400', dim: 'text-warm-700' },
    gold: { bg: 'bg-yellow-400', dim: 'text-warm-700' },
  };
  const c = colors[tier];

  return (
    <div
      className={`w-4 h-4 lg:w-5 lg:h-5 rounded-full flex items-center justify-center ${
        earned ? c.bg : 'bg-warm-800'
      }`}
      title={`${tier.charAt(0).toUpperCase() + tier.slice(1)} — ${
        tier === 'bronze'
          ? 'Play this card on any board'
          : tier === 'silver'
            ? 'Win a game with this card'
            : 'Perfect run with this card'
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
  const { isLoaded, fetchAchievements, hasBronze, hasSilver, hasGold } = useAchievementStore();
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

  // Fetch achievements when api/account available
  useEffect(() => {
    if (api && selectedAccount && !isLoaded) {
      void fetchAchievements(api, selectedAccount.address);
    }
  }, [api, selectedAccount, isLoaded, fetchAchievements]);

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
  const sorted = allCards.sort((a, b) => a.name.localeCompare(b.name));

  const totalCards = sorted.length;
  const bronzeCount = sorted.filter((c) => hasBronze(c.id)).length;
  const silverCount = sorted.filter((c) => hasSilver(c.id)).length;
  const goldCount = sorted.filter((c) => hasGold(c.id)).length;

  return (
    <div className="fixed inset-0 bg-warm-950 text-white flex flex-col">
      {/* Card Detail Panel — left side, full height */}
      <CardDetailPanel card={selectedCard} isVisible={true} mode={{ type: 'readOnly' }} />

      {/* Top bar — starts after card panel */}
      <TopBar backTo="/history" backLabel="History" title="Achievements" hasCardPanel />

      {/* Main content — offset for panel */}
      <div className="flex-1 ml-44 lg:ml-80 overflow-y-auto">
        <div className="w-full max-w-5xl mx-auto p-3 lg:p-6">
          {sorted.length === 0 ? (
            <div className="text-center py-16 text-warm-500 text-sm">
              {engine ? 'No cards found.' : 'Loading...'}
            </div>
          ) : (
            <>
              {/* Stats bar */}
              <div className="mb-4 lg:mb-6 flex items-center justify-center gap-4 lg:gap-8 p-3 lg:p-4 bg-warm-900/60 border border-warm-700/40 rounded-xl">
                <div className="flex items-center gap-2">
                  <TrophyIcon tier="bronze" earned={true} />
                  <span className="text-sm lg:text-base font-stat font-bold">{bronzeCount} / {totalCards}</span>
                  <span className="text-[10px] lg:text-xs text-warm-500">Played</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrophyIcon tier="silver" earned={true} />
                  <span className="text-sm lg:text-base font-stat font-bold">
                    {silverCount} / {totalCards}
                  </span>
                  <span className="text-[10px] lg:text-xs text-warm-500">Wins</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrophyIcon tier="gold" earned={true} />
                  <span className="text-sm lg:text-base font-stat font-bold">{goldCount} / {totalCards}</span>
                  <span className="text-[10px] lg:text-xs text-warm-500">Perfect</span>
                </div>
              </div>

              {/* Card grid */}
              <div className="flex flex-wrap gap-2 lg:gap-3 justify-center">
                {sorted.map((card) => {
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
                          isSelected ? 'card-selected ring-2 ring-yellow-400' : ''
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
