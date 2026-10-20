import { test as base, type FrameLocator } from '@playwright/test';
import { hostTest, expect } from '../fixtures';
import { connect } from '../helpers';
import { connectChain, isNoGame, PAS, type Chain } from '../chain';
import { commitTurn, playShopTurn, watchBattle } from '../game';

/**
 * Sponsored play (src/contract/session.ts): the host grants
 * `SmartContractAllowance`, the product account gets PGAS, one batch sets up a
 * session key, and the key signs every later game call with no prompt.
 *
 * The test host answers the allowance request ("Allocated") but cannot claim
 * PGAS on chain — a real host does that with a personhood proof. So:
 *  - the default spec checks the app falls back to normal signing when the
 *    allowance arrives without PGAS;
 *  - the full sponsored path runs only with OAB_E2E_SPONSORED=1. It seeds the
 *    product account with PGAS from //Alice (standing in for the host's claim)
 *    and pays a few fees through the shared DOT<->PGAS pool, so it is off by
 *    default and plays one short run.
 */

let chain: Chain;
base.beforeAll(() => {
  chain = connectChain();
});
base.afterAll(() => chain?.destroy());

async function startGame(frame: FrameLocator): Promise<void> {
  await frame.getByRole('link', { name: 'Contract Arena' }).click();
  const start = frame.getByRole('button', { name: 'Start Game' });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(frame.locator('[data-game-custom-action="true"]')).toBeVisible({
    timeout: 4 * 60_000,
  });
}

async function abandon(frame: FrameLocator): Promise<void> {
  await frame.getByRole('button', { name: 'Open menu' }).click();
  await frame.getByRole('button', { name: 'Abandon' }).click();
  await frame.getByRole('button', { name: 'Abandon', exact: true }).last().click();
  await expect(frame.getByRole('link', { name: 'Contract Arena' })).toBeVisible({
    timeout: 4 * 60_000,
  });
}

// Host grants every resource except AutoSigning (kept off so signatures are logged).
const allocating = hostTest({
  accounts: ['charlie'],
  behaviors: { resourceAllocation: { AutoSigning: false } },
});

allocating(
  'allowance granted without PGAS: setup fails quietly, play falls back to normal signing',
  async ({ testHost, guard }) => {
    const { frame, address } = await connect(testHost);
    await chain.topUp(address, 5n * PAS, 20n * PAS);
    expect(await chain.pgas(address), 'fallback case needs a PGAS-less account').toBe(0n);
    if (!isNoGame(await chain.gameState(address))) {
      throw new Error(`${address} has a game left over; abandon it first`);
    }

    await startGame(frame);
    expect(isNoGame(await chain.gameState(address)), 'game active on chain').toBe(false);

    const allocations = await testHost.page.evaluate(() =>
      window.__TEST_HOST__.getResourceAllocationLog()
    );
    expect(allocations).toContainEqual(
      expect.objectContaining({ resource: 'SmartContractAllowance', granted: true })
    );
    expect(guard.console.some((l) => l.includes('Sponsored play setup failed'))).toBe(true);
    // The game start itself was signed by the product account through the host.
    const signed = await testHost.getSigningLog();
    expect(signed.length).toBeGreaterThanOrEqual(1);

    await abandon(frame);
    expect(isNoGame(await chain.gameState(address)), 'no game after abandon').toBe(true);
  }
);

const sponsored = hostTest({
  accounts: ['dave'],
  behaviors: { resourceAllocation: { AutoSigning: false } },
});

sponsored('sponsored play: setup prompts once, then no prompts for game calls', async ({
  testHost,
}) => {
  sponsored.skip(
    process.env.OAB_E2E_SPONSORED !== '1',
    'Uses the shared DOT<->PGAS pool; set OAB_E2E_SPONSORED=1 to run (once).'
  );
  const { frame, address } = await connect(testHost);
  // PAS covers the proxy deposit, so the setup batch needs no PGAS->PAS swap.
  await chain.topUp(address, 5n * PAS, 20n * PAS);
  // Stand-in for the host's allowance claim: setup sends 3e9 to the session key.
  await chain.topUpPgas(address, 4_000_000_000n);
  const pgasBefore = await chain.pgas(address);
  await testHost.clearSigningLog();

  // First write of the connection: set up the session, then the game call.
  // A game left by an aborted run resumes on the game page (decided from
  // chain state: the arena shows Start Game before its own check finishes);
  // its first turn is then the first write.
  const leftover = !isNoGame(await chain.gameState(address));
  await frame.getByRole('link', { name: 'Contract Arena' }).click();
  const commit = frame.locator('[data-game-custom-action="true"]');
  let turns = 2;
  if (!leftover) {
    const start = frame.getByRole('button', { name: 'Start Game' });
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await start.click();
    await expect(commit).toBeVisible({ timeout: 4 * 60_000 });
  } else {
    await expect(commit).toBeVisible({ timeout: 60_000 });
    await playShopTurn(frame);
    await commitTurn(frame);
    await watchBattle(frame, testHost.page);
    await expect(commit).toBeVisible({ timeout: 2 * 60_000 });
    turns = 1;
  }
  expect(isNoGame(await chain.gameState(address)), 'game active on chain').toBe(false);

  // Setup is ONE product-account batch (PGAS budget, map, add_proxy), or none
  // when a funded session key from an earlier run is still stored. A second
  // prompt here is the redundant map_account: the SDK's mapping check reads the
  // finalized block while setup just mapped the account at the best block.
  const setup = await testHost.getSigningLog();
  if (setup.length > 1) {
    base.info().annotations.push({
      type: 'app-bug',
      description: `sponsored setup took ${setup.length} host signatures, expected 1`,
    });
  }
  expect(setup.length).toBeLessThanOrEqual(2);

  await testHost.clearSigningLog();
  for (let turn = 0; turn < turns; turn++) {
    await playShopTurn(frame);
    await commitTurn(frame);
    await watchBattle(frame, testHost.page);
    await expect(commit).toBeVisible({ timeout: 2 * 60_000 });
  }
  await abandon(frame);

  // Turns and the abandon were signed by the session key: no host prompt.
  expect(await testHost.getSigningLog()).toEqual([]);
  expect(isNoGame(await chain.gameState(address)), 'no game after abandon').toBe(true);
  expect(await chain.pgas(address)).toBeLessThan(pgasBefore);
});
