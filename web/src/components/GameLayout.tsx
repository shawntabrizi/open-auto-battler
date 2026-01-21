import { HUD } from './HUD';
import { Arena } from './Arena';
import { Bench } from './Bench';
import { Shop } from './Shop';
import { BattleOverlay } from './BattleOverlay';
import { GameOverScreen } from './GameOverScreen';
import { useGameStore } from '../store/gameStore';

export function GameLayout() {
  const { view, isLoading, error } = useGameStore();

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

  return (
    <div className="h-full flex flex-col bg-board-bg">
      {/* Zone 1: Top HUD */}
      <HUD />

      {/* Zone 2: Arena (Board + Bench) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Arena />
        <Bench />
      </div>

      {/* Zone 3: Command Deck (Shop) */}
      <Shop />

      {/* Battle Overlay */}
      <BattleOverlay />
    </div>
  );
}
