import { useGameStore } from '../store/gameStore';
import { useInitGuard } from '../hooks';
import { GameOverScreen } from './GameOverScreen';
import { GameShell } from './GameShell';
import { SetSelectionScreen } from './SetSelectionScreen';
import { SetPreviewOverlay } from './SetPreviewOverlay';

export function GameLayout() {
  const { view, isLoading, error, engineReady, gameStarted } = useGameStore();
  const initEngine = useGameStore((state) => state.initEngine);

  // Phase 1: Load WASM engine (no game started yet)
  useInitGuard(() => {
    void initEngine();
  }, [initEngine]);

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

  // Engine ready but game not started — show set selection
  if (engineReady && !gameStarted) {
    return (
      <>
        <SetSelectionScreen />
        <SetPreviewOverlay />
      </>
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

  return (
    <>
      <GameShell />
      <SetPreviewOverlay />
    </>
  );
}
