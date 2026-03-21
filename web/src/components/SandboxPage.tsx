import { useSandboxStore } from '../store/sandboxStore';
import { UnitCard } from './UnitCard';
import { CardGallery } from './CardGallery';
import { CardDetailPanel } from './CardDetailPanel';
import { BattleOverlay } from './BattleOverlay';
import { TopBar } from './TopBar';
import { useInitGuard } from '../hooks';
import type { CardView } from '../types';

export function SandboxPage() {
  const init = useSandboxStore((state) => state.init);
  const selectedTemplate = useSandboxStore((state) => state.selectedTemplate);
  const isLoading = useSandboxStore((state) => state.isLoading);

  useInitGuard(() => {
    void init();
  }, [init]);

  // selectedTemplate is already a CardView from the store
  const selectedCard = selectedTemplate;

  if (isLoading) {
    return (
      <div className="app-shell min-h-screen flex items-center justify-center">
        <div className="text-2xl text-base-400">Loading Sandbox...</div>
      </div>
    );
  }

  return (
    <div className="app-shell h-screen h-svh flex flex-col overflow-hidden">
      {/* Header */}
      <SandboxHeader />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Center - Battle arena and gallery */}
        <div className="flex-1 flex flex-col min-h-0 ml-44 lg:ml-80 overflow-hidden">
          {/* Battle Arena */}
          <div className="flex-shrink-0 p-2 lg:p-3 border-b border-base-700">
            <SandboxArena />
          </div>

          {/* Unit Gallery with search/sort - scrolls independently */}
          <div className="flex-1 min-h-0 p-2 lg:p-3 bg-shop-bg">
            <SandboxGallery />
          </div>
        </div>
      </div>

      {/* Card Detail Panel - Always visible in sandbox */}
      <CardDetailPanel card={selectedCard} isVisible={true} mode={{ type: 'sandbox' }} />

      {/* Battle Overlay - Sandbox Mode */}
      <BattleOverlay mode="sandbox" />
    </div>
  );
}

function SandboxHeader() {
  const runBattle = useSandboxStore((state) => state.runBattle);
  const clearAllBoards = useSandboxStore((state) => state.clearAllBoards);
  const playerBoard = useSandboxStore((state) => state.playerBoard);
  const enemyBoard = useSandboxStore((state) => state.enemyBoard);
  const battleSeed = useSandboxStore((state) => state.battleSeed);
  const setBattleSeed = useSandboxStore((state) => state.setBattleSeed);

  const hasUnits = playerBoard.some((u) => u !== null) || enemyBoard.some((u) => u !== null);

  return (
    <>
      <TopBar backTo="/" backLabel="Menu" title="Card Sandbox" hasCardPanel />
      {/* Action bar below TopBar */}
      <div className="theme-panel flex-shrink-0 border-b border-base-700 px-3 lg:px-4 py-1.5 lg:py-2 ml-44 lg:ml-80 flex items-center justify-center gap-2 lg:gap-3">
        <button
          onClick={clearAllBoards}
          className="theme-button theme-surface-button px-2 lg:px-3 py-1 rounded text-white text-xs lg:text-sm transition-colors"
        >
          Clear
        </button>
        <button
          onClick={runBattle}
          disabled={!hasUnits}
          className={`theme-button px-4 lg:px-6 py-1 rounded-lg font-bold text-xs lg:text-sm transition-colors ${
            hasUnits ? 'btn-primary text-white' : 'bg-base-600 text-base-400 cursor-not-allowed'
          }`}
        >
          Battle!
        </button>
        <div className="flex items-center gap-1">
          <label className="text-base-400 text-xs">Seed:</label>
          <input
            type="number"
            value={battleSeed}
            onChange={(e) => setBattleSeed(parseInt(e.target.value) || 0)}
            className="theme-input w-16 px-2 py-1 bg-base-800 border border-base-600 rounded text-white text-xs"
          />
        </div>
      </div>
    </>
  );
}

function SandboxArena() {
  const playerBoard = useSandboxStore((state) => state.playerBoard);
  const enemyBoard = useSandboxStore((state) => state.enemyBoard);
  const selectedTemplate = useSandboxStore((state) => state.selectedTemplate);
  const addToPlayerBoard = useSandboxStore((state) => state.addToPlayerBoard);
  const addToEnemyBoard = useSandboxStore((state) => state.addToEnemyBoard);
  const removeFromPlayerBoard = useSandboxStore((state) => state.removeFromPlayerBoard);
  const removeFromEnemyBoard = useSandboxStore((state) => state.removeFromEnemyBoard);

  const handlePlayerSlotClick = (index: number) => {
    if (playerBoard[index]) {
      removeFromPlayerBoard(index);
    } else if (selectedTemplate) {
      addToPlayerBoard(index, selectedTemplate);
    }
  };

  const handleEnemySlotClick = (index: number) => {
    if (enemyBoard[index]) {
      removeFromEnemyBoard(index);
    } else if (selectedTemplate) {
      addToEnemyBoard(index, selectedTemplate);
    }
  };

  const renderSlot = (
    unit: CardView | null,
    index: number,
    team: 'player' | 'enemy',
    onClick: () => void
  ) => {
    const displayIndex = index + 1;

    return (
      <div
        key={`${team}-${index}`}
        className="relative group cursor-pointer aspect-[3/4] rounded-lg"
        onClick={onClick}
      >
        {unit ? (
          <>
            <UnitCard card={unit} showCost={false} showBurn={false} />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none z-20">
              <span
                className="text-defeat text-3xl lg:text-5xl font-black"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                ×
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-full border-2 border-dashed border-base-600/30 rounded-lg flex items-center justify-center hover:border-base-500/50 transition-colors">
            <span className="text-base-600 text-[0.6rem] lg:text-xs">{displayIndex}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="theme-panel bg-base-800 rounded-lg p-2 lg:p-4">
      <div className="flex items-center gap-1 lg:gap-2">
        {/* Player side (left) - display 5 4 3 2 1 */}
        <div className="flex-1 min-w-0 flex flex-col items-center gap-0.5">
          <div className="text-[7px] lg:text-xs text-mana font-bold">PLAYER</div>
          <div className="flex gap-0.5 lg:gap-1 w-full">
            {[4, 3, 2, 1, 0].map((i) => (
              <div key={`p-${i}`} className="flex-1 min-w-0">
                {renderSlot(playerBoard[i], i, 'player', () => handlePlayerSlotClick(i))}
              </div>
            ))}
          </div>
        </div>

        <div className="text-[0.6rem] lg:text-xl font-bold text-base-500 shrink-0">VS</div>

        {/* Enemy side (right) - display 1 2 3 4 5 */}
        <div className="flex-1 min-w-0 flex flex-col items-center gap-0.5">
          <div className="text-[7px] lg:text-xs text-defeat font-bold">ENEMY</div>
          <div className="flex gap-0.5 lg:gap-1 w-full">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={`e-${i}`} className="flex-1 min-w-0">
                {renderSlot(enemyBoard[i], i, 'enemy', () => handleEnemySlotClick(i))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedTemplate && (
        <div className="mt-1 lg:mt-2 text-center text-[9px] lg:text-xs text-base-400">
          Placing: <span className="text-accent">{selectedTemplate.name}</span>
        </div>
      )}
    </div>
  );
}

function SandboxGallery() {
  const templates = useSandboxStore((state) => state.templates);
  const selectedTemplate = useSandboxStore((state) => state.selectedTemplate);
  const selectTemplate = useSandboxStore((state) => state.selectTemplate);
  const searchQuery = useSandboxStore((state) => state.searchQuery);
  const setSearchQuery = useSandboxStore((state) => state.setSearchQuery);
  const sortBy = useSandboxStore((state) => state.sortBy);
  const setSortBy = useSandboxStore((state) => state.setSortBy);

  return (
    <CardGallery
      cards={templates}
      selectedId={selectedTemplate?.id}
      onSelect={(card) => selectTemplate(card as CardView | null)}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      sortBy={sortBy}
      onSortChange={setSortBy}
    />
  );
}
