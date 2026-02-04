import { DndContext, DragEndEvent, TouchSensor, MouseSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useState, useEffect } from 'react';
import { HUD } from './HUD';
import { Arena } from './Arena';
import { Shop } from './Shop';
import { CardDetailPanel } from './CardDetailPanel';
import { BattleOverlay } from './BattleOverlay';
import { BagOverlay } from './BagOverlay';
import { GameOverScreen } from './GameOverScreen';
import { UnitCard } from './UnitCard';
import { useGameStore } from '../store/gameStore';

export function GameLayout() {
  const { view, bag, cardSet, selection, isLoading, error, showBag, playHandCard, swapBoardPositions, pitchHandCard, pitchBoardUnit, setSelection } = useGameStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Configure sensors for both mouse and touch
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5, // 5px movement before drag starts
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100, // 100ms hold before drag starts
      tolerance: 5, // 5px movement tolerance during delay
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Handle drag end - dispatch actions based on source and destination
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || !overData) return;

    const sourceType = activeData.type as string;
    const sourceIndex = activeData.index as number;
    const destType = overData.type as string;

    // Handle dropping on ash pile
    if (destType === 'ash-pile') {
      if (sourceType === 'hand') {
        pitchHandCard(sourceIndex);
      } else if (sourceType === 'board') {
        pitchBoardUnit(sourceIndex);
      }
      setSelection(null);
      return;
    }

    // Handle dropping on board slot
    if (destType === 'board-slot') {
      const destIndex = overData.index as number;

      if (sourceType === 'hand') {
        // Play card from hand to board
        playHandCard(sourceIndex, destIndex);
      } else if (sourceType === 'board' && sourceIndex !== destIndex) {
        // Swap board positions
        swapBoardPositions(sourceIndex, destIndex);
      }
      setSelection(null);
    }
  };

  const handleDragStart = (event: { active: { id: string | number } }) => {
    setActiveId(String(event.active.id));
    // Set selection based on what's being dragged
    const [type, indexStr] = String(event.active.id).split('-');
    const index = parseInt(indexStr);
    if (type === 'hand' || type === 'board') {
      setSelection({ type: type as 'hand' | 'board', index });
    }
  };

  // Prevent body scroll during drag
  useEffect(() => {
    if (activeId) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [activeId]);

  // Get the card being dragged for the overlay
  const getActiveCard = () => {
    if (!activeId || !view) return null;
    const [type, indexStr] = activeId.split('-');
    const index = parseInt(indexStr);
    if (type === 'hand') {
      return view.hand[index];
    } else if (type === 'board') {
      return view.board[index];
    }
    return null;
  };

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
  const showCardPanel = view?.phase === 'shop' || selection?.type === 'board' || showBag;
  const selectedCard =
    view?.phase === 'shop' && selection?.type === 'hand' && view?.hand[selection!.index]
      ? view.hand[selection!.index]!
      : selection?.type === 'bag' && bag?.[selection!.index]
        ? cardSet?.find((c: any) => c.id === bag[selection!.index]) || null
        : null;

  // For board selections, create a card-like object from the unit data
  const selectedBoardUnit =
    selection?.type === 'board' && view?.board[selection!.index]
      ? view.board[selection!.index]!
      : null;

  const cardToShow = selectedCard || selectedBoardUnit;

  const activeCard = getActiveCard();

  return (
    <DndContext sensors={sensors} modifiers={[restrictToWindowEdges]} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="game-layout h-screen flex flex-col bg-board-bg">
        {/* Zone 1: Top HUD */}
        <HUD />

        {/* Zone 2: Arena (Board) with left panel */}
        <div
          className={`game-main flex-1 flex flex-col overflow-hidden min-h-0 ${showCardPanel ? 'ml-80 show-card-panel' : ''}`}
        >
          <Arena />
        </div>

        {/* Zone 3: Command Deck (Shop) */}
        <div className={`game-shop flex-shrink-0 mt-auto ${showCardPanel ? 'ml-80 show-card-panel' : ''}`}>
          <Shop />
        </div>

        {/* Card Detail Panel - Visible during shop or board selection */}
        <CardDetailPanel card={cardToShow} isVisible={showCardPanel} />

        {/* Battle Overlay */}
        <BattleOverlay />
        <BagOverlay />

        <div className="rotate-prompt hidden" aria-hidden="true">
          <div className="rotate-prompt__card">
            <div className="rotate-prompt__icon">⟳</div>
            <div className="rotate-prompt__title">Rotate your device</div>
            <div className="rotate-prompt__subtitle">This game plays best in landscape mode.</div>
          </div>
        </div>
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeCard ? (
          <UnitCard
            card={activeCard}
            showCost={activeId?.startsWith('hand')}
            showPitch={true}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
