import { useGameStore } from '../store/gameStore';
import { useInitGuard } from '../hooks';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { Navigate } from 'react-router-dom';

export function GameLayout() {
  const { view, isLoading, error, engineReady, gameStarted } = useGameStore();
  const initEngine = useGameStore((state) => state.initEngine);

  useInitGuard(() => {
    void initEngine();
  }, [initEngine]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-base-600 border-t-amber-400 rounded-full animate-spin mb-3" />
          <div className="text-sm text-base-400 animate-pulse">Loading game engine...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-lg text-defeat">Something went wrong</div>
          <div className="text-xs text-base-500 max-w-xs">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 text-sm font-bold text-base-300 border border-base-600 rounded-lg hover:bg-base-800 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  // Engine ready but game not started — redirect to set selection
  if (engineReady && !gameStarted) {
    return <Navigate to="/sets" replace />;
  }

  if (!view) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-base-400">Initializing game...</div>
      </div>
    );
  }

  if (view.phase === 'completed') {
    return <GameOverScreen />;
  }

  return <GameShell />;
}
