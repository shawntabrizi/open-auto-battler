/**
 * Battle replay bench: the app's own BattleOverlay (and BattleArena inside it)
 * over the app's ParticleBackground, fed a synthetic battle from the WASM
 * engine's sandbox path (`run_sandbox_battle`). No chain, no host.
 *
 * On load it searches random 5v5 boards (seeded, so the pick is reproducible)
 * for the battle with the most combat events, then waits for
 * `window.__BENCH__.play()`.
 *
 * URL params: `candidates` (boards to try, default 600), `seed` (default 1).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '../../../src/index.css';
import { BattleOverlay } from '../../../src/components/BattleOverlay';
import { ParticleBackground } from '../../../src/components/ParticleBackground';
import { useGameStore } from '../../../src/store/gameStore';
import { useThemeStore } from '../../../src/store/themeStore';
import { applyResolvedThemeToDocument } from '../../../src/theme/themes';
import type { BattleOutput } from '../../../src/types';

export interface BenchInfo {
  ready: boolean;
  done: boolean;
  candidates: number;
  /** Candidates skipped because they hit the battle limit (stalemate). */
  stalemates: number;
  searchMs: number;
  events: number;
  eventTypes: Record<string, number>;
  units: { player: number; enemy: number; spawned: number };
  boards: { player: number[]; enemy: number[]; seed: number };
  play(): void;
  playStartedAt: number;
  battleEndedAt: number;
}

declare global {
  interface Window {
    __BENCH__: BenchInfo;
  }
}

/** mulberry32: small seeded PRNG so the chosen battle is reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function histogram(output: BattleOutput): Record<string, number> {
  const h: Record<string, number> = {};
  for (const e of output.events) h[e.type] = (h[e.type] ?? 0) + 1;
  return h;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const candidates = Number(params.get('candidates') ?? 600);
  const seed = Number(params.get('seed') ?? 1);

  applyResolvedThemeToDocument(useThemeStore.getState().activeTheme);
  await useGameStore.getState().initEngine();
  // The two sandbox exports of the WASM client (src/wasm/oab_client.d.ts).
  const wasm = (await import('oab-client')) as unknown as {
    get_unit_templates(): unknown;
    run_sandbox_battle(player: unknown, enemy: unknown, seed: bigint): unknown;
  };
  const ids = (wasm.get_unit_templates() as Array<{ id: number }>).map((c) => c.id);

  const rand = prng(seed);
  const pick = () => Array.from({ length: 5 }, () => ids[Math.floor(rand() * ids.length)]);
  const t0 = performance.now();
  let stalemates = 0;
  let best: { output: BattleOutput; player: number[]; enemy: number[]; seed: number } | null = null;
  for (let i = 0; i < candidates; i++) {
    const player = pick();
    const enemy = pick();
    const battleSeed = Math.floor(rand() * 2 ** 32);
    const output = wasm.run_sandbox_battle(
      player.map((card_id) => ({ card_id })),
      enemy.map((card_id) => ({ card_id })),
      BigInt(battleSeed)
    ) as BattleOutput | null;
    // A stalemate ends on LimitExceeded after 100 clashes (~1100 events, ~8 min
    // at 1x): rare and not a representative frame load, so leave it out.
    if (!output || output.events.some((e) => e.type === 'LimitExceeded')) {
      stalemates += output ? 1 : 0;
      continue;
    }
    if (!best || output.events.length > best.output.events.length) {
      best = { output, player, enemy, seed: battleSeed };
    }
  }
  if (!best) throw new Error('sandbox produced no battle');
  const searchMs = performance.now() - t0;
  const battle: BattleOutput = { ...best.output, round: 10 };

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <ParticleBackground />
        <BattleOverlay />
      </HashRouter>
    </StrictMode>
  );

  const info: BenchInfo = {
    ready: true,
    done: false,
    candidates,
    stalemates,
    searchMs,
    events: battle.events.length,
    eventTypes: histogram(battle),
    units: {
      player: battle.initial_player_units.length,
      enemy: battle.initial_enemy_units.length,
      spawned: battle.events.filter((e) => e.type === 'UnitSpawn').length,
    },
    boards: { player: best.player, enemy: best.enemy, seed: best.seed },
    playStartedAt: 0,
    battleEndedAt: 0,
    play() {
      info.playStartedAt = performance.now();
      new MutationObserver((_, observer) => {
        if (document.querySelector('.battle-result-banner')) {
          info.done = true;
          info.battleEndedAt = performance.now();
          observer.disconnect();
        }
      }).observe(document.body, { childList: true, subtree: true });
      useGameStore.setState({ battleOutput: battle, showBattleOverlay: true });
    },
  };
  window.__BENCH__ = info;
}

void main();
