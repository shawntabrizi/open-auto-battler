import { useEffect, useRef, useState } from 'react';
import { useSandboxStore } from '../store/sandboxStore';
import { UnitCard, EmptySlot } from './UnitCard';
import { BattleArena } from './BattleArena';
import { CardDetailPanel } from './CardDetailPanel';
import type { UnitTemplateView } from '../types';

export function SandboxPage() {
  const init = useSandboxStore((state) => state.init);
  const initCalled = useRef(false);
  const selectedTemplate = useSandboxStore((state) => state.selectedTemplate);

  useEffect(() => {
    if (initCalled.current) return;
    initCalled.current = true;
    init();
  }, [init]);

  const isLoading = useSandboxStore((state) => state.isLoading);

  // Convert selectedTemplate to CardView format for CardDetailPanel
  const selectedCard = selectedTemplate ? {
    id: 0,
    templateId: selectedTemplate.templateId,
    name: selectedTemplate.name,
    attack: selectedTemplate.attack,
    health: selectedTemplate.health,
    playCost: selectedTemplate.playCost,
    pitchValue: selectedTemplate.pitchValue,
    abilities: selectedTemplate.abilities,
  } : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-board-bg flex items-center justify-center">
        <div className="text-2xl text-gray-400">Loading Sandbox...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-board-bg flex flex-col overflow-hidden">
      {/* Header */}
      <SandboxHeader />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Center - Battle arena and gallery */}
        <div className="flex-1 flex flex-col min-h-0 ml-80">
          {/* Battle Arena */}
          <div className="flex-shrink-0 p-3 border-b border-gray-700">
            <SandboxArena />
          </div>

          {/* Unit Gallery - scrolls independently */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-shop-bg">
            <UnitGallery />
          </div>
        </div>
      </div>

      {/* Card Detail Panel - Always visible in sandbox */}
      <CardDetailPanel card={selectedCard} isVisible={true} isSandbox={true} />

      {/* Battle Overlay */}
      <BattleOverlay />
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

  const hasUnits =
    playerBoard.some((u) => u !== null) || enemyBoard.some((u) => u !== null);

  return (
    <div className="flex-shrink-0 bg-gray-900 border-b border-gray-700 px-3 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <a href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
          &larr; Back
        </a>
        <h1 className="text-lg font-bold text-gold">Sandbox</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
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
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm transition-colors"
        >
          Clear
        </button>

        <button
          onClick={runBattle}
          disabled={!hasUnits}
          className={`px-4 py-1 rounded font-bold text-sm transition-colors ${
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
    unit: UnitTemplateView | null,
    index: number,
    team: 'player' | 'enemy',
    onClick: () => void
  ) => {
    // Player: slots 4,3,2,1,0 display as 5,4,3,2,1 (back to front)
    // Enemy: slots 0,1,2,3,4 display as 1,2,3,4,5 (front to back)
    const displayIndex = index + 1;

    if (unit) {
      return (
        <div key={`${team}-${index}`} className="relative group cursor-pointer" onClick={onClick}>
          <UnitCard
            card={{
              id: 0,
              templateId: unit.templateId,
              name: unit.name,
              attack: unit.attack,
              health: unit.health,
              playCost: unit.playCost,
              pitchValue: unit.pitchValue,
              abilities: unit.abilities,
            }}
            showCost={false}
            showPitch={false}
          />
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
            {displayIndex}
          </div>
          <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/20 rounded-lg transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
            <span className="text-red-400 text-2xl">×</span>
          </div>
        </div>
      );
    }

    return (
      <div key={`${team}-${index}`} className="relative">
        <EmptySlot
          onClick={onClick}
          label={`${displayIndex}`}
          isTarget={selectedTemplate !== null}
        />
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-center gap-6">
        {/* Player side (left) - display 5 4 3 2 1 */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs text-blue-400 font-bold">PLAYER</div>
          <div className="flex gap-1">
            {[4, 3, 2, 1, 0].map((i) =>
              renderSlot(playerBoard[i], i, 'player', () => handlePlayerSlotClick(i))
            )}
          </div>
        </div>

        <div className="text-2xl font-bold text-gray-500">VS</div>

        {/* Enemy side (right) - display 1 2 3 4 5 */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs text-red-400 font-bold">ENEMY</div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) =>
              renderSlot(enemyBoard[i], i, 'enemy', () => handleEnemySlotClick(i))
            )}
          </div>
        </div>
      </div>

      {selectedTemplate && (
        <div className="mt-2 text-center text-xs text-gray-400">
          Placing: <span className="text-yellow-400">{selectedTemplate.name}</span>
        </div>
      )}
    </div>
  );
}

function UnitGallery() {
  const templates = useSandboxStore((state) => state.templates);
  const selectedTemplate = useSandboxStore((state) => state.selectedTemplate);
  const selectTemplate = useSandboxStore((state) => state.selectTemplate);
  const searchQuery = useSandboxStore((state) => state.searchQuery);
  const setSearchQuery = useSandboxStore((state) => state.setSearchQuery);

  // Sort templates by cost
  const sortedTemplates = [...templates].sort((a, b) => a.playCost - b.playCost);

  // Filter templates based on search query (search in full JSON)
  const filteredTemplates = sortedTemplates.filter((template) => {
    if (!searchQuery) return true;
    const templateJson = JSON.stringify(template).toLowerCase();
    return templateJson.includes(searchQuery.toLowerCase());
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-bold text-gray-400">
          Select a unit, then click a slot above to place it
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {filteredTemplates.map((template) => (
          <UnitCard
            key={template.templateId}
            card={{
              id: 0,
              templateId: template.templateId,
              name: template.name,
              attack: template.attack,
              health: template.health,
              playCost: template.playCost,
              pitchValue: template.pitchValue,
              abilities: template.abilities,
            }}
            isSelected={selectedTemplate?.templateId === template.templateId}
            onClick={() =>
              selectTemplate(
                selectedTemplate?.templateId === template.templateId ? null : template
              )
            }
          />
        ))}
      </div>
    </div>
  );
}



function BattleOverlay() {
  const isBattling = useSandboxStore((state) => state.isBattling);
  const battleOutput = useSandboxStore((state) => state.battleOutput);
  const closeBattle = useSandboxStore((state) => state.closeBattle);
  const [battleEnded, setBattleEnded] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (isBattling) {
      setBattleEnded(false);
      setResult(null);
    }
  }, [isBattling]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isBattling) {
        closeBattle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBattling, closeBattle]);

  if (!isBattling || !battleOutput) return null;

  const handleBattleEnd = () => {
    const lastEvent = battleOutput.events[battleOutput.events.length - 1];
    if (lastEvent?.type === 'battleEnd') {
      setResult(lastEvent.payload.result);
    }
    setBattleEnded(true);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 max-w-5xl w-full mx-4 relative">
        {/* Close button - always visible */}
        <button
          onClick={closeBattle}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Close (Esc)"
        >
          ×
        </button>

        <BattleArena battleOutput={battleOutput} onBattleEnd={handleBattleEnd} />

        {battleEnded && (
          <div className="mt-6 text-center space-y-4">
            <div
              className={`text-4xl font-bold ${
                result === 'VICTORY'
                  ? 'text-green-400'
                  : result === 'DEFEAT'
                    ? 'text-red-400'
                    : 'text-yellow-400'
              }`}
            >
              {result}
            </div>
            <button
              onClick={closeBattle}
              className="px-8 py-3 bg-gold text-black font-bold rounded hover:bg-yellow-400 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
