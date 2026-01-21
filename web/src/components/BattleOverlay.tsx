import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { BattleArena } from './BattleArena';

export function BattleOverlay() {
  const battleOutput = useGameStore((state) => state.battleOutput);
  const showBattleOverlay = useGameStore((state) => state.showBattleOverlay);
  const continueAfterBattle = useGameStore((state) => state.continueAfterBattle);
  const view = useGameStore((state) => state.view);

  const [battleFinished, setBattleFinished] = useState(false);

  useEffect(() => {
    if (showBattleOverlay) {
      setBattleFinished(false);
    }
  }, [showBattleOverlay]);

  if (!showBattleOverlay || !battleOutput) {
    return null;
  }

  const result = battleOutput.events[battleOutput.events.length - 1];
  let resultBgColor = 'bg-yellow-900/50 text-yellow-400';
  let resultText = '🤝 DRAW';

  if (result?.type === 'battleEnd') {
    const res = result.payload.result;
    if (res === 'VICTORY') {
      resultBgColor = 'bg-green-900/50 text-green-400';
      resultText = '🏆 VICTORY!';
    } else if (res === 'DEFEAT') {
      resultBgColor = 'bg-red-900/50 text-red-400';
      resultText = '💀 DEFEAT';
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 max-w-5xl w-full mx-4 border border-gray-700">
        <h2 className="text-2xl font-bold text-center mb-4">Round {view?.round} Battle</h2>

        <BattleArena battleOutput={battleOutput} onBattleEnd={() => setBattleFinished(true)} />

        <div className="flex justify-center gap-4 mt-4">
          {battleFinished ? (
            <button
              onClick={continueAfterBattle}
              className="btn btn-primary text-lg px-8 animate-pulse"
            >
              Continue
            </button>
          ) : (
            <div className="h-10"> {/* Placeholder to prevent layout shift */} </div>
          )}
        </div>

        {battleFinished && (
          <div className={`mt-4 p-4 rounded-lg text-center text-2xl font-bold ${resultBgColor}`}>
            {resultText}
          </div>
        )}
      </div>
    </div>
  );
}
