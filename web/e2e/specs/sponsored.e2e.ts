import { test as base, type FrameLocator } from '@playwright/test';
import { hostTest, expect } from '../fixtures';
import { connect } from '../helpers';
import { connectChain, PAS, type Chain } from '../chain';
import { commitTurn, playShopTurn, watchBattle } from '../game';

/**
 * Sponsored play with a registry session (src/contract/registrySession.ts):
 * the host grants `SmartContractAllowance`, the product account gets PGAS,
 * ONE product-account batch funds a session key and offers it in
 * `@oab/identity`, and the key signs every later game call on pipeline V1
 * (fee in PGAS) with no prompt. Its first call carries `acceptSession`.
 *
 * The test host answers the allowance request ("Allocated") but cannot claim
 * PGAS on chain (a real host does that with a personhood proof). So:
 *  - the default spec checks that the app falls back to normal signing when
 *    the allowance arrives without PGAS, and sends no setup transaction;
 *  - the full session path runs only with OAB_E2E_SESSION=1. It seeds the
 *    product account with PGAS from //Alice (standing in for the host's
 *    claim). It needs about 1.75 G PGAS (1.5 G session budget, 206.4 M owner
 *    record, fees), which no dev account holds on 2026-10-20.
 *
 * Limit: `@parity/host-api-test-sdk` 0.17 signs every host transaction as a
 * classic v4 (pipeline V0, native fee) whatever `txExtVersion` says, so the
 * setup batch here is V0. The session key signs V1 in the app itself.
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
  'allowance granted without PGAS: no setup transaction, play falls back to normal signing',
  async ({ testHost, guard }) => {
    const { frame, address } = await connect(testHost);
    await chain.topUp(address, 5n * PAS, 20n * PAS);
    expect(await chain.pgas(address), 'fallback case needs a PGAS-less account').toBe(0n);
    if ((await chain.game(address)) !== null) {
      throw new Error(`${address} has a game left over; abandon it first`);
    }
    await testHost.clearSigningLog();

    await startGame(frame);
    expect(await chain.game(address), 'game active on chain').not.toBeNull();

    const allocations = await testHost.page.evaluate(() =>
      window.__TEST_HOST__.getResourceAllocationLog()
    );
    expect(allocations).toContainEqual(
      expect.objectContaining({ resource: 'SmartContractAllowance', granted: true })
    );
    // The setup refused before it built a transaction: not enough PGAS.
    expect(
      guard.console.some(
        (l) => l.includes('Sponsored play setup failed') && l.includes('Not enough PGAS')
      )
    ).toBe(true);
    // Only the game start was signed (plus map_account on a first run): the
    // setup batch never reached the host.
    const signed = await testHost.getSigningLog();
    expect(signed.length).toBeGreaterThanOrEqual(1);
    expect(signed.length).toBeLessThanOrEqual(2);

    await abandon(frame);
    expect(await chain.game(address), 'no game after abandon').toBeNull();
  }
);

const sponsored = hostTest({
  accounts: ['dave'],
  behaviors: { resourceAllocation: { AutoSigning: false } },
});

sponsored(
  'registry session: setup prompts once, then the key plays with no prompts',
  async ({ testHost }) => {
    sponsored.skip(
      process.env.OAB_E2E_SESSION !== '1',
      'Needs about 1.75 G PGAS from //Alice; set OAB_E2E_SESSION=1 to run.'
    );
    const { frame, address } = await connect(testHost);
    await chain.topUp(address, 5n * PAS, 20n * PAS);
    // Stand-in for the host's allowance claim.
    await chain.topUpPgas(address, 1_800_000_000n);
    const pgasBefore = await chain.pgas(address);
    expect((await chain.game(address)) === null, 'no leftover game').toBe(true);
    await testHost.clearSigningLog();

    // First write of the connection: the setup batch (one prompt), then the
    // session key's first call: batch_all[acceptSession, startGame], silent.
    await startGame(frame);
    expect(await chain.game(address), 'the key started the PLAYER game').not.toBeNull();
    const setup = await testHost.getSigningLog();
    expect(setup.length, 'setup is one host prompt').toBe(1);

    await testHost.clearSigningLog();
    for (let turn = 0; turn < 2; turn++) {
      await playShopTurn(frame);
      await commitTurn(frame);
      await watchBattle(frame, testHost.page);
      await expect(frame.locator('[data-game-custom-action="true"]')).toBeVisible({
        timeout: 2 * 60_000,
      });
    }
    await abandon(frame);

    // Turns and the abandon were signed by the session key: no host prompt.
    expect(await testHost.getSigningLog()).toEqual([]);
    expect(await chain.game(address), 'no game after abandon').toBeNull();
    expect(await chain.pgas(address)).toBeLessThan(pgasBefore);
  }
);
