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
  health_change,
  attack_change,
  onAnimationEnd,
}: {
  health_change: number;
  attack_change: number;
  onAnimationEnd: () => void;
}) => {
  const hasHealthChange = health_change !== 0;
  const hasAttackChange = attack_change !== 0;

  if (!hasHealthChange && !hasAttackChange) return null;

  const formatChange = (value: number) => (value > 0 ? `+${value}` : `${value}`);

  let displayText = '';
  if (hasAttackChange && hasHealthChange) {
    displayText = `${formatChange(attack_change)}/${formatChange(health_change)}`;
  } else if (hasAttackChange) {
    displayText = `${formatChange(attack_change)}`;
  } else if (hasHealthChange) {
    displayText = `${formatChange(health_change)}`;
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
  const [playerBoard, setPlayerBoard] = useState<UnitView[]>(battleOutput.initial_player_units || []);
  const [enemyBoard, setEnemyBoard] = useState<UnitView[]>(battleOutput.initial_enemy_units || []);
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
        case 'AbilityTrigger': {
          const { source_instance_id, ability_name } = event.payload;
          setAbilityToasts((prev) => new Map(prev).set(source_instance_id, ability_name));
          delay = 800 / playbackSpeed; // Show toast for a bit
          break;
        }

        case 'Clash': {
          setPlayerBoard(prevPlayer => {
            setEnemyBoard(prevEnemy => {
              const pId = prevPlayer.length > 0 ? prevPlayer[0].instance_id : null;
              const eId = prevEnemy.length > 0 ? prevEnemy[0].instance_id : null;
              const clashing = [pId, eId].filter((id) => id !== null) as number[];
              setClashingUnitIds(clashing);
              return prevEnemy;
            });
            return prevPlayer;
          });
          delay = 300 / playbackSpeed;
          break;
        }

        case 'DamageTaken': {
          const { target_instance_id, remaining_hp } = event.payload;
          
          const updateBoard = (board: UnitView[]) =>
            board.map((u) =>
              u.instance_id === target_instance_id ? { ...u, health: remaining_hp } : u
            );

          setPlayerBoard(prev => {
            const pUnit = prev.find((u) => u.instance_id === target_instance_id);
            if (pUnit) {
              const damage = pUnit.health - remaining_hp;
              if (damage > 0) {
                setDamageNumbers((prevNums) => new Map(prevNums).set(target_instance_id, damage));
              }
            }
            return updateBoard(prev);
          });

          setEnemyBoard(prev => {
            const eUnit = prev.find((u) => u.instance_id === target_instance_id);
            if (eUnit) {
              const damage = eUnit.health - remaining_hp;
              if (damage > 0) {
                setDamageNumbers((prevNums) => new Map(prevNums).set(target_instance_id, damage));
              }
            }
            return updateBoard(prev);
          });

          const prevEvent = battleOutput.events[eventIndex - 1];
          if (prevEvent?.type === 'DamageTaken') {
            delay = 400 / playbackSpeed;
          } else {
            delay = 200 / playbackSpeed;
          }
          break;
        }

        case 'UnitDeath': {
          const { team, new_board_state } = event.payload;
          const isPlayerTeam = String(team).toUpperCase() === 'PLAYER';
          if (isPlayerTeam) {
            setPlayerBoard(new_board_state || []);
          } else {
            setEnemyBoard(new_board_state || []);
          }
          setClashingUnitIds([]);
          delay = 600 / playbackSpeed;
          break;
        }

        case 'BattleEnd': {
          setClashingUnitIds([]);
          delay = 1000 / playbackSpeed;
          break;
        }

        case 'AbilityDamage': {
          const { target_instance_id, damage, remaining_hp } = event.payload;
          
          const updateBoard = (board: UnitView[]) =>
            board.map((u) =>
              u.instance_id === target_instance_id ? { ...u, health: remaining_hp } : u
            );

          if (damage > 0) {
            setDamageNumbers((prev) => new Map(prev).set(target_instance_id, damage));
          }

          setPlayerBoard(updateBoard);
          setEnemyBoard(updateBoard);
          delay = 400 / playbackSpeed;
          break;
        }

        case 'AbilityModifyStats': {
          const { target_instance_id: statsTarget, new_attack, new_health, health_change, attack_change } = event.payload;

          const updateBoard = (board: UnitView[]) =>
            board.map((u) =>
              u.instance_id === statsTarget ? { ...u, attack: new_attack, health: new_health } : u
            );

          setPlayerBoard(prev => {
            const pUnit = prev.find((u) => u.instance_id === statsTarget);
            if (pUnit && (health_change !== 0 || attack_change !== 0)) {
              setStatChanges((prevStats) => new Map(prevStats).set(statsTarget, {
                health: health_change,
                attack: attack_change
              }));
            }
            return updateBoard(prev);
          });

          setEnemyBoard(prev => {
            const eUnit = prev.find((u) => u.instance_id === statsTarget);
            if (eUnit && (health_change !== 0 || attack_change !== 0)) {
              setStatChanges((prevStats) => new Map(prevStats).set(statsTarget, {
                health: health_change,
                attack: attack_change
              }));
            }
            return updateBoard(prev);
          });

          delay = 400 / playbackSpeed;
          break;
        }

        case 'UnitSpawn': {
          const { team, new_board_state } = event.payload;
          const isPlayerTeam = String(team).toUpperCase() === 'PLAYER';
          if (isPlayerTeam) {
            setPlayerBoard(new_board_state);
          } else {
            setEnemyBoard(new_board_state);
          }
          delay = 600 / playbackSpeed;
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

    const isClashing = clashingUnitIds.includes(unit.instance_id);

    return (
      <div key={`${unit.instance_id}-${index}`} className="relative">
        <div
          className={`transition-transform duration-200 ${isClashing ? (isPlayer ? 'clash-bump-right' : 'clash-bump-left') : ''}`}
        >
          <UnitCard
            card={{
              id: 0, // Not used
              template_id: unit.template_id,
              name: unit.name,
              attack: unit.attack,
              health: unit.health,
              play_cost: 0,
              pitch_value: 0,
              abilities: unit.abilities,
            }}
            showCost={false}
            showPitch={false}
            isSelected={false}
          />
        </div>
        {damageNumbers.has(unit.instance_id) && (
          <DamageNumber
            amount={damageNumbers.get(unit.instance_id)!}
            onAnimationEnd={() =>
              setDamageNumbers((prev) => {
                const next = new Map(prev);
                next.delete(unit.instance_id);
                return next;
              })
            }
          />
        )}
        {statChanges.has(unit.instance_id) && (
          <StatChangeNumber
            health_change={statChanges.get(unit.instance_id)!.health}
            attack_change={statChanges.get(unit.instance_id)!.attack}
            onAnimationEnd={() =>
              setStatChanges((prev) => {
                const next = new Map(prev);
                next.delete(unit.instance_id);
                return next;
              })
            }
          />
        )}
        {abilityToasts.has(unit.instance_id) && (
          <AbilityToast
            name={abilityToasts.get(unit.instance_id)!}
            onAnimationEnd={() =>
              setAbilityToasts((prev) => {
                const next = new Map(prev);
                next.delete(unit.instance_id);
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
