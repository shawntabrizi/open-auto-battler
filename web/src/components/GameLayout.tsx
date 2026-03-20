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
        <div className="text-xl text-warm-400">Loading WASM...</div>
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
