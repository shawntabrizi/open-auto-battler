/**
 * Shared Playwright fixtures: the TrUAPI test host (from
 * `@parity/host-api-test-sdk`) with OAB's product identity, plus a page guard
 * that fails a test on any uncaught page error or CSP violation.
 */
import { test as base, expect, type Page } from '@playwright/test';
import {
  createTestHostFixture,
  PASEO_ASSET_HUB,
  type TestHost,
} from '@parity/host-api-test-sdk/playwright';
import type { Account, HexString, InitialBehaviors } from '@parity/host-api-test-sdk';

/** Must equal `PRODUCT_ID` in src/contract/personhood.ts: the core refuses signing for another id. */
export const PRODUCT_ID = 'oab-arena.paseo';
export const PRODUCT_URL = `http://localhost:${process.env.OAB_E2E_PORT ?? 4317}`;

/**
 * A strict same-origin CSP put on the product document. A real host sandbox
 * blocks cross-origin loads (see host-sdk `IFRAME_CSP*`); the exact policy
 * differs per host, so this checks the property every host shares: the
 * product loads nothing from another origin. Chain traffic goes through the
 * host, so `connect-src 'self'` is enough.
 */
export const PRODUCT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
].join('; ');

/** Asset Hub Next with the genesis read live in global-setup.ts. */
export function assetHubNext() {
  const genesisHash = process.env.OAB_E2E_GENESIS as HexString | undefined;
  if (!genesisHash) throw new Error('OAB_E2E_GENESIS unset: global-setup.ts did not run');
  return { ...PASEO_ASSET_HUB, genesisHash };
}

export interface HostOptions {
  /** Active identity first. */
  accounts?: Account[];
  /** The subtree the core derives OAB's product accounts from. */
  productSubtree?: Account;
  behaviors?: InitialBehaviors;
}

/**
 * Default behaviors: withhold `AutoSigning` (so every signature reaches the
 * signing log) and `SmartContractAllowance` (so no spec claims PGAS or sets
 * up sponsored play unless it opts in).
 */
export const DEFAULT_BEHAVIORS: InitialBehaviors = {
  resourceAllocation: { AutoSigning: false, SmartContractAllowance: false },
};

interface Problem {
  kind: 'pageerror' | 'csp';
  text: string;
}

export interface Guard {
  problems: Problem[];
  /** Console lines of the run, newest last (for failure messages). */
  console: string[];
}

function attachGuard(page: Page, guard: Guard): void {
  page.on('pageerror', (err) => guard.problems.push({ kind: 'pageerror', text: String(err) }));
  page.on('console', (msg) => {
    const text = msg.text();
    guard.console.push(`[${msg.type()}] ${text}`);
    if (text.startsWith('[csp-violation]') || /Refused to (load|connect|execute|apply)/.test(text)) {
      guard.problems.push({ kind: 'csp', text });
    }
  });
}

/** Build a `test` bound to one host configuration. */
export function hostTest(opts: HostOptions = {}) {
  // Built per test, not at import: the genesis is only known after global setup.
  const testHost = async ({ page }: { page: Page }, use: (host: TestHost) => Promise<void>) => {
    const fixture = createTestHostFixture({
      productUrl: PRODUCT_URL,
      productId: PRODUCT_ID,
      accounts: opts.accounts ?? ['bob'],
      networks: [assetHubNext()],
      productAccounts: opts.productSubtree ? { [PRODUCT_ID]: opts.productSubtree } : undefined,
      behaviors: opts.behaviors ?? DEFAULT_BEHAVIORS,
    });
    await fixture.testHost({ page }, use);
  };

  return base.extend<{ guard: Guard; testHost: TestHost }>({
    guard: [
      async ({ page }, use) => {
        const guard: Guard = { problems: [], console: [] };
        attachGuard(page, guard);
        // Report CSP violations from every frame (the product is an iframe).
        await page.addInitScript(() => {
          document.addEventListener('securitypolicyviolation', (e) => {
            console.error(`[csp-violation] ${e.violatedDirective} blocked ${e.blockedURI}`);
          });
        });
        // Serve the product document with the strict CSP.
        await page.route(`${PRODUCT_URL}/**`, async (route) => {
          if (route.request().resourceType() !== 'document') return route.continue();
          const response = await route.fetch();
          await route.fulfill({
            response,
            headers: { ...response.headers(), 'content-security-policy': PRODUCT_CSP },
          });
        });
        await use(guard);
        expect(
          guard.problems,
          `Uncaught page errors or CSP violations:\n${guard.problems.map((p) => `${p.kind}: ${p.text}`).join('\n')}`
        ).toEqual([]);
      },
      { auto: true },
    ],
    testHost,
  });
}

export { expect };
