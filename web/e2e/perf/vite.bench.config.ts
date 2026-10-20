/**
 * Production build of the battle bench (e2e/perf/bench). Reuses the app's Vite
 * config (plugins, aliases, wasm) so the bench renders exactly the shipped
 * components in production React.
 *
 * OAB_BENCH_VARIANT:
 *  - `shipped` (default): src/ as is.
 *  - `depsfix`: BattleArena's event effect without `playerBoard` and
 *    `enemyBoard` in its dependency list (the list before commit d38bad2).
 *    With them, an event that maps a board re-runs its own effect forever.
 *    This variant measures what the DOM renderer costs once that is fixed.
 *    It changes the bench build only, never src/.
 */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import path from 'path';
import appConfig from '../../vite.config';

const variant = process.env.OAB_BENCH_VARIANT ?? 'shipped';
if (!['shipped', 'depsfix'].includes(variant)) {
  throw new Error(`Unknown OAB_BENCH_VARIANT ${variant}`);
}

function battleArenaDepsFix(): Plugin {
  return {
    name: 'oab-bench-battlearena-depsfix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/components/BattleArena.tsx')) return null;
      const fixed = code
        .replace('    enemyBoard,\n    eventIndex,\n', '    eventIndex,\n')
        .replace('    playerBoard,\n    reducedAnimations,\n', '    reducedAnimations,\n');
      if (fixed.length !== code.length - '    enemyBoard,\n'.length - '    playerBoard,\n'.length) {
        throw new Error('depsfix: BattleArena dependency list not found; update the bench patch');
      }
      return fixed;
    },
  };
}

export default mergeConfig(
  appConfig,
  defineConfig({
    root: path.resolve(__dirname, 'bench'),
    plugins: variant === 'depsfix' ? [battleArenaDepsFix()] : [],
    build: {
      outDir: path.resolve(__dirname, `../results/bench-dist/${variant}`),
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        'oab-client': path.resolve(__dirname, '../../src/wasm'),
      },
    },
  })
);
