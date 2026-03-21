import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSandboxStore } from '../store/sandboxStore';
import { BattleArena } from './BattleArena';
import { CloseIcon } from './Icons';
import { UI_LAYERS } from '../constants/uiLayers';
import type { BattleAbility, BattleOutput, CombatEvent } from '../types';
import { formatAbilitySummary } from '../utils/abilityText';

// --- Battle Log Helpers ---

function buildUnitNameMap(
  output: BattleOutput
): Map<number, { name: string; team: string; battle_abilities: BattleAbility[] }> {
  const map = new Map<number, { name: string; team: string; battle_abilities: BattleAbility[] }>();
  for (const u of output.initial_player_units) {
    map.set(u.instance_id, { name: u.name, team: 'Player', battle_abilities: u.battle_abilities });
  }
  for (const u of output.initial_enemy_units) {
    map.set(u.instance_id, { name: u.name, team: 'Enemy', battle_abilities: u.battle_abilities });
  }
  for (const event of output.events) {
    if (event.type === 'UnitSpawn') {
      map.set(event.payload.spawned_unit.instance_id, {
        name: event.payload.spawned_unit.name,
        team: String(event.payload.team),
        battle_abilities: event.payload.spawned_unit.battle_abilities,
      });
    }
  }
  return map;
}

function getTriggeredAbilityText(
  unitMap: Map<number, { name: string; team: string; battle_abilities: BattleAbility[] }>,
  sourceInstanceId: number,
  abilityIndex: number,
  resolveCardName: (cardId: number) => string | undefined
): string {
  const ability = unitMap.get(sourceInstanceId)?.battle_abilities?.[abilityIndex];
  return ability
    ? formatAbilitySummary(ability, { resolveCardName })
    : `Ability ${abilityIndex + 1}`;
}

function formatEvent(
  event: CombatEvent,
  unitMap: Map<number, { name: string; team: string; battle_abilities: BattleAbility[] }>,
  resolveCardName: (cardId: number) => string | undefined
): { text: string; color: string } | null {
  const getName = (id: number) => unitMap.get(id)?.name || `Unit #${id}`;

  switch (event.type) {
    case 'Clash':
      return {
        text: `Clash! (${event.payload.p_dmg} / ${event.payload.e_dmg} dmg)`,
        color: 'text-gold',
      };
    case 'DamageTaken':
      return {
        text: `${getName(event.payload.target_instance_id)} hit (${event.payload.remaining_hp} HP left)`,
        color: 'text-defeat-red',
      };
    case 'UnitDeath': {
      const team = String(event.payload.team);
      return { text: `${team} unit falls`, color: 'text-defeat-red' };
    }
    case 'AbilityTrigger':
      return {
        text: `${getName(event.payload.source_instance_id)}'s ${getTriggeredAbilityText(
          unitMap,
          event.payload.source_instance_id,
          event.payload.ability_index,
          resolveCardName
        )}`,
        color: 'text-gold',
      };
    case 'AbilityDamage':
      return {
        text: `${getName(event.payload.source_instance_id)} deals ${event.payload.damage} to ${getName(event.payload.target_instance_id)}`,
        color: 'text-burn-value',
      };
    case 'AbilityModifyStats':
    case 'AbilityModifyStatsPermanent': {
      const { attack_change, health_change } = event.payload;
      const parts: string[] = [];
      if (attack_change) parts.push(`${attack_change > 0 ? '+' : ''}${attack_change} ATK`);
      if (health_change) parts.push(`${health_change > 0 ? '+' : ''}${health_change} HP`);
      return {
        text: `${getName(event.payload.target_instance_id)} ${parts.join(', ')}`,
        color: 'text-accent-emerald',
      };
    }
    case 'AbilityGainMana':
      return {
        text: `${getName(event.payload.source_instance_id)} +${event.payload.amount} mana`,
        color: 'text-mana-blue',
      };
    case 'UnitSpawn':
      return {
        text: `${event.payload.spawned_unit.name} spawns (${event.payload.team})`,
        color: 'text-accent-violet',
      };
    case 'BattleEnd':
      return {
        text: `Battle ends: ${event.payload.result}`,
        color:
          event.payload.result === 'Victory'
            ? 'text-victory-green'
            : event.payload.result === 'Defeat'
              ? 'text-defeat-red'
              : 'text-gold',
      };
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
  const cardNameMap = useGameStore((state) => state.cardNameMap);

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
  const [replayKey, setReplayKey] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  // Build unit name map once per battle output
  const unitNameMap = useMemo(
    () =>
      battleOutput
        ? buildUnitNameMap(battleOutput)
        : new Map<number, { name: string; team: string; battle_abilities: BattleAbility[] }>(),
    [battleOutput]
  );

  const handleEventProcessed = useCallback((idx: number) => {
    setLastEventIndex(idx);
  }, []);
  const resolveCardName = useCallback((cardId: number) => cardNameMap[cardId], [cardNameMap]);

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

  const handleReplay = () => {
    setBattleFinished(false);
    setShowContinue(false);
    setLastEventIndex(-1);
    setShowSplash(true);
    setReplayKey((k) => k + 1);
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  };

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
  let impactColor = 'text-gold/80';
  let flashColor = 'rgb(var(--color-gold) / 0.25)';

  if (result?.type === 'BattleEnd') {
    const res = result.payload.result;
    if (res === 'Victory') {
      resultText = 'VICTORY!';
      resultKey = 'victory';
      impactText = '+1 Win';
      impactColor = 'text-victory-green/90';
      flashColor = 'rgb(var(--color-victory-green) / 0.3)';
    } else if (res === 'Defeat') {
      resultText = 'DEFEAT';
      resultKey = 'defeat';
      impactText = '-1 Life';
      impactColor = 'text-defeat-red/90';
      flashColor = 'rgb(var(--color-defeat-red) / 0.3)';
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
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none"
          style={{ zIndex: UI_LAYERS.inGameOverlay }}
        >
          <span
            className="theme-title-text font-title text-5xl lg:text-8xl font-bold text-transparent bg-clip-text animate-phase-splash"
            style={{
              textShadow:
                '0 0 40px rgb(var(--color-gold) / 0.55), 0 0 80px rgb(var(--color-gold) / 0.24)',
            }}
          >
            BATTLE!
          </span>
        </div>
      )}

      {/* Top bar — title + close */}
      {isSandbox && (
        <button
          onClick={onContinue}
          aria-label="Close (Esc)"
          className="theme-button theme-surface-button absolute top-3 right-3 z-10 rounded-lg border p-2 transition-colors lg:top-4 lg:right-4"
        >
          <CloseIcon className="theme-icon-muted w-4 h-4 lg:w-5 lg:h-5" />
        </button>
      )}
      <div className="relative z-10 flex items-center justify-center px-4 lg:px-8 py-1.5 lg:py-4">
        <h2 className="text-sm lg:text-xl font-heading font-bold text-base-300/80 tracking-widest uppercase">
          {title}
        </h2>
        {/* Fade line instead of hard border */}
        <div className="absolute bottom-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-base-600/30 to-transparent" />
      </div>

      {/* Main battle area + result overlay */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 px-2 lg:px-8">
        <BattleArena
          key={replayKey}
          battleOutput={battleOutput}
          onBattleEnd={() => setBattleFinished(true)}
          onEventProcessed={handleEventProcessed}
          paused={showSplash}
        />

        {/* Result overlay — centered over the battle field */}
        {battleFinished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
            {/* Screen flash */}
            <div className="result-flash" style={{ background: flashColor }} />

            {/* Dim scrim behind result */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

            <div className="relative flex flex-col items-center gap-3 lg:gap-5 pointer-events-auto">
              {/* Radial burst behind banner */}
              {/* result-burst-victory | result-burst-defeat | result-burst-draw */}
              <div className={`result-burst ${resultKey === 'victory' ? 'result-burst-victory' : resultKey === 'defeat' ? 'result-burst-defeat' : 'result-burst-draw'}`} />

              {/* Result banner */}
              {/* battle-result-victory | battle-result-defeat | battle-result-draw */}
              <div
                className={`battle-result-banner ${resultKey === 'victory' ? 'battle-result-victory' : resultKey === 'defeat' ? 'battle-result-defeat' : 'battle-result-draw'} px-8 lg:px-16 py-3 lg:py-5 rounded-xl text-center text-3xl lg:text-5xl font-title font-bold tracking-wider uppercase animate-result-slam`}
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

              {/* Continue + Replay buttons */}
              {showContinue && (
                <div className="flex items-center gap-4 animate-battle-continue">
                  <button
                    onClick={handleReplay}
                    className="theme-button theme-surface-button rounded-lg border px-6 py-2.5 text-sm font-semibold transition-all lg:px-12 lg:py-3 lg:text-lg"
                  >
                    Replay
                  </button>
                  <button
                    onClick={onContinue}
                    className="theme-button btn-primary px-10 lg:px-20 py-2.5 lg:py-3 rounded-lg font-semibold text-sm lg:text-lg transition-all"
                  >
                    {isSandbox ? 'Close' : 'Continue'}
                  </button>
                </div>
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
                const formatted = formatEvent(event, unitNameMap, resolveCardName);
                if (!formatted) return null;
                return (
                  <div key={i} className={`${formatted.color} truncate`}>
                    {formatted.text}
                  </div>
                );
              })
            ) : (
              <div className="text-base-600 italic flex items-center gap-2 h-full justify-center">
                <span className="theme-icon-warning inline-block h-1.5 w-1.5 rounded-full bg-current animate-ping"></span>
                Waiting for battle...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
