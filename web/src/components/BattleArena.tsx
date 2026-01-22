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
  const [clashingUnitIds, setClashingUnitIds] = useState<string[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<Map<string, number>>(new Map());
  const [abilityToasts, setAbilityToasts] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const processNextEvent = () => {
      if (eventIndex >= battleOutput.events.length) {
        console.log({ battleOutput });
        onBattleEnd();
        return;
      }

      const event = battleOutput.events[eventIndex];
      let delay = 500; // Default delay

      switch (event.type) {
        case 'abilityTrigger': {
          const { sourceInstanceId, abilityName } = event.payload;
          setAbilityToasts((prev) => new Map(prev).set(sourceInstanceId, abilityName));
          delay = 800; // Show toast for a bit
          break;
        }

        case 'clash': {
          const pId = (playerBoard || []).length > 0 ? playerBoard[0].instanceId : null;
          const eId = (enemyBoard || []).length > 0 ? enemyBoard[0].instanceId : null;
          const clashing = [pId, eId].filter((id) => id !== null) as string[];
          setClashingUnitIds(clashing);
          delay = 300; // Wait for bump animation
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
            delay = 400;
          } else {
            delay = 200;
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
          delay = 600; // Wait for slide animation
          break;
        }

        case 'battleEnd': {
          setClashingUnitIds([]);
          delay = 1000;
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
          delay = 400;
          break;
        }

        case 'abilityHeal': {
          const { targetInstanceId: healTarget, newHp } = event.payload;
          const updateBoard = (board: UnitView[]) =>
            board.map((u) =>
              u.instanceId === healTarget ? { ...u, health: newHp } : u
            );
          setPlayerBoard(updateBoard);
          setEnemyBoard(updateBoard);
          delay = 400;
          break;
        }

        case 'abilityBuff': {
          const { targetInstanceId: buffTarget, newAttack, newHealth } = event.payload;
          setPlayerBoard((board) =>
            board.map((u) =>
              u.instanceId === buffTarget ? { ...u, attack: newAttack, health: newHealth } : u
            )
          );
          setEnemyBoard((board) =>
            board.map((u) =>
              u.instanceId === buffTarget ? { ...u, attack: newAttack, health: newHealth } : u
            )
          );
          delay = 400;
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
      <div key={unit.instanceId} className="relative">
        <div
          className={`transition-transform duration-200 ${isClashing ? (isPlayer ? 'clash-bump-right' : 'clash-bump-left') : ''}`}
        >
          <UnitCard
            card={{
              id: 0, // Not used
              templateId: unit.templateId,
              name: unit.name,
              attack: unit.attack,
              maxHealth: unit.maxHealth,
              currentHealth: unit.health,
              playCost: 0,
              pitchValue: 0,
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

  return (
    <div className="flex items-center justify-center gap-8 p-4 bg-gray-800 rounded-lg">
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
  );
}
