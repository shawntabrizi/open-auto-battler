import React, { useEffect, useState } from 'react';
import { useBlockchainStore } from '../store/blockchainStore';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

export const CreateSetPage: React.FC = () => {
  const {
    isConnected,
    connect,
    allCards,
    fetchCards,
    submitCard,
    createCardSet
  } = useBlockchainStore();

  const [cardForm, setCardForm] = useState({
    name: '',
    emoji: '🃏',
    attack: 1,
    health: 1,
    play_cost: 1,
    pitch_value: 1,
    description: ''
  });

  const [selectedCards, setSelectedCards] = useState<{ card_id: number, rarity: number }[]>([]);
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);
  const [isCreatingSet, setIsCreatingSet] = useState(false);

  useEffect(() => {
    if (isConnected) {
      fetchCards();
    }
  }, [isConnected, fetchCards]);

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      toast.error('Connect wallet first');
      return;
    }
    setIsSubmittingCard(true);
    try {
      await submitCard({
        stats: { attack: cardForm.attack, health: cardForm.health },
        economy: { play_cost: cardForm.play_cost, pitch_value: cardForm.pitch_value },
        abilities: []
      }, {
        name: cardForm.name,
        emoji: cardForm.emoji,
        description: cardForm.description
      });
      toast.success('Card submitted successfully!');
      setCardForm({
        name: '',
        emoji: '🃏',
        attack: 1,
        health: 1,
        play_cost: 1,
        pitch_value: 1,
        description: ''
      });
    } catch (err) {
      toast.error('Failed to submit card');
    } finally {
      setIsSubmittingCard(false);
    }
  };

  const toggleCardSelection = (cardId: number) => {
    setSelectedCards(prev => {
      const exists = prev.find(c => c.card_id === cardId);
      if (exists) {
        return prev.filter(c => c.card_id !== cardId);
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

    setIsCreatingSet(true);
    try {
      await createCardSet(selectedCards);
      toast.success('Card set created successfully!');
      setSelectedCards([]);
    } catch (err) {
      toast.error('Failed to create card set');
    } finally {
      setIsCreatingSet(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <h1 className="text-4xl font-black mb-8 italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 uppercase">
          Set Creator
        </h1>
        <button
          onClick={connect}
          className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-4 px-8 rounded-full transition-all transform hover:scale-105"
        >
          CONNECT WALLET TO START
        </button>
        <Link to="/blockchain" className="mt-8 text-slate-400 hover:text-white underline">Back to Blockchain</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-yellow-500 uppercase">
              Blockchain Set Creator
            </h1>
            <p className="text-slate-500 text-sm">Create cards and bundle them into playable sets</p>
          </div>
          <Link to="/blockchain" className="text-slate-400 hover:text-white border border-slate-800 px-4 py-2 rounded-lg transition-colors">
            Exit to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Column: Create Card */}
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="text-yellow-500">01</span> Create New Card
            </h2>

            <form onSubmit={handleCardSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                  <input
                    type="text"
                    value={cardForm.name}
                    onChange={e => setCardForm({ ...cardForm, name: e.target.value })}
                    placeholder="Super Goblin"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                    required
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Emoji</label>
                  <input
                    type="text"
                    value={cardForm.emoji}
                    onChange={e => setCardForm({ ...cardForm, emoji: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50 text-center"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Attack</label>
                  <input
                    type="number"
                    value={cardForm.attack}
                    onChange={e => setCardForm({ ...cardForm, attack: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Health</label>
                  <input
                    type="number"
                    value={cardForm.health}
                    onChange={e => setCardForm({ ...cardForm, health: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                    min="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Play Cost</label>
                  <input
                    type="number"
                    value={cardForm.play_cost}
                    onChange={e => setCardForm({ ...cardForm, play_cost: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Pitch Value</label>
                  <input
                    type="number"
                    value={cardForm.pitch_value}
                    onChange={e => setCardForm({ ...cardForm, pitch_value: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                <textarea
                  value={cardForm.description}
                  onChange={e => setCardForm({ ...cardForm, description: e.target.value })}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-yellow-500/50 h-20 resize-none"
                  placeholder="What does this card do?"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingCard}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 border border-white/5"
              >
                {isSubmittingCard ? 'SUBMITTING TO CHAIN...' : 'MINT CARD ON-CHAIN'}
              </button>
            </form>
          </div>

          {/* Right Column: Build Set */}
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm flex flex-col">
            <h2 className="text-xl font-bold mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="text-yellow-500">02</span> Assemble Set
              </span>
              <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded">
                {selectedCards.length} Cards Selected
              </span>
            </h2>

            <div className="flex-1 overflow-y-auto max-h-[400px] mb-6 pr-2 custom-scrollbar">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {allCards.map(card => {
                    const isSelected = selectedCards.some(c => c.card_id === card.id);
                    return (
                      <div
                        key={card.id}
                        onClick={() => toggleCardSelection(card.id)}
                        className={`
                          relative group cursor-pointer p-3 rounded-xl border-2 transition-all
                          ${isSelected ? 'bg-yellow-500/10 border-yellow-500' : 'bg-slate-800 border-white/5 hover:border-white/20'}
                        `}
                      >
                        <div className="text-2xl mb-1 text-center">{card.metadata.emoji}</div>
                        <div className="text-[10px] font-bold text-center truncate uppercase opacity-80">{card.metadata.name}</div>
                        <div className="flex justify-between mt-2 text-[10px] font-mono opacity-50">
                          <span>{card.data.stats.attack}⚔️</span>
                          <span>{card.data.stats.health}❤️</span>
                        </div>

                        {isSelected && (
                          <div className="absolute -top-2 -right-2 bg-yellow-500 text-slate-950 rounded-full p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedCards.length > 0 && (
                  <div className="mt-8 border-t border-white/5 pt-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Configure Rarity</h3>
                    <div className="space-y-2">
                      {selectedCards.map(sc => {
                        const card = allCards.find(c => c.id === sc.card_id);
                        if (!card) return null;
                        return (
                          <div key={sc.card_id} className="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg border border-white/5">
                            <div className="flex items-center gap-2">
                              <span>{card.metadata.emoji}</span>
                              <span className="text-xs font-bold">{card.metadata.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-slate-500 uppercase font-bold">Rarity</label>
                              <input
                                type="number"
                                value={sc.rarity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setSelectedCards(prev => prev.map(c => c.card_id === sc.card_id ? { ...c, rarity: val } : c));
                                }}
                                className="w-16 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-yellow-500/50 text-center"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleCreateSet}
              disabled={isCreatingSet || selectedCards.length === 0}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black py-4 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-yellow-500/10 uppercase tracking-wider"
            >
              {isCreatingSet ? 'CREATING SET...' : 'FINALIZE & DEPLOY SET'}
            </button>
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
