import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { CardGallery } from './CardGallery';
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

  return (
    <div className="app-shell h-screen h-svh text-white flex flex-col overflow-hidden">
      <TopBar backTo="/sets" backLabel="Sets" title={setName} hasCardPanel />

      <div className="flex-1 min-h-0 flex flex-col ml-44 lg:ml-80 bg-gradient-to-b from-surface-mid/10 via-transparent to-transparent">
        <div className="flex-shrink-0 px-3 lg:px-8 pt-3 lg:pt-6">
          <div className="theme-panel flex items-center rounded-2xl border border-base-700/60 bg-gradient-to-r from-surface-mid/30 via-surface-dark/45 to-surface-dark/75 px-4 py-3 lg:px-6 lg:py-5 shadow-elevation-rest">
            <div className="flex flex-col">
              <h2 className="theme-title-text text-lg lg:text-3xl font-bold text-transparent bg-clip-text">
                Set Preview
              </h2>
              {cards && (
                <p className="text-base-400 text-xs lg:text-base mt-0.5 lg:mt-1">
                  <span className="text-white font-bold">{cards.length}</span> unique cards in this
                  set.
                  <span className="hidden lg:inline"> Click a card for full details.</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-3 lg:px-8 py-3 lg:py-4">
          <div className="theme-panel h-full rounded-2xl border border-base-700/60 bg-gradient-to-b from-surface-mid/20 via-surface-dark/10 to-surface-dark/45 p-3 lg:p-5 shadow-elevation-rest">
            {!cards ? (
              <div className="flex items-center justify-center h-full text-base-500">
                Loading...
              </div>
            ) : cards.length === 0 ? (
              <div className="flex items-center justify-center h-full text-base-500">
                No cards in this set.
              </div>
            ) : (
              <CardGallery
                cards={cards}
                selectedId={selectedCard?.id}
                onSelect={(card) => setSelectedCard(card as CardView | null)}
              />
            )}
          </div>
        </div>
      </div>

      <CardDetailPanel card={selectedCard} isVisible={true} mode={{ type: 'readOnly' }} />
    </div>
  );
}
