import React, { useEffect, useState } from 'react';
import { useArenaStore } from '../store/arenaStore';
import { useIsSubmitting } from '../store/txStore';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { CardDetailPanel } from './CardDetailPanel';
import { UnitCard } from './UnitCard';
import { TopBar } from './TopBar';
import { DesktopRecommendedBanner } from './DesktopRecommendedBanner';
import { type CardView } from '../types';
import { blockchainCardToCardView } from '../utils/blockchainCards';

export const CreateSetPage: React.FC = () => {
  const { isConnected, connect, allCards, fetchCards, createCardSet } = useArenaStore();

  const [selectedCards, setSelectedCards] = useState<{ card_id: number; rarity: number }[]>([]);
  const [setName, setSetName] = useState('');
  const isSubmitting = useIsSubmitting();
  const [detailCard, setDetailCard] = useState<CardView | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isConnected) {
      void fetchCards();
    }
  }, [isConnected, fetchCards]);

  const toggleCardSelection = (cardId: number) => {
    setSelectedCards((prev) => {
      const exists = prev.find((c) => c.card_id === cardId);
      if (exists) {
        return prev.filter((c) => c.card_id !== cardId);
      } else {
        return [...prev, { card_id: cardId, rarity: 100 }]; // Default rarity 100
      }
    });
  };

  const handleCreateSet = async () => {
    if (selectedCards.length === 0) {
      toast.error('Select at least one card');
      return;
    }

    try {
      await createCardSet(selectedCards, setName || undefined);
      toast.success('Card set created successfully!');
      setSelectedCards([]);
      setSetName('');
    } catch (err) {
      toast.error('Failed to create card set');
    }
  };

  if (!isConnected) {
    return (
      <div className="app-shell min-h-screen flex flex-col text-white">
        <TopBar backTo="/creator" backLabel="Creator" title="Set Creator" />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <button
            onClick={connect}
            className="theme-button btn-primary font-bold py-3 px-6 lg:py-4 lg:px-8 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105"
          >
            CONNECT WALLET TO START
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen text-base-200 flex flex-col">
      {/* Side Panel Integration - Always Visible */}
      <CardDetailPanel card={detailCard} isVisible={true} mode={{ type: 'readOnly' }} />

      <TopBar backTo="/creator" backLabel="Creator" title="Set Creator" hasCardPanel />
      <DesktopRecommendedBanner />

      <div className="p-8 ml-80 transition-all duration-300">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 lg:mb-8">
            <div className="flex items-center justify-between mb-1">
              <Link
                to="/creator/card"
                className="theme-button theme-surface-button border-accent/40 px-3 py-1.5 rounded-lg transition-colors font-bold flex items-center gap-1.5 text-xs lg:text-sm hover:border-accent/60 hover:text-accent"
              >
                <span>+</span> MINT NEW CARDS
              </Link>
            </div>
            <h1 className="theme-title-text text-xl lg:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text uppercase mt-1">
              Set Creator
            </h1>
            <p className="text-base-500 text-xs lg:text-sm mt-0.5">
              Bundle cards into playable sets
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Column 1 & 2: Library */}
            <div className="lg:col-span-2 space-y-6">
              <div className="theme-panel bg-base-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm flex flex-col h-[700px]">
                <h2 className="text-xl font-bold mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="text-accent">01</span> Card Library
                  </span>
                  <span className="text-xs text-base-500 uppercase font-bold tracking-widest">
                    {allCards.length} Total Cards
                  </span>
                </h2>

                <input
                  type="text"
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="theme-input w-full px-3 py-2 mb-4 bg-base-800 border border-white/10 rounded-lg text-white placeholder-base-500 text-sm focus:outline-none focus:border-accent/50"
                />

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {allCards
                      .filter((card) => {
                        if (!searchQuery) return true;
                        const json = JSON.stringify(card).toLowerCase();
                        return json.includes(searchQuery.toLowerCase());
                      })
                      .map((card) => {
                        const isSelected = selectedCards.some((c) => c.card_id === card.id);
                        const isDetailing = detailCard?.id === card.id;
                        const cardView = blockchainCardToCardView(card);
                        return (
                          <div
                            key={card.id}
                            className={`
                            relative group flex flex-col items-center transition-all rounded-xl p-2
                            ${isSelected ? 'bg-accent/10 scale-[1.02]' : ''}
                            ${isDetailing ? 'ring-2 ring-mana rounded-xl' : ''}
                          `}
                          >
                            <div className="w-full aspect-[3/4]">
                              <UnitCard
                                card={cardView}
                                isSelected={isSelected}
                                onClick={() => {
                                  toggleCardSelection(card.id);
                                  setDetailCard(cardView);
                                }}
                              />
                            </div>

                            {isSelected && (
                              <div className="absolute -top-2 -right-2 z-10 bg-accent text-surface-dark rounded-full p-1 shadow-lg">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {allCards.length === 0 && (
                      <div className="col-span-full py-20 text-center text-base-600 italic">
                        No cards found on-chain. Go create some first!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Set Configuration */}
            <div className="space-y-6">
              <div className="theme-panel bg-base-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm flex flex-col h-[700px]">
                <h2 className="text-xl font-bold mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="text-accent">02</span> Set Configuration
                  </span>
                  <span className="theme-pill text-xs bg-accent/10 text-accent px-3 py-1.5 font-bold">
                    {selectedCards.length} SELECTED
                  </span>
                </h2>

                <div className="mb-4">
                  <label className="text-[10px] font-black text-base-500 uppercase tracking-widest block mb-2">
                    Set Name
                  </label>
                  <input
                    type="text"
                    placeholder="Name your set..."
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    className="theme-input w-full px-3 py-2 bg-base-800 border border-white/10 rounded-lg text-white placeholder-base-500 text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {selectedCards.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-black text-base-500 uppercase tracking-widest mb-4">
                        Selected Cards & Rarity Weights
                      </h3>
                      {selectedCards.map((sc) => {
                        const card = allCards.find((c) => c.id === sc.card_id);
                        if (!card) return null;
                        return (
                          <div
                            key={sc.card_id}
                            className="flex items-center justify-between bg-base-800/50 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{card.metadata.emoji}</span>
                              <div>
                                <div className="text-xs font-bold truncate max-w-[100px]">
                                  {card.metadata.name}
                                </div>
                                <div className="text-[10px] text-base-500 font-mono">
                                  {card.data.stats.attack}/{card.data.stats.health}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={sc.rarity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setSelectedCards((prev) =>
                                    prev.map((c) =>
                                      c.card_id === sc.card_id ? { ...c, rarity: val } : c
                                    )
                                  );
                                }}
                                className="theme-input w-16 bg-base-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-accent/50 text-center font-bold"
                              />
                              <button
                                onClick={() => toggleCardSelection(card.id)}
                                className="text-base-600 hover:text-negative transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-base-600 italic text-sm text-center p-8">
                      <div className="text-4xl mb-4 opacity-20">🗂️</div>
                      Select cards from the library to begin building your set.
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-white/5">
                  <button
                    onClick={handleCreateSet}
                    disabled={isSubmitting || selectedCards.length === 0}
                    className="theme-button btn-primary w-full font-black py-4 rounded-2xl transition-all disabled:opacity-50 uppercase tracking-widest"
                  >
                    DEPLOY CARD SET
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};
