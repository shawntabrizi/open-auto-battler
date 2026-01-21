import { UnitCard } from './UnitCard';
import type { CombatUnitInfo } from '../types';

interface BattleViewProps {
  playerUnits: CombatUnitInfo[];
  enemyUnits: CombatUnitInfo[];
  attackingPlayerIndex?: number;
  attackingEnemyIndex?: number;
}

// Convert CombatUnitInfo to BoardUnitView for UnitCard compatibility
function combatUnitToBoardUnitView(unit: CombatUnitInfo, index: number): any {
  return {
    id: index + 1000, // Fake ID for battle units
    templateId: 'battle_unit',
    name: unit.name,
    attack: unit.attack,
    maxHealth: unit.maxHealth,
    currentHealth: unit.health,
    playCost: 0, // Not relevant in battle
    pitchValue: 0, // Not relevant in battle
  };
}

export function BattleView({
  playerUnits,
  enemyUnits,
  attackingPlayerIndex = -1,
  attackingEnemyIndex = -1
}: BattleViewProps) {
  // Super Auto Pets layout: 5 4 3 2 1 vs 1 2 3 4 5
  // Player side: positions 5,4,3,2,1 (back to front) - units shift toward center
  // Enemy side: positions 1,2,3,4,5 (front to back) - units shift toward center
  // Array index 0 is always the current front unit for each side

  const maxUnits = 5; // Show up to 5 positions like Super Auto Pets

  return (
    <div className="flex items-center justify-center gap-8 p-4">
      {/* Player side (left) - displays 5 4 3 2 1 */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-gray-400 mb-2">Player</div>
        <div className="flex gap-2">
          {/* Display player lineup as: position 5, 4, 3, 2, 1 (back to front) */}
          {Array.from({ length: maxUnits }).map((_, displayIndex) => {
            // Convert display index to array index: display 0 = position 5 = array index 4
            // display 1 = position 4 = array index 3, etc.
            const arrayIndex = maxUnits - 1 - displayIndex;
            const unit = playerUnits[arrayIndex];
            const displayPosition = maxUnits - displayIndex; // 5, 4, 3, 2, 1
            const isAttacking = attackingPlayerIndex === arrayIndex;

            return (
              <div key={`player-${displayIndex}`} className="flex flex-col items-center gap-1">
                <div className="text-xs text-gray-500">{displayPosition}</div>
                {unit ? (
                  <div className={`transition-all duration-200 ${isAttacking ? 'scale-110 ring-2 ring-yellow-400' : ''}`}>
                    <UnitCard
                      card={combatUnitToBoardUnitView(unit, arrayIndex)}
                      showCost={false}
                      isSelected={false}
                    />
                  </div>
                ) : (
                  <div className="w-24 h-32 rounded border border-gray-600 bg-gray-800/50 flex items-center justify-center">
                    <span className="text-gray-600 text-xs">-</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* VS in the middle */}
      <div className="text-4xl font-bold text-gray-500">VS</div>

      {/* Enemy side (right) - displays 1 2 3 4 5 */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-gray-400 mb-2">Enemy</div>
        <div className="flex gap-2">
          {/* Display enemy lineup as: position 1, 2, 3, 4, 5 (front to back) */}
          {Array.from({ length: maxUnits }).map((_, displayIndex) => {
            // Display index matches array index: display 0 = position 1 = array index 0
            const arrayIndex = displayIndex;
            const unit = enemyUnits[arrayIndex];
            const displayPosition = displayIndex + 1; // 1, 2, 3, 4, 5
            const isAttacking = attackingEnemyIndex === arrayIndex;

            return (
              <div key={`enemy-${displayIndex}`} className="flex flex-col items-center gap-1">
                <div className="text-xs text-gray-500">{displayPosition}</div>
                {unit ? (
                  <div className={`transition-all duration-200 ${isAttacking ? 'scale-110 ring-2 ring-yellow-400' : ''}`}>
                    <UnitCard
                      card={combatUnitToBoardUnitView(unit, arrayIndex)}
                      showCost={false}
                      isSelected={false}
                    />
                  </div>
                ) : (
                  <div className="w-24 h-32 rounded border border-gray-600 bg-gray-800/50 flex items-center justify-center">
                    <span className="text-gray-600 text-xs">-</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
