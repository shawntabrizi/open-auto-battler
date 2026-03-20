import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { UnitCard } from './UnitCard';
import { CardDetailPanel } from './CardDetailPanel';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import type { CardView } from '../types';

export function SetPage() {
  const { setId } = useParams<{ setId: string }>();
  const { engine, init, setMetas } = useGameStore();
  const [cards, setCards] = useState<CardView[] | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardView | null>(null);

  useInitGuard(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!engine || setId == null) return;
    try {
      const result: CardView[] = engine.get_set_cards(Number(setId));
      setCards(result);
    } catch (err) {
      console.error('Failed to load set:', err);
    }
  }, [engine, setId]);

  const setName = setMetas.find((m) => m.id === Number(setId))?.name ?? `Set #${setId}`;
  const sorted = cards
    ? [...cards].sort((a, b) => a.play_cost - b.play_cost || a.name.localeCompare(b.name))
    : null;

  return (
    <div className="h-screen h-svh bg-warm-950 text-white flex flex-col overflow-hidden">
      <TopBar backTo="/sets" backLabel="Sets" title={setName} hasCardPanel />

      <div className="flex-1 min-h-0 flex flex-col ml-44 lg:ml-80">
        <div className="flex items-center flex-shrink-0 px-3 lg:px-8 pt-3 lg:pt-6 pb-2 lg:pb-4 border-b border-warm-700">
          <div className="flex flex-col">
            <h2 className="text-lg lg:text-3xl font-bold text-white">Set Preview</h2>
            {sorted && (
              <p className="text-warm-400 text-xs lg:text-base mt-0.5 lg:mt-1">
                <span className="text-white font-bold">{sorted.length}</span> unique cards in this
                set.
                <span className="hidden lg:inline"> Click a card for full details.</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 lg:px-8 py-2 lg:py-4 custom-scrollbar">
          {!sorted ? (
            <div className="flex items-center justify-center h-full text-warm-500">Loading...</div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center h-full text-warm-500">
              No cards in this set.
            </div>
          ) : (
            <div className="grid grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-1 md:gap-4 lg:gap-6 pb-4 lg:pb-12">
              {sorted.map((card, i) => (
                <div key={`${card.id}-${i}`} className="aspect-[3/4]">
                  <UnitCard
                    card={card}
                    showCost={true}
                    showBurn={true}
                    draggable={false}
                    isSelected={selectedCard?.id === card.id}
                    onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-center text-warm-500 text-[10px] lg:text-sm border-t border-warm-800 py-2 lg:py-4 uppercase tracking-wider lg:tracking-widest">
          Sorted by mana cost, then name
        </div>
      </div>

      <CardDetailPanel card={selectedCard} isVisible={true} mode={{ type: 'readOnly' }} />
    </div>
  );
}
