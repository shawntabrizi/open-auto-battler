import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSandboxStore } from '../store/sandboxStore';
import { BattleArena } from './BattleArena';

interface BattleOverlayProps {
  mode?: 'game' | 'sandbox';
}

export function BattleOverlay({ mode = 'game' }: BattleOverlayProps) {
  // Use hooks for both stores but decide which values to use based on mode
  const gameBattleOutput = useGameStore((state) => state.battleOutput);
  const gameShowOverlay = useGameStore((state) => state.showBattleOverlay);
  const gameContinue = useGameStore((state) => state.continueAfterBattle);
  const gameView = useGameStore((state) => state.view);

  const sandboxBattleOutput = useSandboxStore((state) => state.battleOutput);
  const sandboxShowOverlay = useSandboxStore((state) => state.isBattling);
  const sandboxClose = useSandboxStore((state) => state.closeBattle);
  const sandboxSeed = useSandboxStore((state) => state.battleSeed);

  // Derive active states based on mode
  const isSandbox = mode === 'sandbox';
  const battleOutput = isSandbox ? sandboxBattleOutput : gameBattleOutput;
  const showOverlay = isSandbox ? sandboxShowOverlay : gameShowOverlay;
  const onContinue = isSandbox ? sandboxClose : gameContinue;
  const title = isSandbox ? `Sandbox Battle (Seed: ${sandboxSeed})` : `Round ${gameView?.round} Battle`;

  const [battleFinished, setBattleFinished] = useState(false);

  useEffect(() => {
    if (showOverlay) {
      setBattleFinished(false);
    }
  }, [showOverlay]);

  // Escape key to close (especially useful in sandbox)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showOverlay && isSandbox) {
        onContinue();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOverlay, isSandbox, onContinue]);

  if (!showOverlay || !battleOutput) {
    return null;
  }

  const result = battleOutput.events[battleOutput.events.length - 1];
  let resultBgColor = 'bg-yellow-900/50 text-yellow-400';
  let resultText = '🤝 DRAW';

  if (result?.type === 'BattleEnd') {
    const res = result.payload.result;
    if (res === 'Victory') {
      resultBgColor = 'bg-green-900/50 text-green-400';
      resultText = '🏆 VICTORY!';
    } else if (res === 'Defeat') {
      resultBgColor = 'bg-red-900/50 text-red-400';
      resultText = '💀 DEFEAT';
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-gray-900 rounded-xl p-3 md:p-6 max-w-[98vw] md:max-w-[95vw] w-full border border-gray-700 overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh] relative shadow-2xl">
        {/* Close X button for sandbox mode */}
        {isSandbox && (
          <button
            onClick={onContinue}
            className="absolute top-2 right-2 md:top-4 md:right-4 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors z-10 text-sm md:text-base"
            title="Close (Esc)"
          >
            ×
          </button>
        )}

        <h2 className="text-lg md:text-2xl font-bold text-center mb-2 md:mb-4 flex-shrink-0 text-white">{title}</h2>

        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar pb-2 md:pb-4">
          <div className="min-w-max flex justify-center py-2 md:py-4 px-1 md:px-8">
            <BattleArena battleOutput={battleOutput} onBattleEnd={() => setBattleFinished(true)} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 md:gap-4 mt-2 md:mt-4 flex-shrink-0 border-t border-gray-800 pt-2 md:pt-4">
          <div className="h-10 md:h-12 flex items-center justify-center">
            {battleFinished ? (
              <button
                onClick={onContinue}
                className={`btn ${isSandbox ? 'bg-gray-700 hover:bg-gray-600' : 'btn-primary'} text-sm md:text-lg px-8 md:px-16 py-2 animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.3)]`}
              >
                {isSandbox ? 'Close' : 'Continue'}
              </button>
            ) : (
              <div className="text-gray-500 italic animate-pulse flex items-center gap-2 text-sm md:text-base">
                <span className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></span>
                Battle in progress...
              </div>
            )}
          </div>

          {battleFinished && (
            <div className={`w-full max-w-xs md:max-w-sm py-2 md:py-3 rounded-lg text-center text-xl md:text-2xl font-bold border ${resultBgColor} border-current/20 shadow-lg`}>
              {resultText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
