import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSandboxStore } from '../store/sandboxStore';
import { BattleArena } from './BattleArena';
import type { BattleOutput, CombatEvent } from '../types';

// --- Battle Log Helpers ---

function buildUnitNameMap(
  output: BattleOutput
): Map<number, { name: string; team: string }> {
  const map = new Map<number, { name: string; team: string }>();
  for (const u of output.initial_player_units) {
    map.set(u.instance_id, { name: u.name, team: 'Player' });
  }
  for (const u of output.initial_enemy_units) {
    map.set(u.instance_id, { name: u.name, team: 'Enemy' });
  }
  for (const event of output.events) {
    if (event.type === 'UnitSpawn') {
      map.set(event.payload.spawned_unit.instance_id, {
        name: event.payload.spawned_unit.name,
        team: String(event.payload.team),
      });
    }
  }
  return map;
}

function formatEvent(
  event: CombatEvent,
  unitMap: Map<number, { name: string; team: string }>
): { text: string; color: string } | null {
  const getName = (id: number) => unitMap.get(id)?.name || `Unit #${id}`;

  switch (event.type) {
    case 'Clash':
      return { text: `Clash! (${event.payload.p_dmg} / ${event.payload.e_dmg} dmg)`, color: 'text-amber-400' };
    case 'DamageTaken':
      return { text: `${getName(event.payload.target_instance_id)} hit (${event.payload.remaining_hp} HP left)`, color: 'text-red-400' };
    case 'UnitDeath': {
      const team = String(event.payload.team);
      return { text: `${team} unit falls`, color: 'text-red-300' };
    }
    case 'AbilityTrigger':
      return { text: `${getName(event.payload.source_instance_id)}'s ${event.payload.ability_name}`, color: 'text-yellow-400' };
    case 'AbilityDamage':
      return { text: `${getName(event.payload.source_instance_id)} deals ${event.payload.damage} to ${getName(event.payload.target_instance_id)}`, color: 'text-orange-400' };
    case 'AbilityModifyStats':
    case 'AbilityModifyStatsPermanent': {
      const { attack_change, health_change } = event.payload;
      const parts: string[] = [];
      if (attack_change) parts.push(`${attack_change > 0 ? '+' : ''}${attack_change} ATK`);
      if (health_change) parts.push(`${health_change > 0 ? '+' : ''}${health_change} HP`);
      return { text: `${getName(event.payload.target_instance_id)} ${parts.join(', ')}`, color: 'text-green-400' };
    }
    case 'AbilityGainMana':
      return { text: `${getName(event.payload.source_instance_id)} +${event.payload.amount} mana`, color: 'text-blue-400' };
    case 'UnitSpawn':
      return { text: `${event.payload.spawned_unit.name} spawns (${event.payload.team})`, color: 'text-cyan-400' };
    case 'BattleEnd':
      return { text: `Battle ends: ${event.payload.result}`, color: event.payload.result === 'Victory' ? 'text-green-400' : event.payload.result === 'Defeat' ? 'text-red-400' : 'text-yellow-400' };
    default:
      return null;
  }
}

// --- Component ---

interface BattleOverlayProps {
  mode?: 'game' | 'sandbox';
}

export function BattleOverlay({ mode = 'game' }: BattleOverlayProps) {
  // Use hooks for both stores but decide which values to use based on mode
  const gameBattleOutput = useGameStore((state) => state.battleOutput);
  const gameShowOverlay = useGameStore((state) => state.showBattleOverlay);
  const gameContinue = useGameStore((state) => state.continueAfterBattle);

  const sandboxBattleOutput = useSandboxStore((state) => state.battleOutput);
  const sandboxShowOverlay = useSandboxStore((state) => state.isBattling);
  const sandboxClose = useSandboxStore((state) => state.closeBattle);
  const sandboxSeed = useSandboxStore((state) => state.battleSeed);

  // Derive active states based on mode
  const isSandbox = mode === 'sandbox';
  const battleOutput = isSandbox ? sandboxBattleOutput : gameBattleOutput;
  const showOverlay = isSandbox ? sandboxShowOverlay : gameShowOverlay;
  const onContinue = isSandbox ? sandboxClose : gameContinue;
  const title = isSandbox
    ? `Sandbox Battle (Seed: ${sandboxSeed})`
    : `Round ${battleOutput?.round} Battle`;

  const [battleFinished, setBattleFinished] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [lastEventIndex, setLastEventIndex] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);

  // Build unit name map once per battle output
  const unitNameMap = useMemo(
    () => (battleOutput ? buildUnitNameMap(battleOutput) : new Map<number, { name: string; team: string }>()),
    [battleOutput]
  );

  const handleEventProcessed = useCallback((idx: number) => {
    setLastEventIndex(idx);
  }, []);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lastEventIndex]);

  useEffect(() => {
    if (showOverlay) {
      setBattleFinished(false);
      setLastEventIndex(-1);
      setShowSplash(true);
      const timer = setTimeout(() => setShowSplash(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showOverlay]);

  // Escape key to close (especially useful in sandbox)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showOverlay && isSandbox) {
        onContinue();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOverlay, isSandbox, onContinue]);

  if (!showOverlay || !battleOutput) {
    return null;
  }

  const result = battleOutput.events[battleOutput.events.length - 1];
  let resultBgColor = 'bg-yellow-900/50 text-yellow-400';
  let resultText = 'DRAW';

  if (result?.type === 'BattleEnd') {
    const res = result.payload.result;
    if (res === 'Victory') {
      resultBgColor = 'bg-green-900/50 text-green-400';
      resultText = 'VICTORY!';
    } else if (res === 'Defeat') {
      resultBgColor = 'bg-red-900/50 text-red-400';
      resultText = 'DEFEAT';
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 lg:p-4">
      {/* BATTLE! Splash */}
      {showSplash && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 pointer-events-none">
          <span
            className="font-title text-5xl lg:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 animate-phase-splash"
            style={{
              textShadow: '0 0 40px rgba(245, 158, 11, 0.6), 0 0 80px rgba(245, 158, 11, 0.3)',
            }}
          >
            BATTLE!
          </span>
        </div>
      )}

      <div className="bg-warm-900 rounded-xl p-3 lg:p-6 max-w-[98vw] lg:max-w-[95vw] w-full border border-warm-700 overflow-hidden flex flex-col max-h-[95vh] lg:max-h-[90vh] relative shadow-2xl">
        {/* Close X button for sandbox mode */}
        {isSandbox && (
          <button
            onClick={onContinue}
            className="absolute top-2 right-2 lg:top-4 lg:right-4 w-6 h-6 lg:w-8 lg:h-8 flex items-center justify-center text-warm-400 hover:text-warm-100 hover:bg-warm-800 rounded-full transition-colors z-10 text-sm lg:text-base"
            title="Close (Esc)"
          >
            x
          </button>
        )}

        <h2 className="text-lg lg:text-2xl font-heading font-bold text-center mb-2 lg:mb-4 flex-shrink-0 text-white">
          {title}
        </h2>

        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 custom-scrollbar pb-2 lg:pb-4">
          <div className="min-w-max flex justify-center py-2 lg:py-4 px-1 lg:px-8">
            <BattleArena battleOutput={battleOutput} onBattleEnd={() => setBattleFinished(true)} onEventProcessed={handleEventProcessed} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 lg:gap-3 mt-2 lg:mt-3 flex-shrink-0 border-t border-warm-800 pt-2 lg:pt-3">
          {/* Event Log */}
          <div
            ref={logRef}
            className="w-full max-w-2xl h-16 lg:h-24 overflow-y-auto custom-scrollbar bg-warm-950/50 rounded-lg px-3 py-1.5 font-mono text-[11px] lg:text-xs leading-relaxed"
          >
            {battleOutput && lastEventIndex >= 0 ? (
              battleOutput.events.slice(0, lastEventIndex + 1).map((event, i) => {
                const formatted = formatEvent(event, unitNameMap);
                if (!formatted) return null;
                return (
                  <div key={i} className={`${formatted.color} truncate`}>
                    {formatted.text}
                  </div>
                );
              })
            ) : (
              <div className="text-warm-600 italic flex items-center gap-2 h-full justify-center">
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping"></span>
                Waiting for battle...
              </div>
            )}
          </div>

          {/* Continue / Result */}
          <div className="h-10 lg:h-12 flex items-center justify-center">
            {battleFinished ? (
              <button
                onClick={onContinue}
                className={`btn ${isSandbox ? 'bg-warm-700 hover:bg-warm-600' : 'btn-primary'} text-sm lg:text-lg px-8 lg:px-16 py-2 animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.3)]`}
              >
                {isSandbox ? 'Close' : 'Continue'}
              </button>
            ) : null}
          </div>

          {battleFinished && (
            <div
              className={`w-full max-w-xs lg:max-w-sm py-2 lg:py-3 rounded-lg text-center text-xl lg:text-2xl font-heading font-bold border ${resultBgColor} border-current/20 shadow-lg`}
            >
              {resultText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
