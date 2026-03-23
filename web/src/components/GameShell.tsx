import { DndContext, DragOverlay } from '@dnd-kit/core';
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

export function GameShell({
  hideEndTurn = false,
  customAction,
  className = '',
}: GameShellProps) {
  const { view, bag, cardSet, selection, showBag, showGameCardDetailsPanel } = useGameStore();
  const isNarrowScreen = useIsNarrowScreen();

  const {
    activeId,
    sensors,
    restrictToContainer,
    containerRef,
    handleDragStart,
    handleDragEnd,
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
      modifiers={[restrictToContainer]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
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
        <CardDetailPanel card={cardToShow} isVisible={showCardPanel} />

        {/* Battle Overlay */}
        <BattleOverlay />
        <BagOverlay />
        <KeyboardShortcutsOverlay />

        <RotatePrompt />
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeCard ? (
          <div className={CARD_SIZES.standard.tw}>
            <UnitCard card={activeCard} showCost={activeId?.startsWith('hand')} showBurn={true} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
