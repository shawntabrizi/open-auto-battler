import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { CombatEvent } from '../types';

export function BattleOverlay() {
  const { battleOutput, showBattleOverlay, currentBattleEventIndex, advanceBattleEvent, continueAfterBattle } = useGameStore();
  const [autoPlay, setAutoPlay] = useState(true);

  // Auto-advance events
  useEffect(() => {
    if (!autoPlay || !showBattleOverlay || !battleOutput) return;

    const timer = setTimeout(() => {
      if (currentBattleEventIndex < battleOutput.events.length - 1) {
        advanceBattleEvent();
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [autoPlay, showBattleOverlay, battleOutput, currentBattleEventIndex, advanceBattleEvent]);

  if (!showBattleOverlay || !battleOutput) return null;

  const currentEvent = battleOutput.events[currentBattleEventIndex];
  const isLastEvent = currentBattleEventIndex >= battleOutput.events.length - 1;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full mx-4 border border-gray-700">
        {/* Battle title */}
        <h2 className="text-2xl font-bold text-center mb-4">
          Round {useGameStore.getState().view?.round} Battle
        </h2>

        {/* Battle area */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          {/* Enemy units */}
          <div className="flex justify-center gap-2 mb-4">
            <span className="text-gray-400 self-center mr-2">Enemy:</span>
            {battleOutput.enemyBoard.map((name, i) => (
              <div
                key={i}
                className="w-16 h-20 bg-red-900/30 rounded border border-red-700 flex items-center justify-center text-xs text-center p-1"
              >
                {name}
              </div>
            ))}
          </div>

          {/* Current event display */}
          <div className="bg-gray-700 rounded p-4 text-center min-h-[80px] flex items-center justify-center">
            <EventDisplay event={currentEvent} />
          </div>
        </div>

        {/* Event progress */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-sm text-gray-400">
            Event {currentBattleEventIndex + 1} / {battleOutput.events.length}
          </span>
          <div className="flex-1 max-w-xs h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-mana-blue transition-all duration-300"
              style={{
                width: `${((currentBattleEventIndex + 1) / battleOutput.events.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {!isLastEvent ? (
            <>
              <button
                onClick={() => setAutoPlay(!autoPlay)}
                className={`btn ${autoPlay ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-600 hover:bg-gray-500'} text-white`}
              >
                {autoPlay ? 'Pause' : 'Auto Play'}
              </button>
              <button
                onClick={advanceBattleEvent}
                className="btn btn-primary"
              >
                Next
              </button>
            </>
          ) : (
            <button
              onClick={continueAfterBattle}
              className="btn btn-primary text-lg px-8"
            >
              {battleOutput.result.result === 'victory' && 'Victory! Continue'}
              {battleOutput.result.result === 'defeat' && 'Defeat... Continue'}
              {battleOutput.result.result === 'draw' && 'Draw! Continue'}
            </button>
          )}
        </div>

        {/* Result banner */}
        {isLastEvent && (
          <div
            className={`
              mt-4 p-4 rounded-lg text-center text-2xl font-bold
              ${battleOutput.result.result === 'victory' ? 'bg-green-900/50 text-green-400' : ''}
              ${battleOutput.result.result === 'defeat' ? 'bg-red-900/50 text-red-400' : ''}
              ${battleOutput.result.result === 'draw' ? 'bg-yellow-900/50 text-yellow-400' : ''}
            `}
          >
            {battleOutput.result.result === 'victory' && '🏆 VICTORY!'}
            {battleOutput.result.result === 'defeat' && '💀 DEFEAT'}
            {battleOutput.result.result === 'draw' && '🤝 DRAW'}
          </div>
        )}
      </div>
    </div>
  );
}

function EventDisplay({ event }: { event: CombatEvent }) {
  switch (event.type) {
    case 'battleStart':
      return (
        <div className="text-xl">
          <span className="text-blue-400">Battle Begins!</span>
          <div className="text-sm text-gray-400 mt-1">
            {event.playerUnits.length} vs {event.enemyUnits.length} units
          </div>
        </div>
      );

    case 'unitsClash':
      return (
        <div className="text-lg">
          <span className="text-blue-400">{event.player.name}</span>
          <span className="text-yellow-400 mx-2">⚔️</span>
          <span className="text-red-400">{event.enemy.name}</span>
        </div>
      );

    case 'damageDealt':
      return (
        <div className="text-lg">
          <span className={event.target.side === 'player' ? 'text-blue-400' : 'text-red-400'}>
            {event.target.name}
          </span>
          <span className="text-red-500 mx-2">-{event.amount}</span>
          <span className="text-gray-400">({event.newHealth} HP)</span>
        </div>
      );

    case 'unitDied':
      return (
        <div className="text-lg">
          <span className={event.target.side === 'player' ? 'text-blue-400' : 'text-red-400'}>
            {event.target.name}
          </span>
          <span className="text-gray-500 ml-2">has fallen! 💀</span>
        </div>
      );

    case 'unitsSlide':
      return (
        <div className="text-gray-400">
          {event.side === 'player' ? 'Your' : 'Enemy'} units advance...
        </div>
      );

    case 'battleEnd':
      return (
        <div className="text-xl font-bold">
          {event.result === 'victory' && <span className="text-green-400">Victory!</span>}
          {event.result === 'defeat' && <span className="text-red-400">Defeat!</span>}
          {event.result === 'draw' && <span className="text-yellow-400">Draw!</span>}
        </div>
      );

    default:
      return <span className="text-gray-500">...</span>;
  }
}
