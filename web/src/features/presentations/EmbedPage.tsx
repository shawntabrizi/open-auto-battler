import { useSearchParams } from 'react-router-dom';
import { Arena } from '../../components/Arena';
import { ManaBar } from '../../components/ManaBar';
import { Shop } from '../../components/Shop';
import { BattleOverlay } from '../../components/BattleOverlay';
import { useGameStore } from '../../store/gameStore';
import { useInitGuard } from '../../hooks';
import { DragProvider, useDragContext } from '../../hooks/useDragAndDrop';

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
    void init(seed);
  }, [init]);

  if (isLoading || !view) {
    return (
      <div className="h-screen flex items-center justify-center bg-board-bg">
        <div className="text-xl text-warm-400">Loading...</div>
      </div>
    );
  }

  return (
    <DragProvider>
      <EmbedPageInner />
    </DragProvider>
  );
}

function EmbedPageInner() {
  const { containerRef } = useDragContext();

  return (
    <div ref={containerRef} className="game-layout h-screen flex flex-col bg-board-bg">
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
  );
}
