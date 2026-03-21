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
          <div className="inline-block w-8 h-8 border-2 border-warm-600 border-t-amber-400 rounded-full animate-spin mb-3" />
          <div className="text-sm text-warm-400 animate-pulse">Loading game engine...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-lg text-defeat-red">Something went wrong</div>
          <div className="text-xs text-warm-500 max-w-xs">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 text-sm font-bold text-warm-300 border border-warm-600 rounded-lg hover:bg-warm-800 transition-colors"
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
        <div className="text-xl text-warm-400">Initializing game...</div>
      </div>
    );
  }

  if (view.phase === 'completed') {
    return <GameOverScreen />;
  }

  return <GameShell />;
}
