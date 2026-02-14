import { useState, useEffect } from 'react';
import { UnitCard } from './UnitCard';
import type { BattleOutput, UnitView, CombatEvent } from '../types';

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
      <span className="text-2xl lg:text-4xl font-bold text-red-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
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
      <span className="text-2xl lg:text-4xl font-bold text-green-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
        {displayText}
      </span>
    </div>
  );
};

// Toast/bubble for ability triggers
const AbilityToast = ({ name, onAnimationEnd }: { name: string; onAnimationEnd: () => void }) => {
  return (
    <div
      className="absolute -top-6 lg:-top-10 left-1/2 -translate-x-1/2 px-1.5 lg:px-3 py-0.5 lg:py-1 bg-yellow-500 text-black text-[10px] lg:text-sm font-bold rounded lg:rounded-lg shadow-lg animate-fade-in-out whitespace-nowrap z-20"
      onAnimationEnd={onAnimationEnd}
    >
      {name}
    </div>
  );
};

// --- Helper Functions ---

// Compute board state by replaying events from the start up to a given index
function computeBoardState(
  events: CombatEvent[],
  initialPlayer: UnitView[],
  initialEnemy: UnitView[],
  upToIndex: number
): { playerBoard: UnitView[]; enemyBoard: UnitView[] } {
  let player = [...initialPlayer];
  let enemy = [...initialEnemy];

  for (let i = 0; i <= upToIndex && i < events.length; i++) {
    const event = events[i];
    switch (event.type) {
      case 'DamageTaken': {
        const { target_instance_id, remaining_hp } = event.payload;
        const update = (board: UnitView[]) =>
          board.map((u) =>
            u.instance_id === target_instance_id ? { ...u, health: remaining_hp } : u
          );
        player = update(player);
        enemy = update(enemy);
        break;
      }
      case 'UnitDeath': {
        const { team, new_board_state } = event.payload;
        if (String(team).toUpperCase() === 'PLAYER') player = new_board_state || [];
        else enemy = new_board_state || [];
        break;
      }
      case 'AbilityDamage': {
        const { target_instance_id, remaining_hp } = event.payload;
        const update = (board: UnitView[]) =>
          board.map((u) =>
            u.instance_id === target_instance_id ? { ...u, health: remaining_hp } : u
          );
        player = update(player);
        enemy = update(enemy);
        break;
      }
      case 'AbilityModifyStats': {
        const { target_instance_id, new_attack, new_health } = event.payload;
        const update = (board: UnitView[]) =>
          board.map((u) =>
            u.instance_id === target_instance_id
              ? { ...u, attack: new_attack, health: new_health }
              : u
          );
        player = update(player);
        enemy = update(enemy);
        break;
      }
      case 'UnitSpawn': {
        const { team, new_board_state } = event.payload;
        if (String(team).toUpperCase() === 'PLAYER') player = new_board_state;
        else enemy = new_board_state;
        break;
      }
    }
  }

  return { playerBoard: player, enemyBoard: enemy };
}

// Get the animation delay for a given event
function getEventDelay(events: CombatEvent[], index: number, playbackSpeed: number): number {
  const event = events[index];
  switch (event.type) {
    case 'AbilityTrigger':
      return 800 / playbackSpeed;
    case 'Clash':
      return 300 / playbackSpeed;
    case 'DamageTaken': {
      const prevEvent = index > 0 ? events[index - 1] : null;
      return (prevEvent?.type === 'DamageTaken' ? 400 : 200) / playbackSpeed;
    }
    case 'UnitDeath':
      return 600 / playbackSpeed;
    case 'BattleEnd':
      return 1000 / playbackSpeed;
    case 'AbilityDamage':
      return 400 / playbackSpeed;
    case 'AbilityModifyStats':
      return 400 / playbackSpeed;
    case 'AbilityGainMana':
      return 300 / playbackSpeed;
    case 'UnitSpawn':
      return 600 / playbackSpeed;
    default:
      return 500 / playbackSpeed;
  }
}

// --- Main BattleArena Component ---

interface BattleArenaProps {
  battleOutput: BattleOutput;
  onBattleEnd: () => void;
}

export function BattleArena({ battleOutput, onBattleEnd }: BattleArenaProps) {
  const [playerBoard, setPlayerBoard] = useState<UnitView[]>(
    battleOutput.initial_player_units || []
  );
  const [enemyBoard, setEnemyBoard] = useState<UnitView[]>(battleOutput.initial_enemy_units || []);
  const [eventIndex, setEventIndex] = useState(0);

  // Animation states
  const [clashingUnitIds, setClashingUnitIds] = useState<number[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<Map<number, number>>(new Map());
  const [statChanges, setStatChanges] = useState<Map<number, { health: number; attack: number }>>(
    new Map()
  );
  const [abilityToasts, setAbilityToasts] = useState<Map<number, string>>(new Map());

  // Playback speed control
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('battlePlaybackSpeed');
    return saved ? parseFloat(saved) : 1;
  });

  // Playback mode: 'auto' plays continuously, 'step' pauses for manual control
  const [playMode, setPlayMode] = useState<'auto' | 'step'>('auto');

  // Save speed to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('battlePlaybackSpeed', playbackSpeed.toString());
  }, [playbackSpeed]);

  useEffect(() => {
    console.log({ battleOutput });
  }, [battleOutput]);

  // Process event visual effects when eventIndex changes
  useEffect(() => {
    if (eventIndex >= battleOutput.events.length) return;

    const event = battleOutput.events[eventIndex];

    switch (event.type) {
      case 'AbilityTrigger': {
        const { source_instance_id, ability_name } = event.payload;
        setAbilityToasts((prev) => new Map(prev).set(source_instance_id, ability_name));
        break;
      }

      case 'Clash': {
        setPlayerBoard((prevPlayer) => {
          setEnemyBoard((prevEnemy) => {
            const pId = prevPlayer.length > 0 ? prevPlayer[0].instance_id : null;
            const eId = prevEnemy.length > 0 ? prevEnemy[0].instance_id : null;
            const clashing = [pId, eId].filter((id) => id !== null);
            setClashingUnitIds(clashing);
            return prevEnemy;
          });
          return prevPlayer;
        });
        break;
      }

      case 'DamageTaken': {
        const { target_instance_id, remaining_hp } = event.payload;

        const updateBoard = (board: UnitView[]) =>
          board.map((u) =>
            u.instance_id === target_instance_id ? { ...u, health: remaining_hp } : u
          );

        setPlayerBoard((prev) => {
          const pUnit = prev.find((u) => u.instance_id === target_instance_id);
          if (pUnit) {
            const damage = pUnit.health - remaining_hp;
            if (damage > 0) {
              setDamageNumbers((prevNums) => new Map(prevNums).set(target_instance_id, damage));
            }
          }
          return updateBoard(prev);
        });

        setEnemyBoard((prev) => {
          const eUnit = prev.find((u) => u.instance_id === target_instance_id);
          if (eUnit) {
            const damage = eUnit.health - remaining_hp;
            if (damage > 0) {
              setDamageNumbers((prevNums) => new Map(prevNums).set(target_instance_id, damage));
            }
          }
          return updateBoard(prev);
        });
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
        break;
      }

      case 'BattleEnd': {
        setClashingUnitIds([]);
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
        break;
      }

      case 'AbilityModifyStats': {
        const {
          target_instance_id: statsTarget,
          new_attack,
          new_health,
          health_change,
          attack_change,
        } = event.payload;

        const updateBoard = (board: UnitView[]) =>
          board.map((u) =>
            u.instance_id === statsTarget ? { ...u, attack: new_attack, health: new_health } : u
          );

        setPlayerBoard((prev) => {
          const pUnit = prev.find((u) => u.instance_id === statsTarget);
          if (pUnit && (health_change !== 0 || attack_change !== 0)) {
            setStatChanges((prevStats) =>
              new Map(prevStats).set(statsTarget, {
                health: health_change,
                attack: attack_change,
              })
            );
          }
          return updateBoard(prev);
        });

        setEnemyBoard((prev) => {
          const eUnit = prev.find((u) => u.instance_id === statsTarget);
          if (eUnit && (health_change !== 0 || attack_change !== 0)) {
            setStatChanges((prevStats) =>
              new Map(prevStats).set(statsTarget, {
                health: health_change,
                attack: attack_change,
              })
            );
          }
          return updateBoard(prev);
        });
        break;
      }

      case 'AbilityGainMana': {
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
        break;
      }
    }
  }, [eventIndex, battleOutput]);

  // Auto-advance timer (only in auto mode)
  useEffect(() => {
    if (eventIndex >= battleOutput.events.length) {
      if (playMode === 'auto') onBattleEnd();
      return;
    }
    if (playMode !== 'auto') return;

    const delay = getEventDelay(battleOutput.events, eventIndex, playbackSpeed);
    const timeoutId = setTimeout(() => setEventIndex((i) => i + 1), delay);
    return () => clearTimeout(timeoutId);
  }, [eventIndex, playMode, playbackSpeed, battleOutput, onBattleEnd]);

  // --- Step / Skip handlers ---

  const clearAnimations = () => {
    setClashingUnitIds([]);
    setDamageNumbers(new Map());
    setStatChanges(new Map());
    setAbilityToasts(new Map());
  };

  const stepForward = () => {
    if (eventIndex >= battleOutput.events.length) {
      onBattleEnd();
      return;
    }
    setPlayMode('step');
    setEventIndex((i) => i + 1);
  };

  const stepBackward = () => {
    if (eventIndex <= 0) return;
    setPlayMode('step');
    const newIndex = eventIndex - 1;
    clearAnimations();
    // Recompute board state up to the event BEFORE the target,
    // so the event-processing useEffect can apply the target event's visuals
    const { playerBoard: p, enemyBoard: e } = computeBoardState(
      battleOutput.events,
      battleOutput.initial_player_units || [],
      battleOutput.initial_enemy_units || [],
      newIndex - 1
    );
    setPlayerBoard(p);
    setEnemyBoard(e);
    setEventIndex(newIndex);
  };

  const skipToEnd = () => {
    clearAnimations();
    const { playerBoard: p, enemyBoard: e } = computeBoardState(
      battleOutput.events,
      battleOutput.initial_player_units || [],
      battleOutput.initial_enemy_units || [],
      battleOutput.events.length - 1
    );
    setPlayerBoard(p);
    setEnemyBoard(e);
    setEventIndex(battleOutput.events.length);
    onBattleEnd();
  };

  const selectSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    setPlayMode('auto');
  };

  const renderUnit = (unit: UnitView | undefined, team: 'player' | 'enemy', index: number) => {
    const isPlayer = team === 'player';
    // Player: 5 4 3 2 1 -> array is [0,1,2,3,4] but we want to display from right to left
    // So array[0] is at visual position 1 (far right of player side)
    const displayIndex = isPlayer ? 4 - index : index;

    if (!unit) {
      return (
        <div
          key={`${team}-empty-${displayIndex}`}
          className="w-[4.5rem] h-24 lg:w-32 lg:h-44 rounded border border-gray-600 bg-gray-800/50 flex items-center justify-center"
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
              id: unit.card_id,
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

  const isAtStart = eventIndex <= 0;
  const isAtEnd = eventIndex >= battleOutput.events.length;

  return (
    <div className="battle-arena flex flex-col items-center gap-2 lg:gap-4 p-2 lg:p-4 bg-gray-800 rounded-lg">
      {/* Playback Controls */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <span className="text-white text-xs lg:text-sm font-medium mr-1 lg:mr-2">Speed:</span>
        {speedOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => selectSpeed(option.value)}
            className={`px-1.5 lg:px-2 py-0.5 lg:py-1 text-[10px] lg:text-xs font-medium rounded ${
              playMode === 'auto' && playbackSpeed === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="text-gray-500 mx-1">|</span>
        <button
          onClick={stepBackward}
          disabled={isAtStart}
          className={`px-1.5 lg:px-2 py-0.5 lg:py-1 text-[10px] lg:text-xs font-medium rounded ${
            isAtStart
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
          }`}
        >
          Prev
        </button>
        <button
          onClick={stepForward}
          disabled={isAtEnd}
          className={`px-1.5 lg:px-2 py-0.5 lg:py-1 text-[10px] lg:text-xs font-medium rounded ${
            isAtEnd
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : playMode === 'step'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
          }`}
        >
          Step
        </button>
        <button
          onClick={skipToEnd}
          className="px-1.5 lg:px-2 py-0.5 lg:py-1 text-[10px] lg:text-xs font-medium rounded bg-gray-600 text-gray-300 hover:bg-gray-500"
        >
          Skip
        </button>
      </div>

      {/* Battle Arena */}
      <div className="flex items-center justify-center gap-2 lg:gap-8">
        {/* Player side (left) */}
        <div className="flex gap-1 lg:gap-2">
          {Array.from({ length: 5 }).map((_, i) =>
            renderUnit((playerBoard || [])[4 - i], 'player', 4 - i)
          )}
        </div>

        <div className="text-xl lg:text-4xl font-bold text-gray-500">VS</div>

        {/* Enemy side (right) */}
        <div className="flex gap-1 lg:gap-2">
          {Array.from({ length: 5 }).map((_, i) => renderUnit((enemyBoard || [])[i], 'enemy', i))}
        </div>
      </div>
    </div>
  );
}
