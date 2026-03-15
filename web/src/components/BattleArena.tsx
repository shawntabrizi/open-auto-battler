import { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { UnitCard, EmptySlot } from './UnitCard';
import type { BattleOutput, UnitView, CombatEvent } from '../types';
import { formatAbilitySummary } from '../utils/abilityText';

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
      <span
        className="text-2xl lg:text-4xl font-stat font-bold text-red-500"
        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(220,38,38,0.5)' }}
      >
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
      <span
        className="text-2xl lg:text-4xl font-stat font-bold text-green-500"
        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(34,197,94,0.5)' }}
      >
        {displayText}
      </span>
    </div>
  );
};

// Toast/bubble for ability triggers
const AbilityToast = ({ name, onAnimationEnd }: { name: string; onAnimationEnd: () => void }) => {
  return (
    <div
      className="ability-toast absolute -top-9 lg:-top-14 left-1/2 z-30"
      onAnimationEnd={onAnimationEnd}
    >
      <div className="ability-toast-inner px-2.5 lg:px-4 py-1 lg:py-1.5 whitespace-nowrap flex items-center gap-1 lg:gap-1.5">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="ability-toast-icon w-3 h-3 lg:w-4 lg:h-4 flex-shrink-0"
        >
          <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
        </svg>
        <span className="text-[10px] lg:text-sm font-bold tracking-wide">{name}</span>
      </div>
    </div>
  );
};

// --- Helper Functions ---

function buildUnitMap(output: BattleOutput): Map<number, UnitView> {
  const map = new Map<number, UnitView>();
  for (const unit of output.initial_player_units || []) {
    map.set(unit.instance_id, unit);
  }
  for (const unit of output.initial_enemy_units || []) {
    map.set(unit.instance_id, unit);
  }
  for (const event of output.events || []) {
    if (event.type === 'UnitSpawn') {
      map.set(event.payload.spawned_unit.instance_id, event.payload.spawned_unit);
    }
  }
  return map;
}

function formatTriggeredAbility(
  unitMap: Map<number, UnitView>,
  sourceInstanceId: number,
  abilityIndex: number,
  resolveCardName: (cardId: number) => string | undefined
): string {
  const ability = unitMap.get(sourceInstanceId)?.battle_abilities?.[abilityIndex];
  return ability
    ? formatAbilitySummary(ability, { resolveCardName })
    : `Ability ${abilityIndex + 1}`;
}

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
      case 'AbilityModifyStatsPermanent': {
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
      return (prevEvent?.type === 'DamageTaken' ? 500 : 300) / playbackSpeed;
    }
    case 'UnitDeath':
      return 600 / playbackSpeed;
    case 'BattleEnd':
      return 1000 / playbackSpeed;
    case 'AbilityDamage':
      return 400 / playbackSpeed;
    case 'AbilityModifyStats':
    case 'AbilityModifyStatsPermanent':
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
  onEventProcessed?: (eventIndex: number) => void;
}

export function BattleArena({ battleOutput, onBattleEnd, onEventProcessed }: BattleArenaProps) {
  const cardNameMap = useGameStore((state) => state.cardNameMap);
  const unitMap = useMemo(() => buildUnitMap(battleOutput), [battleOutput]);
  const resolveCardName = useMemo(() => (cardId: number) => cardNameMap[cardId], [cardNameMap]);
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
  const [shakeActive, setShakeActive] = useState(false);
  const [dyingUnitIds, setDyingUnitIds] = useState<Set<number>>(new Set());
  const [colorFlash, setColorFlash] = useState<string | null>(null);
  const [targetHighlightIds, setTargetHighlightIds] = useState<Set<number>>(new Set());
  const [sourceGlowIds, setSourceGlowIds] = useState<Set<number>>(new Set());

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

    onEventProcessed?.(eventIndex);

    const event = battleOutput.events[eventIndex];

    switch (event.type) {
      case 'AbilityTrigger': {
        const { source_instance_id, ability_index } = event.payload;
        setAbilityToasts((prev) =>
          new Map(prev).set(
            source_instance_id,
            formatTriggeredAbility(unitMap, source_instance_id, ability_index, resolveCardName)
          )
        );
        setSourceGlowIds((prev) => new Set(prev).add(source_instance_id));
        setTimeout(() => {
          setSourceGlowIds((prev) => {
            const next = new Set(prev);
            next.delete(source_instance_id);
            return next;
          });
        }, 800);

        break;
      }

      case 'Clash': {
        setShakeActive(true);
        setTimeout(() => setShakeActive(false), 250);
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

        setTargetHighlightIds((prev) => new Set(prev).add(target_instance_id));
        setTimeout(() => {
          setTargetHighlightIds((prev) => {
            const next = new Set(prev);
            next.delete(target_instance_id);
            return next;
          });
        }, 600);

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
        const newIds = new Set((new_board_state || []).map((u) => u.instance_id));
        // Find the dying unit by diffing current board vs new board
        const currentBoard = isPlayerTeam ? playerBoard : enemyBoard;
        const dyingId = currentBoard.find((u) => !newIds.has(u.instance_id))?.instance_id;

        if (dyingId !== undefined) {
          setDyingUnitIds((prev) => new Set(prev).add(dyingId));
          setTimeout(() => {
            setDyingUnitIds((prev) => {
              const next = new Set(prev);
              next.delete(dyingId);
              return next;
            });
            if (isPlayerTeam) {
              setPlayerBoard(new_board_state || []);
            } else {
              setEnemyBoard(new_board_state || []);
            }
          }, 600);
        } else {
          if (isPlayerTeam) {
            setPlayerBoard(new_board_state || []);
          } else {
            setEnemyBoard(new_board_state || []);
          }
        }
        setClashingUnitIds([]);
        break;
      }

      case 'BattleEnd': {
        setClashingUnitIds([]);
        const res = event.payload.result;

        if (res === 'Victory') {
          setColorFlash('bg-victory-green');
        } else if (res === 'Defeat') {
          setColorFlash('bg-defeat-red');
        } else {
          setColorFlash('bg-gold');
        }
        setTimeout(() => setColorFlash(null), 300);
        break;
      }

      case 'AbilityDamage': {
        const { target_instance_id, damage, remaining_hp } = event.payload;

        setTargetHighlightIds((prev) => new Set(prev).add(target_instance_id));
        setSourceGlowIds((prev) => new Set(prev).add(event.payload.source_instance_id));
        setTimeout(() => {
          setTargetHighlightIds((prev) => {
            const next = new Set(prev);
            next.delete(target_instance_id);
            return next;
          });
          setSourceGlowIds((prev) => {
            const next = new Set(prev);
            next.delete(event.payload.source_instance_id);
            return next;
          });
        }, 600);

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

        setTargetHighlightIds((prev) => new Set(prev).add(statsTarget));
        setTimeout(() => {
          setTargetHighlightIds((prev) => {
            const next = new Set(prev);
            next.delete(statsTarget);
            return next;
          });
        }, 600);

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

      case 'AbilityModifyStatsPermanent': {
        const {
          target_instance_id: statsTarget,
          new_attack,
          new_health,
          health_change,
          attack_change,
        } = event.payload;

        setTargetHighlightIds((prev) => new Set(prev).add(statsTarget));
        setTimeout(() => {
          setTargetHighlightIds((prev) => {
            const next = new Set(prev);
            next.delete(statsTarget);
            return next;
          });
        }, 600);

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
  }, [eventIndex, battleOutput, onEventProcessed, unitMap]);

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
    setTargetHighlightIds(new Set());
    setSourceGlowIds(new Set());
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
        <EmptySlot
          key={`${team}-empty-${displayIndex}`}
          label={index === 0 ? 'Front' : undefined}
          sizeVariant="battle"
        />
      );
    }

    const isClashing = clashingUnitIds.includes(unit.instance_id);
    const isDying = dyingUnitIds.has(unit.instance_id);
    const isTargetHighlighted = targetHighlightIds.has(unit.instance_id);
    const isSourceGlowing = sourceGlowIds.has(unit.instance_id);

    return (
      <div
        key={`${unit.instance_id}-${index}`}
        className={`relative ${isDying ? 'animate-death-shrink' : ''} ${isTargetHighlighted ? 'unit-target-highlight' : ''} ${isSourceGlowing ? 'unit-source-glow' : ''}`}
      >
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
              burn_value: 0,
              shop_abilities: [],
              battle_abilities: unit.battle_abilities,
            }}
            showCost={false}
            showBurn={false}
            sizeVariant="battle"
            isSelected={false}
            enableTilt={false}
            enableWobble={false}
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
    <div
      className={`battle-arena flex flex-col items-center gap-4 lg:gap-6 w-full relative ${shakeActive ? 'animate-screen-shake' : ''}`}
      style={{ '--battle-speed': `${1 / playbackSpeed}` } as React.CSSProperties}
    >
      {/* Color flash overlay */}
      {colorFlash && (
        <div
          className={`absolute inset-0 ${colorFlash} animate-color-flash pointer-events-none z-30`}
        />
      )}

      {/* Playback Controls — compact bar */}
      <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap justify-center">
        {/* Transport controls */}
        <div className="flex items-center bg-warm-900/60 rounded-lg border border-warm-700/50 p-0.5 lg:p-1 gap-0.5">
          <button
            onClick={stepBackward}
            disabled={isAtStart}
            className={`p-1.5 lg:p-2 rounded-md transition-colors ${
              isAtStart
                ? 'text-warm-600 cursor-not-allowed'
                : 'text-warm-200 hover:bg-warm-700 hover:text-warm-100'
            }`}
            title="Previous event"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 lg:w-5 lg:h-5">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          <button
            onClick={stepForward}
            disabled={isAtEnd}
            className={`p-1.5 lg:p-2 rounded-md transition-colors ${
              isAtEnd
                ? 'text-warm-600 cursor-not-allowed'
                : playMode === 'step'
                  ? 'text-gold bg-warm-700'
                  : 'text-warm-200 hover:bg-warm-700 hover:text-warm-100'
            }`}
            title="Step forward"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 lg:w-5 lg:h-5">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            onClick={skipToEnd}
            className="p-1.5 lg:p-2 rounded-md text-warm-200 hover:bg-warm-700 hover:text-warm-100 transition-colors"
            title="Skip to end"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 lg:w-5 lg:h-5">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* Speed controls — desktop only */}
        <div className="hidden lg:flex items-center bg-warm-900/60 rounded-lg border border-warm-700/50 p-0.5 lg:p-1 gap-0.5">
          {speedOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => selectSpeed(option.value)}
              className={`px-2 lg:px-2.5 py-1 lg:py-1.5 text-xs lg:text-sm font-medium rounded-md transition-colors ${
                playMode === 'auto' && playbackSpeed === option.value
                  ? 'bg-accent-amber text-warm-950 shadow-sm'
                  : 'text-warm-300 hover:bg-warm-700 hover:text-warm-100'
              }`}
              title={`${option.value}x speed`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Battle field — teams face off */}
      <div className="flex items-center justify-center gap-1.5 lg:gap-12 w-full min-w-0">
        {/* Player side (left) */}
        <div className="flex flex-col items-center gap-1 lg:gap-3">
          <span className="text-[0.6rem] lg:text-sm text-accent-emerald font-heading uppercase tracking-[0.15em]">
            Your Team
          </span>
          <div className="flex gap-0.5 lg:gap-3 px-1 lg:px-6 py-1 lg:py-4 rounded-xl team-zone-player min-w-0">
            {Array.from({ length: 5 }).map((_, i) =>
              renderUnit((playerBoard || [])[4 - i], 'player', 4 - i)
            )}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div
            className="text-lg lg:text-5xl font-title font-bold text-gold"
            style={{ textShadow: '0 0 20px rgba(212, 168, 67, 0.4)' }}
          >
            VS
          </div>
        </div>

        {/* Enemy side (right) */}
        <div className="flex flex-col items-center gap-1 lg:gap-3">
          <span className="text-[0.6rem] lg:text-sm text-burn-red font-heading uppercase tracking-[0.15em]">
            Enemy
          </span>
          <div className="flex gap-0.5 lg:gap-3 px-1 lg:px-6 py-1 lg:py-4 rounded-xl team-zone-enemy min-w-0">
            {Array.from({ length: 5 }).map((_, i) => renderUnit((enemyBoard || [])[i], 'enemy', i))}
          </div>
        </div>
      </div>
    </div>
  );
}
