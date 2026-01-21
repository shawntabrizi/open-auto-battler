import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BattleView } from './BattleView';
import type { CombatEvent } from '../types';

export function BattleOverlay() {
  const { battleOutput, showBattleOverlay, currentBattleEventIndex, advanceBattleEvent, continueAfterBattle } = useGameStore();
  const [autoPlay, setAutoPlay] = useState(true);

  // Auto-advance combat rounds (show all events in a round simultaneously)
  useEffect(() => {
    if (!autoPlay || !showBattleOverlay || !battleOutput) return;

    const timer = setTimeout(() => {
      if (currentBattleEventIndex < battleOutput.events.length - 1) {
        advanceBattleEvent();
      }
    }, 1500); // Slightly longer to let players see the simultaneous actions

    return () => clearTimeout(timer);
  }, [autoPlay, showBattleOverlay, battleOutput, currentBattleEventIndex, advanceBattleEvent]);

  if (!showBattleOverlay || !battleOutput) return null;

  const currentEvent = battleOutput.events[currentBattleEventIndex];
  const isLastEvent = currentBattleEventIndex >= battleOutput.events.length - 1;

  // Get all events to display for the current "combat round"
  const getEventsToDisplay = () => {
    const events = battleOutput.events;
    if (currentBattleEventIndex >= events.length) return [];

    const startEvent = events[currentBattleEventIndex];

    // If it's a unitsClash, include all events until the next unitsClash or battleEnd
    if (startEvent.type === 'unitsClash') {
      const roundEvents: CombatEvent[] = [startEvent];
      for (let i = currentBattleEventIndex + 1; i < events.length; i++) {
        const event = events[i];
        if (event.type === 'unitsClash' || event.type === 'battleEnd') {
          break;
        }
        roundEvents.push(event);
      }
      return roundEvents;
    }

    // For other events, just show the current event
    return [startEvent];
  };

  const eventsToDisplay = getEventsToDisplay();

  // Calculate combat rounds for progress display
  const getTotalRounds = () => {
    let rounds = 0;
    for (const event of battleOutput.events) {
      if (event.type === 'unitsClash') {
        rounds++;
      }
    }
    return Math.max(rounds, 1); // At least 1 round for battleEnd
  };

  const getCurrentRoundNumber = () => {
    let rounds = 0;
    for (let i = 0; i <= currentBattleEventIndex; i++) {
      if (battleOutput.events[i].type === 'unitsClash') {
        rounds++;
      }
    }
    return rounds;
  };

  // Calculate current unit states based on battle events (starting from initial state)
  const calculateCurrentUnits = () => {
    const playerUnits = battleOutput.initialPlayerUnits.map(unit => ({ ...unit }));
    const enemyUnits = battleOutput.initialEnemyUnits.map(unit => ({ ...unit }));

    // Apply events forward from initial state to current event index
    for (let i = 0; i <= currentBattleEventIndex; i++) {
      const event = battleOutput.events[i];
      if (event.type === 'damageDealt') {
        const units = event.target.side === 'player' ? playerUnits : enemyUnits;
        // Update health at the target position (front unit during battle)
        if (units[0]) {
          units[0] = {
            ...units[0],
            health: event.newHealth
          };
        }
      } else if (event.type === 'unitDied') {
        const units = event.target.side === 'player' ? playerUnits : enemyUnits;
        // Remove dead unit from front (units slide forward)
        if (units.length > 0) {
          units.shift();
        }
      }
    }

    return { playerUnits, enemyUnits };
  };

  // Get attacking units for current event
  const getAttackingUnits = () => {
    if (currentEvent.type !== 'unitsClash') return { player: -1, enemy: -1 };

    return {
      player: currentEvent.player.index,
      enemy: currentEvent.enemy.index
    };
  };

  const { playerUnits: currentPlayerUnits, enemyUnits: currentEnemyUnits } = calculateCurrentUnits();
  const attackingUnits = getAttackingUnits();

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 max-w-5xl w-full mx-4 border border-gray-700">
        {/* Battle title */}
        <h2 className="text-2xl font-bold text-center mb-4">
          Round {useGameStore.getState().view?.round} Battle
        </h2>

        {/* Battle area */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          {/* Battle view showing both sides */}
          <BattleView
            playerUnits={currentPlayerUnits}
            enemyUnits={currentEnemyUnits}
            attackingPlayerIndex={attackingUnits.player}
            attackingEnemyIndex={attackingUnits.enemy}
          />

          {/* Current events display */}
          <div className="bg-gray-700 rounded p-4 text-center min-h-[80px] flex flex-col items-center justify-center mt-4 gap-2">
            {eventsToDisplay.map((event, index) => (
              <EventDisplay key={index} event={event} />
            ))}
          </div>
        </div>

        {/* Combat round progress */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-sm text-gray-400">
            Round {getCurrentRoundNumber() + 1} / {getTotalRounds()}
          </span>
          <div className="flex-1 max-w-xs h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-mana-blue transition-all duration-300"
              style={{
                width: `${((getCurrentRoundNumber() + 1) / getTotalRounds()) * 100}%`,
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
      // In Super Auto Pets style, index 0 is always the current front unit
      const playerPosition = event.player.index + 1; // Position 1 is front
      const enemyPosition = event.enemy.index + 1; // Position 1 is front
      return (
        <div className="text-lg">
          <span className="text-blue-400">[{playerPosition}] {event.player.name}</span>
          <span className="text-yellow-400 mx-2">⚔️</span>
          <span className="text-red-400">{event.enemy.name} [{enemyPosition}]</span>
        </div>
      );

    case 'damageDealt':
      // In Super Auto Pets style, index 0 is always the current front unit
      const targetPosition = event.target.index + 1; // Position 1 is front
      return (
        <div className="text-lg">
          <span className={event.target.side === 'player' ? 'text-blue-400' : 'text-red-400'}>
            [{targetPosition}] {event.target.name}
          </span>
          <span className="text-red-500 mx-2">-{event.amount}</span>
          <span className="text-gray-400">({event.newHealth} HP)</span>
        </div>
      );

    case 'unitDied':
      // In Super Auto Pets style, index 0 is always the current front unit
      const diedPosition = event.target.index + 1; // Position 1 is front
      return (
        <div className="text-lg">
          <span className={event.target.side === 'player' ? 'text-blue-400' : 'text-red-400'}>
            [{diedPosition}] {event.target.name}
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
