import type { CombatUnitInfo } from '../types';

interface BattleViewProps {
  playerUnits: CombatUnitInfo[];
  enemyUnits: CombatUnitInfo[];
  attackingPlayerIndex?: number;
  attackingEnemyIndex?: number;
}

export function BattleView({
  playerUnits,
  enemyUnits,
  attackingPlayerIndex = -1,
  attackingEnemyIndex = -1
}: BattleViewProps) {
  // In Super Auto Pets style, we show the current lineup from front to back
  // The array index 0 is always the current front unit
  // We display up to 5 positions, showing the current fighting lineup

  const maxUnits = 5; // Show up to 5 positions like Super Auto Pets

  return (
    <div className="flex items-center justify-center gap-8 p-4">
      {/* Player side (left) */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-gray-400 mb-2">Player</div>
        <div className="flex gap-2">
          {/* Display current player lineup (front to back: positions 1, 2, 3, 4, 5) */}
          {Array.from({ length: maxUnits }).map((_, position) => {
            const unit = playerUnits[position]; // position 0 = front, 1 = behind front, etc.
            const displayPosition = position + 1; // Display as 1, 2, 3, 4, 5
            const isAttacking = attackingPlayerIndex === position;

            return (
              <div key={`player-${position}`} className="flex flex-col items-center gap-1">
                <div className="text-xs text-gray-500">{displayPosition}</div>
                {unit ? (
                  <div className={`w-16 h-20 rounded border flex flex-col items-center justify-center text-xs p-1 transition-all duration-200 ${
                    isAttacking ? 'bg-yellow-600 border-yellow-400 shadow-lg scale-110 ring-2 ring-yellow-400' : 'bg-blue-900/50 border-blue-700'
                  }`}>
                    <div className="font-bold text-center leading-tight">{unit.name}</div>
                    <div className="flex gap-1 mt-1">
                      <span className="text-red-400">⚔️{unit.attack}</span>
                      <span className="text-green-400">
                        ❤️{unit.health}/{unit.maxHealth}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-20 rounded border border-gray-600 bg-gray-800/50 flex items-center justify-center">
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

      {/* Enemy side (right) */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-gray-400 mb-2">Enemy</div>
        <div className="flex gap-2">
          {/* Display current enemy lineup (front to back: positions 1, 2, 3, 4, 5) */}
          {Array.from({ length: maxUnits }).map((_, position) => {
            const unit = enemyUnits[position]; // position 0 = front, 1 = behind front, etc.
            const displayPosition = position + 1; // Display as 1, 2, 3, 4, 5
            const isAttacking = attackingEnemyIndex === position;

            return (
              <div key={`enemy-${position}`} className="flex flex-col items-center gap-1">
                <div className="text-xs text-gray-500">{displayPosition}</div>
                {unit ? (
                  <div className={`w-16 h-20 rounded border flex flex-col items-center justify-center text-xs p-1 transition-all duration-200 ${
                    isAttacking ? 'bg-yellow-600 border-yellow-400 shadow-lg scale-110 ring-2 ring-yellow-400' : 'bg-red-900/50 border-red-700'
                  }`}>
                    <div className="font-bold text-center leading-tight">{unit.name}</div>
                    <div className="flex gap-1 mt-1">
                      <span className="text-red-400">⚔️{unit.attack}</span>
                      <span className="text-green-400">
                        ❤️{unit.health}/{unit.maxHealth}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-20 rounded border border-gray-600 bg-gray-800/50 flex items-center justify-center">
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