import { hostTest, expect } from '../fixtures';

const test = hostTest({ accounts: ['bob'] });

test('connect: permission approved, host account shown, nothing signed', async ({ testHost }) => {
  await testHost.waitForConnection(60_000);
  const frame = testHost.productFrame();

  await frame.getByRole('button', { name: 'CONNECT' }).click();

  const account = frame.getByTestId('account-option');
  await expect(account).toHaveCount(1, { timeout: 60_000 });
  await expect(account).toContainText('Host');
  const address = await account.getAttribute('data-address');
  expect(address, 'connected account has an SS58 address').toMatch(/^[1-9A-HJ-NP-Za-km-z]{46,48}$/);

  // The game menu is open only once connected.
  await expect(frame.getByRole('link', { name: 'Contract Arena' })).toBeVisible();

  // Every permission the product asked for was approved.
  const permissions = await testHost.getPermissionLog();
  expect(permissions.every((p) => p.approved)).toBe(true);

  // connect() must be transaction-free (see src/contract/index.ts).
  expect(await testHost.getSigningLog()).toEqual([]);
});
