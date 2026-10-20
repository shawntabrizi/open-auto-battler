/**
 * Production build of the battle bench (e2e/perf/bench). Reuses the app's Vite
 * config (plugins, aliases, wasm) so the bench renders exactly the shipped
 * components in production React.
 *
 * OAB_BENCH_VARIANT: `shipped` (default), src/ as is.
 */
import { defineConfig, mergeConfig } from 'vite';
import path from 'path';
import appConfig from '../../vite.config';

const variant = process.env.OAB_BENCH_VARIANT ?? 'shipped';
if (!['shipped'].includes(variant)) {
  throw new Error(`Unknown OAB_BENCH_VARIANT ${variant}`);
}

export default mergeConfig(
  appConfig,
  defineConfig({
    root: path.resolve(__dirname, 'bench'),
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
