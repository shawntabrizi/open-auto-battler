import { useEffect } from 'react';
import { useContractStore } from '../store/contractStore';
import { useGameStore } from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { CardFan } from './CardFan';
import { TopBar } from './TopBar';
import { Link, Navigate } from 'react-router-dom';

/** Contract arena pre-game: confirm set, start game, or redirect to active game. */
export function ContractArenaPage() {
  const { isConnected, hasActiveGame, startGame, refreshGameState } = useContractStore();
  const { init, engine, setMetas, loadSetPreviews, setPreviewCards } = useGameStore();
  const { selectedSetId } = useSettingsStore();

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    if (engine && setMetas.length > 0) loadSetPreviews();
  }, [engine, setMetas, loadSetPreviews]);

  useEffect(() => {
    if (isConnected) void refreshGameState();
  }, [isConnected, refreshGameState]);

  if (!isConnected) {
    return <Navigate to="/contract" replace />;
  }

  if (hasActiveGame) {
    return <Navigate to="/contract/arena/game" replace />;
  }

  const setMeta = setMetas.find((m) => m.id === selectedSetId);
  const cards = selectedSetId !== null ? setPreviewCards[selectedSetId] : undefined;

  return (
    <div className="app-shell min-h-screen min-h-svh flex flex-col text-white">
      <TopBar backTo="/contract" backLabel="Contract" title="Contract Arena" />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          {selectedSetId === null || !setMeta ? (
            <>
              <p className="text-base-400 text-sm mb-4">No set selected.</p>
              <Link
                to="/sets"
                className="theme-button btn-primary inline-block font-bold py-3 px-8 rounded-xl text-sm transition-all"
              >
                Choose a Set
              </Link>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <h2 className="text-xl lg:text-2xl font-heading font-bold text-white">
                {setMeta.name}
              </h2>
              <p className="text-base-500 text-xs lg:text-sm">{cards?.length ?? '?'} cards</p>
              <div className="set-tile">
                {cards && cards.length > 0 ? (
                  <CardFan cards={cards} />
                ) : (
                  <div className="set-card-fan flex items-center justify-center">
                    <span className="text-base-600 text-sm">...</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 mt-6 w-full">
                <button
                  onClick={() => void startGame(selectedSetId)}
                  className="theme-button btn-primary w-full font-black py-3 lg:py-4 rounded-xl text-sm lg:text-base transition-all transform hover:scale-105 disabled:opacity-50 uppercase tracking-wider"
                >
                  Start Game
                </button>
                <Link
                  to="/sets"
                  className="text-base-400 hover:text-base-200 text-sm transition-colors"
                >
                  Change Set
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
