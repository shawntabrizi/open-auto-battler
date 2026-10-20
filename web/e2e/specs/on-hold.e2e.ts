import { hostTest, expect } from '../fixtures';
import { connect } from '../helpers';

// Ranked play, personhood, the leaderboard, and badges are on hold until
// Records (M4). The casual arena has none of them, so the app must not offer
// them: a link would lead to a page whose contract calls do not exist.
const test = hostTest({ accounts: ['bob'] });

test('on hold: no ranked, leaderboard, or badge entry points; old links go home', async ({
  testHost,
}) => {
  const { frame } = await connect(testHost);
  for (const name of ['Leaderboard', 'Badges']) {
    await expect(frame.getByRole('link', { name })).toHaveCount(0);
  }

  await frame.getByRole('link', { name: 'Contract Arena' }).click();
  await expect(frame.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 60_000 });
  await expect(frame.getByRole('button', { name: 'Ranked' })).toHaveCount(0);
  await expect(frame.getByText(/personhood/i)).toHaveCount(0);
  for (const name of ['Leaderboard', 'Badges']) {
    await expect(frame.getByRole('link', { name })).toHaveCount(0);
  }

  // A saved link to a removed page lands on the menu, not on an error.
  const product = testHost.page.frames().find((f) => f.url().includes('#/contract'));
  if (!product) throw new Error('product frame not found');
  for (const path of ['leaderboard', 'badges']) {
    await product.evaluate((p) => (window.location.hash = `#/contract/${p}`), path);
    await expect(frame.getByRole('link', { name: 'Contract Arena' })).toBeVisible();
  }
  expect(await testHost.getSigningLog()).toEqual([]);
});
