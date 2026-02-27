import { HUD, BattleAction } from './HUD';
import { Arena } from './Arena';
import { ManaBar } from './ManaBar';
import { Shop } from './Shop';
import { CardDetailPanel, type BlockchainAccount } from './CardDetailPanel';
import { BattleOverlay } from './BattleOverlay';
import { BagOverlay } from './BagOverlay';
import { RotatePrompt } from './RotatePrompt';
import { useGameStore } from '../store/gameStore';
import { DragProvider, useDragContext } from '../hooks/useDragAndDrop';

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

export function GameShell(props: GameShellProps) {
  return (
    <DragProvider>
      <GameShellInner {...props} />
    </DragProvider>
  );
}

function GameShellInner({
  hideEndTurn = false,
  customAction,
  cardPanelTopOffset = 'calc(4rem - 1px)',
  blockchainMode = false,
  blockNumber,
  accounts = [],
  selectedAccount,
  onSelectAccount,
  className = '',
}: GameShellProps) {
  const { view, bag, cardSet, selection, showBag, mobileTab } = useGameStore();
  const { containerRef } = useDragContext();

  // Desktop: panel visible during shop phase (always) or board selection or bag
  const showCardPanel = view?.phase === 'shop' || selection?.type === 'board' || showBag;
  // Mobile: panel only visible when something is actively selected
  const hasSelection = selection !== null || showBag;

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

  // Mobile tab visibility (only matters during shop phase, below lg breakpoint)
  const isShopPhase = view?.phase === 'shop';
  const mHand = isShopPhase && mobileTab === 'hand';
  const mBoard = isShopPhase && mobileTab === 'board';

  // Mobile margin: only when something is selected AND not on hand or board tab (both have no sidebar now);
  // desktop margin during shop phase
  const mobileNoSidebar = mHand || mBoard;
  const contentMargin = `${hasSelection && !mobileNoSidebar ? 'ml-44' : ''} ${showCardPanel ? 'lg:ml-80' : ''}`;

  return (
    <div
      ref={containerRef}
      className={`game-layout h-screen flex flex-col bg-board-bg ${className}`}
    >
      {/* Zone 1: Top HUD */}
      <HUD />

      {/* Zone 2: Arena (Board) — hidden on mobile when hand tab is active */}
      <div
        className={`game-main flex-1 flex ${mBoard ? 'flex-row' : 'flex-col'} lg:flex-col overflow-hidden min-h-0 ${contentMargin} ${mHand ? 'hidden lg:flex' : ''}`}
      >
        {/* Desktop BattleAction above arena — hidden on mobile board tab */}
        <div className={mBoard ? 'hidden lg:block' : ''}>
          <BattleAction hideEndTurn={hideEndTurn} customAction={customAction} />
        </div>
        <Arena />
        {/* Mobile board tab: battle button as right column */}
        {mBoard && (
          <div className="lg:hidden flex-shrink-0 w-20 border-l border-warm-800/60">
            <BattleAction hideEndTurn={hideEndTurn} customAction={customAction} compact />
          </div>
        )}
      </div>

      {/* Zone 3: Mana Bar — hidden on mobile (mana shown in HUD), visible on desktop */}
      <div className={`flex-shrink-0 hidden lg:block ${contentMargin}`}>
        <ManaBar />
      </div>

      {/* Zone 4: Shop (Hand) — hidden on mobile when board tab is active, expands on hand tab */}
      <div
        className={`game-shop ${mHand ? 'flex-1 min-h-0' : 'flex-shrink-0'} lg:flex-none ${contentMargin} ${mBoard ? 'hidden lg:block' : ''}`}
      >
        <Shop expandMobile={mHand} />
      </div>

      {/* Card Detail Panel — hidden on mobile during shop phase (both tabs), shown for board selections outside shop */}
      <div className={mobileNoSidebar || (showCardPanel && !hasSelection) ? 'hidden lg:block' : ''}>
        <CardDetailPanel
          card={cardToShow}
          isVisible={showCardPanel || hasSelection}
          topOffset={cardPanelTopOffset}
          blockchainMode={blockchainMode}
          blockNumber={blockNumber}
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={onSelectAccount}
        />
      </div>

      {/* Battle Overlay */}
      <BattleOverlay />
      <BagOverlay />

      <RotatePrompt />
    </div>
  );
}
