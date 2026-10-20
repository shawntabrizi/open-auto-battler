import { defineConfig } from '@playwright/test';

/**
 * Battle replay performance harness. See e2e/README.md.
 *
 * Serves a production build of e2e/perf/bench (the app's BattleOverlay fed a
 * synthetic battle from the WASM sandbox) and measures it under CPU throttling
 * at a phone viewport. No chain or host involved.
 */
const PORT = Number(process.env.OAB_BENCH_PORT ?? 4318);
export const BENCH_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e/perf',
  testMatch: /.*\.perf\.ts/,
  outputDir: './e2e/results/perf-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 15 * 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    baseURL: BENCH_URL,
    // performance.memory reports real (not bucketed) values with this flag.
    launchOptions: { args: ['--enable-precise-memory-info'] },
  },
  webServer: {
    // Two bench builds (see e2e/perf/vite.bench.config.ts), served side by side.
    command: [
      ...(process.env.OAB_E2E_SKIP_BUILD
        ? []
        : [
            'OAB_BENCH_VARIANT=shipped npx vite build --config e2e/perf/vite.bench.config.ts',
            'OAB_BENCH_VARIANT=depsfix npx vite build --config e2e/perf/vite.bench.config.ts',
          ]),
      `npx vite preview --config e2e/perf/vite.bench.config.ts --outDir ../../results/bench-dist --port ${PORT} --strictPort`,
    ].join(' && '),
    url: `${BENCH_URL}/shipped/`,
    reuseExistingServer: !process.env.CI,
    timeout: 5 * 60_000,
  },
});
