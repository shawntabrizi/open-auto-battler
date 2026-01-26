import { HUD } from './HUD';
import { Arena } from './Arena';
import { Shop } from './Shop';
import { CardDetailPanel } from './CardDetailPanel';
import { BattleOverlay } from './BattleOverlay';
import { GameOverScreen } from './GameOverScreen';
import { useGameStore } from '../store/gameStore';

export function GameLayout() {
  const { view, selection, isLoading, error } = useGameStore();

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

  // Card panel is visible during shop phase or when a board unit is selected
  const showCardPanel = view?.phase === 'shop' || (selection?.type === 'board');
  const selectedCard =
    view?.phase === 'shop' && selection?.type === 'hand' && view?.hand[selection!.index]
      ? view.hand[selection!.index]!
      : null;

  // For board selections, create a card-like object from the unit data
  const selectedBoardUnit = selection?.type === 'board' && view?.board[selection!.index]
    ? view.board[selection!.index]!
    : null;

  const cardToShow = selectedCard || selectedBoardUnit;

  return (
    <div className="h-full flex flex-col bg-board-bg">
      {/* Zone 1: Top HUD */}
      <HUD />

      {/* Zone 2: Arena (Board) with left panel */}
      <div className={`flex-1 flex flex-col overflow-hidden ${showCardPanel ? 'ml-80' : ''}`}>
        <Arena />
      </div>

      {/* Zone 3: Command Deck (Shop) */}
      <div className={showCardPanel ? 'ml-80' : ''}>
        <Shop />
      </div>

      {/* Card Detail Panel - Visible during shop or board selection */}
      <CardDetailPanel card={cardToShow} isVisible={showCardPanel} />

      {/* Battle Overlay */}
      <BattleOverlay />
    </div>
  );
}
