import { hostTest, expect } from '../fixtures';
import { connect } from '../helpers';

const test = hostTest({ accounts: ['bob'] });

test('leaderboard renders from chain (entries or empty state)', async ({ testHost }) => {
  const { frame } = await connect(testHost);
  await frame.getByRole('link', { name: 'Leaderboard' }).click();

  await expect(frame.getByText('Leaderboard', { exact: true })).toBeVisible();
  // Loaded: either the table or the empty state, never the error panel.
  const table = frame.locator('table');
  const empty = frame.getByText('No ranked runs on this set yet.');
  await expect(table.or(empty)).toBeVisible({ timeout: 60_000 });
  await expect(frame.getByText('Loading…')).toHaveCount(0);
  await expect(frame.locator('.theme-error-panel')).toHaveCount(0);
  if (await table.isVisible()) {
    await expect(table.locator('tbody tr').first()).toBeVisible();
  }
  // Unbound account: told how to see its own place.
  await expect(frame.getByText(/Bind your personhood to see your own place/)).toBeVisible();
  await testHost.page.screenshot({ path: 'e2e/results/screens/leaderboard.png' });
  expect(await testHost.getSigningLog()).toEqual([]);
});

test('badges renders from chain (badges or empty state)', async ({ testHost }) => {
  const { frame } = await connect(testHost);
  await frame.getByRole('link', { name: 'Badges' }).click();

  await expect(frame.getByText('Badges', { exact: true })).toBeVisible();
  await expect(frame.getByText(/Badges are soulbound NFTs/)).toBeVisible();
  await expect(frame.getByText('Loading…')).toHaveCount(0, { timeout: 60_000 });
  await expect(frame.locator('.theme-error-panel')).toHaveCount(0);
  await expect(frame.getByText('No badges yet. Win a ranked run to earn one.')).toBeVisible();
  await testHost.page.screenshot({ path: 'e2e/results/screens/badges.png' });
  expect(await testHost.getSigningLog()).toEqual([]);
});
