import { useGameStore } from '../store/gameStore';
import { useInitGuard } from '../hooks';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';

export function GameLayout() {
  const { view, isLoading, error } = useGameStore();
  const init = useGameStore((state) => state.init);

  // Initialize game engine - both local and multiplayer modes need this
  useInitGuard(() => {
    void init();
  }, [init]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading WASM...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-gray-400">Initializing game...</div>
      </div>
    );
  }

  // Show game over screen
  if (view.phase === 'victory' || view.phase === 'defeat') {
    return <GameOverScreen />;
  }

  return <GameShell />;
}
