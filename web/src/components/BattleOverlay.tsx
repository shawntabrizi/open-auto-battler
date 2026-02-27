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
  const [showContinue, setShowContinue] = useState(false);
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

  // Delay continue button appearance after battle ends
  useEffect(() => {
    if (battleFinished) {
      const timer = setTimeout(() => setShowContinue(true), 600);
      return () => clearTimeout(timer);
    } else {
      setShowContinue(false);
    }
  }, [battleFinished]);

  useEffect(() => {
    if (showOverlay) {
      setBattleFinished(false);
      setShowContinue(false);
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
  let resultText = 'DRAW';
  let resultKey: 'victory' | 'defeat' | 'draw' = 'draw';
  let impactText = '';
  let impactColor = 'text-amber-400/80';
  let flashColor = 'rgba(212, 168, 67, 0.25)';

  if (result?.type === 'BattleEnd') {
    const res = result.payload.result;
    if (res === 'Victory') {
      resultText = 'VICTORY!';
      resultKey = 'victory';
      impactText = '+1 Win';
      impactColor = 'text-green-400/90';
      flashColor = 'rgba(74, 140, 58, 0.3)';
    } else if (res === 'Defeat') {
      resultText = 'DEFEAT';
      resultKey = 'defeat';
      impactText = '-1 Life';
      impactColor = 'text-red-400/90';
      flashColor = 'rgba(168, 58, 42, 0.3)';
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col battle-fullscreen safe-area-pad">
      {/* Dark atmospheric background */}
      <div className="absolute inset-0 bg-surface-dark" />
      <div className="absolute inset-0 battle-arena-bg" />

      {/* Vignette overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
      />

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

      {/* Top bar — title + close */}
      <div className="relative z-10 flex items-center justify-between px-4 lg:px-8 py-1.5 lg:py-4">
        <div className="w-8" /> {/* spacer */}
        <h2 className="text-sm lg:text-xl font-heading font-bold text-warm-300/80 tracking-widest uppercase">
          {title}
        </h2>
        {isSandbox ? (
          <button
            onClick={onContinue}
            className="w-6 h-6 lg:w-8 lg:h-8 flex items-center justify-center text-warm-400 hover:text-warm-100 hover:bg-warm-800 rounded-full transition-colors text-sm lg:text-base"
            title="Close (Esc)"
          >
            x
          </button>
        ) : (
          <div className="w-8" /> /* spacer */
        )}
        {/* Fade line instead of hard border */}
        <div className="absolute bottom-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-warm-600/30 to-transparent" />
      </div>

      {/* Main battle area + result overlay */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 px-2 lg:px-8">
        <BattleArena battleOutput={battleOutput} onBattleEnd={() => setBattleFinished(true)} onEventProcessed={handleEventProcessed} />

        {/* Result overlay — centered over the battle field */}
        {battleFinished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
            {/* Screen flash */}
            <div className="result-flash" style={{ background: flashColor }} />

            {/* Dim scrim behind result */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

            <div className="relative flex flex-col items-center gap-3 lg:gap-5 pointer-events-auto">
              {/* Radial burst behind banner */}
              <div className={`result-burst result-burst-${resultKey}`} />

              {/* Result banner */}
              <div
                className={`battle-result-banner battle-result-${resultKey} px-8 lg:px-16 py-3 lg:py-5 rounded-xl text-center text-3xl lg:text-5xl font-title font-bold tracking-wider uppercase animate-result-slam`}
              >
                {resultText}
              </div>

              {/* Impact line — what changed */}
              {impactText && (
                <div
                  className={`${impactColor} font-heading text-sm lg:text-lg tracking-widest uppercase animate-impact-line`}
                  style={{ animationDelay: '200ms', animationFillMode: 'both' }}
                >
                  {impactText}
                </div>
              )}

              {/* Continue button */}
              {showContinue && (
                <button
                  onClick={onContinue}
                  className={`btn ${isSandbox ? 'bg-warm-700 hover:bg-warm-600' : 'btn-primary'} text-sm lg:text-lg px-10 lg:px-20 py-2.5 lg:py-3 animate-battle-continue shadow-[0_0_20px_rgba(234,179,8,0.3)]`}
                >
                  {isSandbox ? 'Close' : 'Continue'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom — event log */}
      <div className="relative z-10 px-4 lg:px-8 py-3 lg:py-5">
        <div className="battle-log-container w-full max-w-3xl mx-auto">
          <div
            ref={logRef}
            className="battle-log h-20 lg:h-28 overflow-y-auto custom-scrollbar px-3 lg:px-4 py-2 font-body text-[11px] lg:text-sm leading-relaxed"
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
        </div>
      </div>
    </div>
  );
}
