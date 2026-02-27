import { DndContext, DragOverlay } from '@dnd-kit/core';
import { HUD } from './HUD';
import { Arena } from './Arena';
import { ManaBar } from './ManaBar';
import { Shop } from './Shop';
import {
  CardDetailPanel,
  type BlockchainAccount,
  type CardDetailPanelMode,
} from './CardDetailPanel';
import { BattleOverlay } from './BattleOverlay';
import { BagOverlay } from './BagOverlay';
import { UnitCard } from './UnitCard';
import { RotatePrompt } from './RotatePrompt';
import { useGameStore } from '../store/gameStore';
import { useDragAndDrop } from '../hooks';

// Re-export for convenience
export type { BlockchainAccount };

export interface CustomActionConfig {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'chain';
}

export interface GameShellProps {
  // HUD customization
  hideEndTurn?: boolean;
  customAction?: CustomActionConfig;
  // CardDetailPanel customization
  cardPanelTopOffset?: string;
  blockchainMode?: boolean;
  blockNumber?: number | null;
  accounts?: BlockchainAccount[];
  selectedAccount?: BlockchainAccount;
  onSelectAccount?: (account: BlockchainAccount | undefined) => void;
  // Layout customization
  className?: string;
}

export function GameShell({
  hideEndTurn = false,
  customAction,
  cardPanelTopOffset = '4rem',
  blockchainMode = false,
  blockNumber,
  accounts = [],
  selectedAccount,
  onSelectAccount,
  className = '',
}: GameShellProps) {
  const { view, bag, cardSet, selection, showBag } = useGameStore();

  const {
    activeId,
    sensors,
    restrictToContainer,
    containerRef,
    handleDragStart,
    handleDragEnd,
    getActiveCard,
  } = useDragAndDrop();

  // Card panel is visible during shop phase or when a board unit is selected
  const showCardPanel = view?.phase === 'shop' || selection?.type === 'board' || showBag;

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
  const cardPanelMode: CardDetailPanelMode = blockchainMode
    ? {
        type: 'blockchain',
        blockNumber: blockNumber ?? null,
        accounts,
        selectedAccount,
        onSelectAccount,
      }
    : { type: 'standard' };

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
        {/* Zone 1: Top HUD */}
        <HUD hideEndTurn={hideEndTurn} customAction={customAction} />

        {/* Zone 2: Arena (Board) with left panel */}
        <div
          className={`game-main flex-1 flex flex-col overflow-hidden min-h-0 ${contentMargin} ${showCardPanel ? 'show-card-panel' : ''}`}
        >
          <Arena />
        </div>

        {/* Zone 3: Mana Bar (gateway between board and hand) */}
        <div className={`flex-shrink-0 ${contentMargin} ${showCardPanel ? 'show-card-panel' : ''}`}>
          <ManaBar />
        </div>

        {/* Zone 4: Command Deck (Shop) */}
        <div
          className={`game-shop flex-shrink-0 mt-auto ${contentMargin} ${showCardPanel ? 'show-card-panel' : ''}`}
        >
          <Shop />
        </div>

        {/* Card Detail Panel */}
        <CardDetailPanel
          card={cardToShow}
          isVisible={showCardPanel}
          topOffset={cardPanelTopOffset}
          mode={cardPanelMode}
        />

        {/* Battle Overlay */}
        <BattleOverlay />
        <BagOverlay />

        <RotatePrompt />
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeCard ? (
          <UnitCard card={activeCard} showCost={activeId?.startsWith('hand')} showPitch={true} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
