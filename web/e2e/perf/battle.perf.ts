/**
 * Battle replay performance at a phone viewport under CPU throttling.
 *
 * For each bench variant (`shipped`: see vite.bench.config.ts) and
 * throttle rate: load the bench, sample every requestAnimationFrame timestamp,
 * long task, JS heap value and replay progress, play the busiest synthetic
 * battle at the default 1x speed, and summarise. A separate, short pass records
 * a Chrome trace per variant and rate (tracing is heavy, so it never overlaps a
 * measured window).
 *
 * Output in e2e/results/perf/: summary.json, one JSON per run, trace-*.json,
 * and a video/GIF of the replay. A table is printed at the end.
 *
 * Env: OAB_PERF_RATES ("1,4,6"), OAB_PERF_VARIANTS ("shipped"),
 * OAB_PERF_CANDIDATES (600), OAB_PERF_MAX_S (120, measured window cap),
 * OAB_PERF_TRACE_S (15, 0 = no traces), OAB_PERF_VIDEO (1).
 */
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, expect, type CDPSession, type Page } from '@playwright/test';
import type { BenchInfo } from './bench/main';

const OUT = 'e2e/results/perf';
const list = (v: string | undefined, d: string) => (v ?? d).split(',').filter(Boolean);
const RATES = list(process.env.OAB_PERF_RATES, '1,4,6').map(Number);
const VARIANTS = list(process.env.OAB_PERF_VARIANTS, 'shipped');
const CANDIDATES = Number(process.env.OAB_PERF_CANDIDATES ?? 600);
const MAX_MS = Number(process.env.OAB_PERF_MAX_S ?? 120) * 1000;
const TRACE_MS = Number(process.env.OAB_PERF_TRACE_S ?? 15) * 1000;
const PHONE = { width: 390, height: 844 };
const DPR = 3;
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'v8.execute',
  'blink.user_timing',
  'latencyInfo',
].join(',');

interface Samples {
  frames: number[];
  longTasks: Array<{ start: number; duration: number }>;
  heap: number[];
}

declare global {
  interface Window {
    __PERF__: Samples;
    __PERF_STOP__?: boolean;
  }
}

export interface RunResult {
  variant: string;
  cpuThrottle: number;
  viewport: string;
  battle: { events: number; units: BenchInfo['units']; eventTypes: Record<string, number> };
  durationS: number;
  /** True when the window cap cut the battle short. */
  capped: boolean;
  /** Battle log rows shown by the end of the window: replay progress. */
  logRows: number;
  frames: number;
  fps: number;
  frameMs: { p50: number; p95: number; p99: number; max: number };
  /** Frames over 1.5x / 3x a 60 Hz budget. */
  jankyFrames: { over25ms: number; over50ms: number };
  longTasks: { count: number; totalMs: number; maxMs: number };
  heapMB: { start: number; peak: number; end: number };
  /** Main-thread time per wall second, from CDP Performance metrics. */
  mainThreadBusyPct: number;
  cdp: Record<string, number>;
}

const results: RunResult[] = [];

const pct = (sorted: number[], p: number) =>
  sorted.length === 0
    ? 0
    : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const mb = (bytes: number) => round(bytes / 2 ** 20);

async function cdpMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

async function recordTrace(cdp: CDPSession, page: Page, ms: number, file: string): Promise<void> {
  await cdp.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReturnAsStream' });
  await page.waitForTimeout(ms);
  const complete = new Promise<string>((resolve) =>
    cdp.once('Tracing.tracingComplete', (e) => resolve(e.stream as string))
  );
  await cdp.send('Tracing.end');
  const handle = await complete;
  const out = createWriteStream(file);
  for (;;) {
    const chunk = await cdp.send('IO.read', { handle, size: 1 << 20 });
    out.write(chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data);
    if (chunk.eof) break;
  }
  await cdp.send('IO.close', { handle });
  await new Promise<void>((resolve) => out.end(resolve));
}

async function openBench(page: Page, variant: string): Promise<BenchInfo> {
  await page.goto(`/${variant}/?candidates=${CANDIDATES}&seed=1`);
  await page.waitForFunction(() => window.__BENCH__?.ready, null, { timeout: 120_000 });
  // JSON round trip: drops the play() function, keeps the data.
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__BENCH__)) as BenchInfo);
}

async function throttled(page: Page, rate: number): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

test.use({ viewport: PHONE, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

for (const variant of VARIANTS) {
  for (const rate of RATES) {
    test(`${variant}: battle replay, ${rate}x CPU, ${PHONE.width}x${PHONE.height}@${DPR}x`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const bench = await openBench(page, variant);
      expect(bench.units.player).toBe(5);
      expect(bench.units.enemy).toBe(5);
      const cdp = await throttled(page, rate);

      await page.evaluate(() => {
        const s: Samples = { frames: [], longTasks: [], heap: [] };
        window.__PERF__ = s;
        const mem = () =>
          (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const stop = () => window.__BENCH__.done || window.__PERF_STOP__;
        const loop = (t: number) => {
          s.frames.push(t);
          if (!stop()) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            s.longTasks.push({ start: e.startTime, duration: e.duration });
          }
        }).observe({ type: 'longtask' });
        const heapTimer = setInterval(() => {
          const m = mem();
          if (m) s.heap.push(m.usedJSHeapSize);
          if (stop()) clearInterval(heapTimer);
        }, 250);
        const m = mem();
        if (m) s.heap.push(m.usedJSHeapSize);
        window.__BENCH__.play();
      });
      const before = await cdpMetrics(cdp);
      const wallStart = Date.now();

      // Until the result banner, or the cap (wall clock, from Node: a busy
      // page cannot delay it).
      const deadline = wallStart + MAX_MS;
      while (Date.now() < deadline) {
        if (await page.evaluate(() => window.__BENCH__.done)) break;
        await page.waitForTimeout(1000);
      }
      const { samples, start, end, capped, logRows } = await page.evaluate(() => {
        window.__PERF_STOP__ = true;
        return {
          samples: window.__PERF__,
          start: window.__BENCH__.playStartedAt,
          end: window.__BENCH__.battleEndedAt || performance.now(),
          capped: !window.__BENCH__.done,
          logRows: document.querySelectorAll('.battle-log > div.truncate').length,
        };
      });
      const after = await cdpMetrics(cdp);
      const wallS = (Date.now() - wallStart) / 1000;
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

      const frames = samples.frames.filter((t) => t >= start && t <= end);
      const intervals = frames.slice(1).map((t, i) => t - frames[i]);
      const sorted = [...intervals].sort((a, b) => a - b);
      const tasks = samples.longTasks.filter((t) => t.start >= start && t.start <= end);
      const delta = (k: string) => round((after[k] ?? 0) - (before[k] ?? 0), 2);

      const r: RunResult = {
        variant,
        cpuThrottle: rate,
        viewport: `${PHONE.width}x${PHONE.height}@${DPR}x`,
        battle: { events: bench.events, units: bench.units, eventTypes: bench.eventTypes },
        durationS: round((end - start) / 1000),
        capped,
        logRows,
        frames: frames.length,
        fps: round((frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1000)),
        frameMs: {
          p50: round(pct(sorted, 50)),
          p95: round(pct(sorted, 95)),
          p99: round(pct(sorted, 99)),
          max: round(sorted[sorted.length - 1] ?? 0),
        },
        jankyFrames: {
          over25ms: intervals.filter((d) => d > 25).length,
          over50ms: intervals.filter((d) => d > 50).length,
        },
        longTasks: {
          count: tasks.length,
          totalMs: round(tasks.reduce((n, t) => n + t.duration, 0)),
          maxMs: round(Math.max(0, ...tasks.map((t) => t.duration))),
        },
        heapMB: {
          start: mb(samples.heap[0] ?? 0),
          peak: mb(Math.max(0, ...samples.heap)),
          end: mb(samples.heap[samples.heap.length - 1] ?? 0),
        },
        mainThreadBusyPct: round((100 * delta('TaskDuration')) / wallS),
        cdp: {
          ScriptDurationS: delta('ScriptDuration'),
          LayoutDurationS: delta('LayoutDuration'),
          RecalcStyleDurationS: delta('RecalcStyleDuration'),
          TaskDurationS: delta('TaskDuration'),
          LayoutCount: delta('LayoutCount'),
          RecalcStyleCount: delta('RecalcStyleCount'),
          Nodes: after.Nodes ?? 0,
        },
      };
      results.push(r);
      writeFileSync(
        `${OUT}/battle-${variant}-${rate}x.json`,
        JSON.stringify({ bench, ...r }, null, 2)
      );
      expect(errors, 'no page errors during the replay').toEqual([]);
      expect(frames.length).toBeGreaterThan(10);
    });
  }
}

test.afterAll(() => {
  if (results.length === 0) return;
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 2));
  const b = results[0].battle;
  console.log(
    `\nBusiest battle: ${b.events} events, 5v5 (+${b.units.spawned} spawns), ${JSON.stringify(b.eventTypes)}`
  );
  console.table(
    results.map((r) => ({
      variant: r.variant,
      cpu: `${r.cpuThrottle}x`,
      'window s': r.capped ? `${r.durationS} (cap)` : r.durationS,
      'log rows': r.logRows,
      fps: r.fps,
      'p95 ms': r.frameMs.p95,
      'p99 ms': r.frameMs.p99,
      'max ms': r.frameMs.max,
      '>50ms': r.jankyFrames.over50ms,
      'long tasks': r.longTasks.count,
      'busy %': r.mainThreadBusyPct,
      'heap MB s/p/e': `${r.heapMB.start}/${r.heapMB.peak}/${r.heapMB.end}`,
    }))
  );
  console.log(`JSON: ${OUT}/summary.json`);
});

/** Chrome traces: a short window per variant and rate, apart from the measured runs. */
for (const variant of VARIANTS) {
  test(`${variant}: trace ${TRACE_MS / 1000}s per rate`, async ({ page }) => {
    test.skip(TRACE_MS === 0, 'OAB_PERF_TRACE_S=0');
    for (const rate of RATES) {
      await openBench(page, variant);
      const cdp = await throttled(page, rate);
      await page.evaluate(() => window.__BENCH__.play());
      await recordTrace(cdp, page, TRACE_MS, `${OUT}/trace-${variant}-${rate}x.json`);
      await cdp.detach();
    }
  });
}

/** Not a measurement: a video (and GIF when ffmpeg exists) of the replay. */
test('record battle replay video', async ({ browser }) => {
  test.skip(process.env.OAB_PERF_VIDEO === '0', 'OAB_PERF_VIDEO=0');
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: `${OUT}/video-tmp`, size: PHONE },
  });
  const page = await context.newPage();
  await openBench(page, VARIANTS[0]);
  await page.evaluate(() => window.__BENCH__.play());
  await page.waitForTimeout(8_000);
  await page.screenshot({ path: `${OUT}/battle-mid.png` });
  // 45 s of live replay, then skip to the result banner.
  await page.waitForTimeout(37_000);
  await page.getByTitle('Skip to end').click();
  await page.waitForFunction(() => window.__BENCH__.done, null, { timeout: 60_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${OUT}/battle-end.png` });
  const video = page.video();
  await context.close();
  const webm = `${OUT}/battle.webm`;
  await video?.saveAs(webm);
  try {
    // 40 s excerpt at 2x speed, 10 fps, 300 px wide.
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      webm,
      '-t',
      '40',
      '-vf',
      'setpts=0.5*PTS,fps=10,scale=300:-1:flags=lanczos',
      `${OUT}/battle.gif`,
    ]);
  } catch {
    console.log('ffmpeg not available: kept battle.webm only');
  }
});
