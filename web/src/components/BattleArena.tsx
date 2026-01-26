import { useState, useEffect } from 'react';
import { UnitCard } from './UnitCard';
import type { BattleOutput, UnitView } from '../types';

// --- Helper Components ---

// Floating text for damage numbers
const DamageNumber = ({
  amount,
  onAnimationEnd,
}: {
  amount: number;
  onAnimationEnd: () => void;
}) => {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center animate-float-up"
      onAnimationEnd={onAnimationEnd}
    >
      <span className="text-4xl font-bold text-red-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
        -{amount}
      </span>
    </div>
  );
};

// Floating text for stat changes (health/attack gains)
const StatChangeNumber = ({
  healthChange,
  attackChange,
  onAnimationEnd,
}: {
  healthChange: number;
  attackChange: number;
  onAnimationEnd: () => void;
}) => {
  const hasHealthChange = healthChange !== 0;
  const hasAttackChange = attackChange !== 0;

  if (!hasHealthChange && !hasAttackChange) return null;

  const formatChange = (value: number) => (value > 0 ? `+${value}` : `${value}`);

  let displayText = '';
  if (hasAttackChange && hasHealthChange) {
    displayText = `${formatChange(attackChange)}/${formatChange(healthChange)}`;
  } else if (hasAttackChange) {
    displayText = `${formatChange(attackChange)}`;
  } else if (hasHealthChange) {
    displayText = `${formatChange(healthChange)}`;
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center animate-float-up"
      onAnimationEnd={onAnimationEnd}
    >
      <span className="text-4xl font-bold text-green-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
        {displayText}
      </span>
    </div>
  );
};

// Toast/bubble for ability triggers
const AbilityToast = ({ name, onAnimationEnd }: { name: string; onAnimationEnd: () => void }) => {
  return (
    <div
      className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-yellow-500 text-black text-sm font-bold rounded-lg shadow-lg animate-fade-in-out"
      onAnimationEnd={onAnimationEnd}
    >
      {name}
    </div>
  );
};

// --- Main BattleArena Component ---

interface BattleArenaProps {
  battleOutput: BattleOutput;
  onBattleEnd: () => void;
}

export function BattleArena({ battleOutput, onBattleEnd }: BattleArenaProps) {
  const [playerBoard, setPlayerBoard] = useState<UnitView[]>(battleOutput.initialPlayerUnits || []);
  const [enemyBoard, setEnemyBoard] = useState<UnitView[]>(battleOutput.initialEnemyUnits || []);
  const [eventIndex, setEventIndex] = useState(0);

  // Animation states
  const [clashingUnitIds, setClashingUnitIds] = useState<number[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<Map<number, number>>(new Map());
  const [statChanges, setStatChanges] = useState<Map<number, { health: number; attack: number }>>(new Map());
  const [abilityToasts, setAbilityToasts] = useState<Map<number, string>>(new Map());

  // Playback speed control
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('battlePlaybackSpeed');
    return saved ? parseFloat(saved) : 1;
  });

  // Save speed to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('battlePlaybackSpeed', playbackSpeed.toString());
  }, [playbackSpeed]);

  useEffect(() => {
    console.log({ battleOutput });
  }, [battleOutput]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const processNextEvent = () => {
      if (eventIndex >= battleOutput.events.length) {
        onBattleEnd();
        return;
      }

      const event = battleOutput.events[eventIndex];
      let delay = 500 / playbackSpeed; // Default delay adjusted for speed

      switch (event.type) {
        case 'abilityTrigger': {
          const { sourceInstanceId, abilityName } = event.payload;
          setAbilityToasts((prev) => new Map(prev).set(sourceInstanceId, abilityName));
          delay = 800 / playbackSpeed; // Show toast for a bit
          break;
        }

        case 'clash': {
          const pId = (playerBoard || []).length > 0 ? playerBoard[0].instanceId : null;
          const eId = (enemyBoard || []).length > 0 ? enemyBoard[0].instanceId : null;
          const clashing = [pId, eId].filter((id) => id !== null) as number[];
          setClashingUnitIds(clashing);
          delay = 300 / playbackSpeed; // Wait for bump animation
          break;
        }

        case 'damageTaken': {
          const { targetInstanceId, remainingHp } = event.payload;
          const pUnit = playerBoard.find((u) => u.instanceId === targetInstanceId);
          const eUnit = enemyBoard.find((u) => u.instanceId === targetInstanceId);
          const oldHp = pUnit?.health ?? eUnit?.health ?? 0;
          const damage = oldHp - remainingHp;

          if (damage > 0) {
            setDamageNumbers((prev) => new Map(prev).set(targetInstanceId, damage));
          }

          const updateBoard = (board: UnitView[]) =>
            board.map((u) =>
              u.instanceId === targetInstanceId ? { ...u, health: remainingHp } : u
            );

          setPlayerBoard(updateBoard);
          setEnemyBoard(updateBoard);

          // If this is the second damage event in a clash, don't wait as long
          const prevEvent = battleOutput.events[eventIndex - 1];
          if (prevEvent?.type === 'damageTaken') {
            delay = 400 / playbackSpeed;
          } else {
            delay = 200 / playbackSpeed;
          }
          break;
        }

        case 'unitDeath': {
          const { team, newBoardState } = event.payload;
          if (team === 'PLAYER') {
            setPlayerBoard(newBoardState || []);
          } else {
            setEnemyBoard(newBoardState || []);
          }
          setClashingUnitIds([]); // Stop clash animation
          delay = 600 / playbackSpeed; // Wait for slide animation
          break;
        }

        case 'battleEnd': {
          setClashingUnitIds([]);
          delay = 1000 / playbackSpeed;
          break;
        }

        case 'abilityDamage': {
          const { targetInstanceId, damage, remainingHp } = event.payload;
          if (damage > 0) {
            setDamageNumbers((prev) => new Map(prev).set(targetInstanceId, damage));
          }
          const updateBoard = (board: UnitView[]) =>
            board.map((u) =>
              u.instanceId === targetInstanceId ? { ...u, health: remainingHp } : u
            );
          setPlayerBoard(updateBoard);
          setEnemyBoard(updateBoard);
          delay = 400 / playbackSpeed;
          break;
        }

        case 'abilityModifyStats': {
          const { targetInstanceId: statsTarget, newAttack, newHealth, healthChange, attackChange } = event.payload;

          // Find the unit to get current stats before change
          const pUnit = playerBoard.find((u) => u.instanceId === statsTarget);
          const eUnit = enemyBoard.find((u) => u.instanceId === statsTarget);
          const currentUnit = pUnit || eUnit;

          if (currentUnit && (healthChange !== 0 || attackChange !== 0)) {
            setStatChanges((prev) => new Map(prev).set(statsTarget, {
              health: healthChange,
              attack: attackChange
            }));
          }

          setPlayerBoard((board) =>
            board.map((u) =>
              u.instanceId === statsTarget ? { ...u, attack: newAttack, health: newHealth } : u
            )
          );
          setEnemyBoard((board) =>
            board.map((u) =>
              u.instanceId === statsTarget ? { ...u, attack: newAttack, health: newHealth } : u
            )
          );
          delay = 400 / playbackSpeed;
          break;
        }

        case 'unitSpawn': {
          const { team, newBoardState } = event.payload;
          if (team === 'PLAYER') {
            setPlayerBoard(newBoardState);
          } else {
            setEnemyBoard(newBoardState);
          }
          delay = 600 / playbackSpeed; // Slightly longer delay for spawn animation
          break;
        }
      }

      timeoutId = setTimeout(() => setEventIndex((i) => i + 1), delay);
    };

    processNextEvent();

    // Cleanup: cancel timeout if effect re-runs (e.g., due to StrictMode double-invoke)
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [eventIndex, battleOutput, onBattleEnd]);

  const renderUnit = (unit: UnitView | undefined, team: 'player' | 'enemy', index: number) => {
    const isPlayer = team === 'player';
    // Player: 5 4 3 2 1 -> array is [0,1,2,3,4] but we want to display from right to left
    // So array[0] is at visual position 1 (far right of player side)
    const displayIndex = isPlayer ? 4 - index : index;

    if (!unit) {
      return (
        <div
          key={`${team}-empty-${displayIndex}`}
          className="w-24 h-32 rounded border border-gray-600 bg-gray-800/50 flex items-center justify-center"
        >
          <span className="text-gray-600 text-xs">-</span>
        </div>
      );
    }

    const isClashing = clashingUnitIds.includes(unit.instanceId);

    return (
      <div key={`${unit.instanceId}-${index}`} className="relative">
        <div
          className={`transition-transform duration-200 ${isClashing ? (isPlayer ? 'clash-bump-right' : 'clash-bump-left') : ''}`}
        >
          <UnitCard
            card={{
              id: 0, // Not used
              templateId: unit.templateId,
              name: unit.name,
              attack: unit.attack,
              health: unit.health,
              playCost: 0,
              pitchValue: 0,
              abilities: unit.abilities,
              isToken: unit.isToken,
            }}
            showCost={false}
            showPitch={false}
            isSelected={false}
          />
        </div>
        {damageNumbers.has(unit.instanceId) && (
          <DamageNumber
            amount={damageNumbers.get(unit.instanceId)!}
            onAnimationEnd={() =>
              setDamageNumbers((prev) => {
                const next = new Map(prev);
                next.delete(unit.instanceId);
                return next;
              })
            }
          />
        )}
        {statChanges.has(unit.instanceId) && (
          <StatChangeNumber
            healthChange={statChanges.get(unit.instanceId)!.health}
            attackChange={statChanges.get(unit.instanceId)!.attack}
            onAnimationEnd={() =>
              setStatChanges((prev) => {
                const next = new Map(prev);
                next.delete(unit.instanceId);
                return next;
              })
            }
          />
        )}
        {abilityToasts.has(unit.instanceId) && (
          <AbilityToast
            name={abilityToasts.get(unit.instanceId)!}
            onAnimationEnd={() =>
              setAbilityToasts((prev) => {
                const next = new Map(prev);
                next.delete(unit.instanceId);
                return next;
              })
            }
          />
        )}
      </div>
    );
  };

  const speedOptions = [
    { label: '1x', value: 1 },
    { label: '2x', value: 2 },
    { label: '3x', value: 3 },
    { label: '4x', value: 4 },
    { label: '5x', value: 5 },
  ];

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-gray-800 rounded-lg">
      {/* Speed Control */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <span className="text-white text-sm font-medium mr-2">Speed:</span>
        {speedOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setPlaybackSpeed(option.value)}
            className={`px-2 py-1 text-xs font-medium rounded ${playbackSpeed === option.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
              }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Battle Arena */}
      <div className="flex items-center justify-center gap-8">
        {/* Player side (left) */}
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) =>
            renderUnit((playerBoard || [])[4 - i], 'player', 4 - i)
          )}
        </div>

        <div className="text-4xl font-bold text-gray-500">VS</div>

        {/* Enemy side (right) */}
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => renderUnit((enemyBoard || [])[i], 'enemy', i))}
        </div>
      </div>
    </div>
  );
}
