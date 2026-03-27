import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useConstructedStore } from '../store/constructedStore';
import { TopBar } from './TopBar';

export function ConstructedPage() {
  const { loadDecks, decks, loaded } = useConstructedStore();

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  const validDecks = decks.filter((d) => d.cards.length === 50);

  return (
    <div className="app-shell fixed inset-0 text-white flex flex-col">
      <TopBar backTo="/play" backLabel="Play" title="Constructed" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-md mx-auto p-3 lg:p-4 lg:mt-[10vh]">
          <div className="flex flex-col gap-3 lg:gap-4">
            {/* Deck Builder */}
            <Link
              to="/constructed/decks"
              className="theme-panel group block w-full p-5 lg:p-7 rounded-xl border-2 theme-cta-card active:scale-[0.98] transition-all text-center"
            >
              <h2 className="font-button text-2xl lg:text-3xl font-bold text-white tracking-wide">
                DECK BUILDER
              </h2>
              <p className="theme-secondary-text mt-0.5 text-xs lg:text-sm">
                {loaded
                  ? `${decks.length} deck${decks.length !== 1 ? 's' : ''} saved`
                  : 'Loading...'}
              </p>
            </Link>

            {/* Battle */}
            <Link
              to={validDecks.length > 0 ? '/constructed/battle' : '#'}
              onClick={(e) => {
                if (validDecks.length === 0) e.preventDefault();
              }}
              className={`theme-panel group block w-full p-4 lg:p-5 rounded-xl border transition-all text-center ${
                validDecks.length > 0
                  ? 'border-base-700 bg-base-900/30 hover:border-base-500 hover:bg-base-800/40 active:scale-[0.98]'
                  : 'border-base-700/30 bg-base-900/20 opacity-50 cursor-not-allowed'
              }`}
            >
              <h3 className="font-button text-base lg:text-lg font-bold text-white">BATTLE</h3>
              <p className="theme-secondary-text mt-1 text-[10px] lg:text-xs">
                {validDecks.length > 0
                  ? 'Choose a deck and fight'
                  : 'Build a complete deck first'}
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
