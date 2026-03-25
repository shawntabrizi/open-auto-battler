import { DndContext, DragOverlay, pointerWithin, type CollisionDetection } from '@dnd-kit/core';
import { GameTopBar } from './GameTopBar';
import { Arena } from './Arena';
import { ManaBar } from './ManaBar';
import { Shop } from './Shop';
import { CardDetailPanel } from './CardDetailPanel';
import { BattleOverlay } from './BattleOverlay';
import { BagOverlay } from './BagOverlay';
import { UnitCard } from './UnitCard';
import { CARD_SIZES } from '../constants/cardSizes';
import { RotatePrompt } from './RotatePrompt';
import { GameKeyboardShortcuts } from './GameKeyboardShortcuts';
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay';
import { useGameStore } from '../store/gameStore';
import { useDragAndDrop } from '../hooks';
import { useIsNarrowScreen } from '../hooks/useIsNarrowScreen';

/**
 * Custom collision detection: precise for burn zone, gap-tolerant for board slots.
 *
 * Uses pointerWithin as the primary strategy (pointer must be inside the droppable).
 * When the pointer falls in a gap between board slots, falls back to finding the
 * nearest board-slot droppable within a small pixel tolerance.
 */
const GAP_TOLERANCE_PX = 24; // covers gap-4 (16px) + breathing room

const boardAwareCollision: CollisionDetection = (args) => {
  // Primary: precise pointer-inside-rect matching
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  // Fallback: find closest board-slot within gap tolerance
  const pointer = args.pointerCoordinates;
  if (!pointer) return [];

  let closestId: string | number | null = null;
  let closestDist = Infinity;

  for (const container of args.droppableContainers) {
    if (container.data?.current?.type !== 'board-slot') continue;
    const rect = args.droppableRects.get(container.id);
    if (!rect) continue;

    // Distance from pointer to nearest edge of the rect
    const dx = Math.max(rect.left - pointer.x, 0, pointer.x - (rect.left + rect.width));
    const dy = Math.max(rect.top - pointer.y, 0, pointer.y - (rect.top + rect.height));
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= GAP_TOLERANCE_PX && dist < closestDist) {
      closestDist = dist;
      closestId = container.id;
    }
  }

  return closestId != null ? [{ id: closestId }] : [];
};

export interface CustomActionConfig {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'chain';
}

export interface GameShellProps {
  hideEndTurn?: boolean;
  customAction?: CustomActionConfig;
  className?: string;
}

export function GameShell({ hideEndTurn = false, customAction, className = '' }: GameShellProps) {
  const { view, bag, cardSet, selection, showBag, showGameCardDetailsPanel, rarityMap, rarityTotalWeight } = useGameStore();
  const isNarrowScreen = useIsNarrowScreen();

  const {
    activeId,
    sensors,
    restrictToContainer,
    containerRef,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    getActiveCard,
  } = useDragAndDrop();

  // Resolve panel visibility from the 3-mode setting
  const panelEnabled =
    showGameCardDetailsPanel === 'always'
      ? true
      : showGameCardDetailsPanel === 'never'
        ? false
        : !isNarrowScreen; // 'auto': hide on narrow (portrait phone) screens

  const showCardPanel =
    panelEnabled && (view?.phase === 'shop' || selection?.type === 'board' || showBag);

  // Determine which card to show in the panel
  const selectedCard =
    view?.phase === 'shop' && selection?.type === 'hand' && view?.hand[selection.index]
      ? view.hand[selection.index]!
      : selection?.type === 'bag' && bag?.[selection.index]
        ? cardSet?.find((c) => c.id === bag[selection.index]) || null
        : null;

  // For board selections, show the unit data
  const selectedBoardUnit =
    selection?.type === 'board' && view?.board[selection.index]
      ? view.board[selection.index]!
      : null;

  const cardToShow = selectedCard || selectedBoardUnit;
  const activeCard = getActiveCard();

  // Margin class for the content area when card panel is visible
  const contentMargin = showCardPanel ? 'ml-44 lg:ml-80' : '';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardAwareCollision}
      modifiers={[restrictToContainer]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      autoScroll={false}
    >
      <div
        ref={containerRef}
        className={`game-layout h-screen flex flex-col bg-board-bg ${className}`}
      >
        <GameKeyboardShortcuts />

        {/* Zone 1: Top HUD */}
        <GameTopBar
          hideEndTurn={hideEndTurn}
          customAction={customAction}
          className={contentMargin}
        />

        {/* Zone 2-4: Main game area */}
        <main className="grid grid-rows-[minmax(0,3fr)_auto_minmax(0,2fr)] flex-1 min-h-0 outline-none">
          {/* Zone 2: Arena (Board) with left panel */}
          <div
            className={`game-main flex flex-col overflow-hidden min-h-0 ${contentMargin} ${showCardPanel ? 'show-card-panel' : ''}`}
          >
            <Arena />
          </div>

          {/* Zone 3: Mana Bar (gateway between board and hand) */}
          <div
            className={`flex-shrink-0 ${contentMargin} ${showCardPanel ? 'show-card-panel' : ''}`}
          >
            <ManaBar />
          </div>

          {/* Zone 4: Hand (Shop) */}
          <div
            className={`game-shop min-h-0 overflow-hidden ${contentMargin} ${showCardPanel ? 'show-card-panel' : ''}`}
          >
            <Shop />
          </div>
        </main>

        {/* Card Detail Panel */}
        <CardDetailPanel card={cardToShow} isVisible={showCardPanel} rarity={cardToShow ? rarityMap.get(cardToShow.id) : undefined} rarityTotalWeight={rarityTotalWeight} />

        {/* Battle Overlay */}
        <BattleOverlay />
        <BagOverlay />
        <KeyboardShortcutsOverlay />

        <RotatePrompt />
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className={CARD_SIZES.standard.tw}>
            <UnitCard card={activeCard} showCost={activeId?.startsWith('hand')} showBurn={true} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
