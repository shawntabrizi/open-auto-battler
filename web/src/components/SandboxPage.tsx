import { Link } from 'react-router-dom';
import { useSandboxStore } from '../store/sandboxStore';
import { UnitCard, EmptySlot } from './UnitCard';
import { CardDetailPanel } from './CardDetailPanel';
import { BattleOverlay } from './BattleOverlay';
import { RotatePrompt } from './RotatePrompt';
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
      <div className="min-h-screen bg-board-bg flex items-center justify-center">
        <div className="text-2xl text-gray-400">Loading Sandbox...</div>
      </div>
    );
  }

  return (
    <div className="h-screen h-svh bg-board-bg flex flex-col overflow-hidden">
      {/* Header */}
      <SandboxHeader />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Center - Battle arena and gallery */}
        <div className="flex-1 flex flex-col min-h-0 ml-44 lg:ml-80">
          {/* Battle Arena */}
          <div className="flex-shrink-0 p-2 lg:p-3 border-b border-gray-700">
            <SandboxArena />
          </div>

          {/* Search Bar - fixed between arena and gallery */}
          <div className="flex-shrink-0 px-2 lg:px-3 py-1.5 lg:py-2 bg-shop-bg border-b border-gray-700">
            <SearchBar />
          </div>

          {/* Unit Gallery - scrolls independently */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 lg:p-3 bg-shop-bg">
            <UnitGallery />
          </div>
        </div>
      </div>

      {/* Card Detail Panel - Always visible in sandbox */}
      <CardDetailPanel card={selectedCard} isVisible={true} mode={{ type: 'sandbox' }} />

      {/* Battle Overlay - Sandbox Mode */}
      <BattleOverlay mode="sandbox" />

      <RotatePrompt />
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
    <div className="flex-shrink-0 bg-gray-900 border-b border-gray-700 px-2 lg:px-3 py-1.5 lg:py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 lg:gap-3">
        <Link
          to="/"
          className="text-gray-400 hover:text-white transition-colors text-xs lg:text-sm flex items-center gap-1"
        >
          <span>&larr;</span> <span className="hidden lg:inline">Back</span>
        </Link>
        <h1 className="text-sm lg:text-lg font-bold text-gold">Sandbox</h1>
      </div>

      <div className="flex items-center gap-1.5 lg:gap-3">
        <div className="hidden lg:flex items-center gap-1">
          <label className="text-gray-400 text-xs">Seed:</label>
          <input
            type="number"
            value={battleSeed}
            onChange={(e) => setBattleSeed(parseInt(e.target.value) || 0)}
            className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-xs"
          />
        </div>

        <button
          onClick={clearAllBoards}
          className="px-2 lg:px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white text-xs lg:text-sm transition-colors"
        >
          Clear
        </button>

        <button
          onClick={runBattle}
          disabled={!hasUnits}
          className={`px-3 lg:px-4 py-1 rounded font-bold text-xs lg:text-sm transition-colors ${
            hasUnits
              ? 'bg-gold text-black hover:bg-yellow-400'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          Battle!
        </button>
      </div>
    </div>
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
    // Player: slots 4,3,2,1,0 display as 5,4,3,2,1 (back to front)
    // Enemy: slots 0,1,2,3,4 display as 1,2,3,4,5 (front to back)
    const displayIndex = index + 1;

    if (unit) {
      return (
        <div
          key={`${team}-${index}`}
          className="relative group cursor-pointer sandbox-slot"
          onClick={onClick}
        >
          <UnitCard card={unit} showCost={false} showPitch={false} compact={true} />
          <div className="absolute -top-1.5 lg:-top-2 left-1/2 -translate-x-1/2 text-[8px] lg:text-xs text-gray-400 pointer-events-none">
            {displayIndex}
          </div>
          <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/20 rounded-lg transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
            <span className="text-red-400 text-lg lg:text-2xl">×</span>
          </div>
        </div>
      );
    }

    return (
      <div key={`${team}-${index}`} className="relative sandbox-slot">
        <EmptySlot
          onClick={onClick}
          label={`${displayIndex}`}
          isTarget={selectedTemplate !== null}
          compact={true}
        />
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-2 lg:p-4">
      <div className="flex items-center justify-center gap-2 lg:gap-6">
        {/* Player side (left) - display 5 4 3 2 1 */}
        <div className="flex flex-col items-center gap-0.5 lg:gap-1">
          <div className="text-[8px] lg:text-xs text-blue-400 font-bold">PLAYER</div>
          <div className="flex gap-0.5 lg:gap-1">
            {[4, 3, 2, 1, 0].map((i) =>
              renderSlot(playerBoard[i], i, 'player', () => handlePlayerSlotClick(i))
            )}
          </div>
        </div>

        <div className="text-sm lg:text-2xl font-bold text-gray-500">VS</div>

        {/* Enemy side (right) - display 1 2 3 4 5 */}
        <div className="flex flex-col items-center gap-0.5 lg:gap-1">
          <div className="text-[8px] lg:text-xs text-red-400 font-bold">ENEMY</div>
          <div className="flex gap-0.5 lg:gap-1">
            {[0, 1, 2, 3, 4].map((i) =>
              renderSlot(enemyBoard[i], i, 'enemy', () => handleEnemySlotClick(i))
            )}
          </div>
        </div>
      </div>

      {selectedTemplate && (
        <div className="mt-1.5 lg:mt-2 text-center text-[10px] lg:text-xs text-gray-400">
          Placing: <span className="text-yellow-400">{selectedTemplate.name}</span>
        </div>
      )}
    </div>
  );
}

function SearchBar() {
  const searchQuery = useSandboxStore((state) => state.searchQuery);
  const setSearchQuery = useSandboxStore((state) => state.setSearchQuery);

  return (
    <input
      type="text"
      placeholder="Search cards..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="w-full px-2 lg:px-3 py-1.5 lg:py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 text-xs lg:text-sm focus:outline-none focus:border-blue-500"
    />
  );
}

function UnitGallery() {
  const templates = useSandboxStore((state) => state.templates);
  const selectedTemplate = useSandboxStore((state) => state.selectedTemplate);
  const selectTemplate = useSandboxStore((state) => state.selectTemplate);
  const searchQuery = useSandboxStore((state) => state.searchQuery);

  // Sort templates by cost
  const sortedTemplates = [...templates].sort((a, b) => a.play_cost - b.play_cost);

  // Filter templates based on search query (search in full JSON)
  const filteredTemplates = sortedTemplates.filter((template) => {
    if (!searchQuery) return true;
    const templateJson = JSON.stringify(template).toLowerCase();
    return templateJson.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="sandbox-gallery grid grid-cols-8 lg:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1 lg:gap-2">
      {filteredTemplates.map((template) => (
        <UnitCard
          key={template.id}
          card={template}
          isSelected={selectedTemplate?.id === template.id}
          onClick={() => selectTemplate(selectedTemplate?.id === template.id ? null : template)}
          compact={true}
        />
      ))}
    </div>
  );
}
