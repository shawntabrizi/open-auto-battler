import { defineConfig, devices } from '@playwright/test';

/**
 * E2E + perf harness for OAB. See e2e/README.md.
 *
 * The product is served from a production build (`vite preview`), so the UI
 * specs and the perf numbers measure what ships, not React dev mode.
 */
const PORT = Number(process.env.OAB_E2E_PORT ?? 4317);
export const PRODUCT_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/results/artifacts',
  // Chain state is shared (one product account per spec, one nonce stream).
  fullyParallel: false,
  workers: 1,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './e2e/results/html', open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'e2e', testMatch: /specs\/.*\.e2e\.ts/ }],
  webServer: {
    command: process.env.OAB_E2E_SKIP_BUILD
      ? `npx vite preview --port ${PORT} --strictPort`
      : `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: PRODUCT_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 5 * 60_000,
  },
});
