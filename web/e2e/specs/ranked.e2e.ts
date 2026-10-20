import { hostTest, expect } from '../fixtures';
import { connect, productFrameHandle, watchForText } from '../helpers';

// Bob's OAB product account has no personhood binding (checked live below).
const test = hostTest({ accounts: ['bob'] });

test('ranked start without personhood: explains why, no signing prompt', async ({ testHost }) => {
  const { frame } = await connect(testHost);
  await frame.getByRole('link', { name: 'Contract Arena' }).click();
  await expect(frame.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 60_000 });

  await testHost.clearSigningLog();
  const sawSigningOverlay = await watchForText(
    productFrameHandle(testHost),
    'Starting Ranked Game'
  );

  await frame.getByRole('button', { name: 'Ranked' }).click();

  // The not-bound explanation (eligibilityMessage 'not-bound' in personhood.ts).
  await expect(frame.getByText(/Ranked play needs proof of personhood/)).toBeVisible({
    timeout: 60_000,
  });
  // A host account is offered the bind action.
  await expect(frame.getByRole('button', { name: 'Bind personhood' })).toBeVisible();

  // The gate is a read: no signature, no allowance request, no tx overlay.
  expect(await testHost.getSigningLog()).toEqual([]);
  expect(
    await testHost.page.evaluate(() => window.__TEST_HOST__.getResourceAllocationLog())
  ).toEqual([]);
  expect(await sawSigningOverlay()).toBe(false);
  // Still on the arena page: no game was started.
  await expect(frame.getByRole('button', { name: 'Start Game' })).toBeVisible();
});
