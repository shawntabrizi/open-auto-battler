import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useSearchParams } from 'react-router-dom';
import { Arena } from '../../components/Arena';
import { ManaBar } from '../../components/ManaBar';
import { Shop } from '../../components/Shop';
import { BattleOverlay } from '../../components/BattleOverlay';
import { UnitCard } from '../../components/UnitCard';
import { useGameStore } from '../../store/gameStore';
import { useInitGuard, useDragAndDrop } from '../../hooks';

/**
 * Minimal game page designed to be embedded in an iframe.
 * Only renders Arena, ManaBar, Shop, and drag-and-drop — no HUD,
 * no CardDetailPanel, no RotatePrompt, no BagOverlay.
 *
 * Supports ?seed=<number> query param for deterministic hands.
 */
export default function EmbedPage() {
  const [searchParams] = useSearchParams();
  const { view, isLoading } = useGameStore();
  const init = useGameStore((s) => s.init);

  useInitGuard(() => {
    const seedParam = searchParams.get('seed');
    const seed = seedParam ? BigInt(seedParam) : undefined;
    init(seed);
  }, [init]);

  const {
    activeId,
    sensors,
    restrictToContainer,
    containerRef,
    handleDragStart,
    handleDragEnd,
    getActiveCard,
  } = useDragAndDrop();

  if (isLoading || !view) {
    return (
      <div className="h-screen flex items-center justify-center bg-board-bg">
        <div className="text-xl text-gray-400">Loading...</div>
      </div>
    );
  }

  const activeCard = getActiveCard();

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
        className="game-layout h-screen flex flex-col bg-board-bg"
      >
        {/* Board */}
        <div className="game-main flex-1 flex flex-col overflow-hidden min-h-0">
          <Arena />
        </div>

        {/* Mana Bar */}
        <div className="flex-shrink-0">
          <ManaBar />
        </div>

        {/* Hand */}
        <div className="game-shop flex-shrink-0 mt-auto">
          <Shop />
        </div>

        <BattleOverlay />
      </div>

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
