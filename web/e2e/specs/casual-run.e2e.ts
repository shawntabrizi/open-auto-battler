import { hostTest, expect } from '../fixtures';
import { connect } from '../helpers';
import { connectChain, isNoGame, PAS, type Chain } from '../chain';
import { commitTurn, playShopTurn, watchBattle, type Replay } from '../game';

// Alice's OAB product account (default subtree //Alice//oab-arena.paseo),
// funded with PAS from //Alice. Sponsored play is withheld (DEFAULT_BEHAVIORS),
// so every call is signed by the product account.
const test = hostTest({ accounts: ['alice'] });

const MAX_ROUNDS = 25;

let chain: Chain;
test.beforeAll(() => {
  chain = connectChain();
});
test.afterAll(() => chain?.destroy());

test('casual run: shop, commit, replay each battle until game over; chain agrees', async ({
  testHost,
  guard,
}) => {
  const page = testHost.page;
  const { frame, address } = await connect(testHost);

  // Preconditions on chain: gas money, and no PGAS (so the sponsor path is
  // not taken and this spec cannot drain the DOT<->PGAS pool).
  await chain.topUp(address, 5n * PAS, 20n * PAS);
  expect(await chain.pgas(address), 'product account must hold no PGAS').toBe(0n);

  // A run left by an aborted attempt resumes on the game page. Decide from
  // chain state: the arena shows an enabled Start Game before its own
  // active-game check finishes (see e2e/README.md, app findings).
  const leftover = !isNoGame(await chain.gameState(address));
  await frame.getByRole('link', { name: 'Contract Arena' }).click();
  const start = frame.getByRole('button', { name: 'Start Game' });
  const commit = frame.locator('[data-game-custom-action="true"]');
  if (!leftover) {
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await page.screenshot({ path: 'e2e/results/screens/arena.png' });
    await start.click();
  }

  await expect(commit).toBeVisible({ timeout: 4 * 60_000 });
  expect(isNoGame(await chain.gameState(address)), 'game active on chain after start').toBe(false);
  await page.screenshot({ path: 'e2e/results/screens/shop.png' });

  const replays: Replay[] = [];
  let unitsPlaced = 0;
  const gameOver = frame.getByRole('button', { name: 'New Run' });
  for (let i = 0; i < MAX_ROUNDS; i++) {
    unitsPlaced += await playShopTurn(frame);
    if (i === 0) await page.screenshot({ path: 'e2e/results/screens/shop-placed.png' });
    await commitTurn(frame);
    replays.push(
      await watchBattle(frame, page, i === 0 ? 'e2e/results/screens/battle.png' : undefined)
    );
    await expect(commit.or(gameOver)).toBeVisible({ timeout: 2 * 60_000 });
    if (await gameOver.isVisible()) break;
  }
  console.log('replays', JSON.stringify(replays), 'units placed', unitsPlaced);

  expect(unitsPlaced, 'bought and placed at least one unit').toBeGreaterThan(0);
  expect(replays.length).toBeGreaterThan(0);
  replays.forEach((r) => expect(r.logLines, `round ${r.round} log`).toBeGreaterThan(0));

  // Game over screen: Victory after 10 wins, Defeat after the last life.
  await expect(gameOver).toBeVisible();
  const outcome = frame.getByRole('heading', { level: 1 });
  await expect(outcome).toHaveText(/Victory|Defeat/);
  await page.screenshot({ path: 'e2e/results/screens/game-over.png' });
  expect(isNoGame(await chain.gameState(address)), 'game still on chain until endGame').toBe(
    false
  );

  // New Run finalizes the run on chain (endGame) and returns to the arena.
  await gameOver.click();
  await expect(start).toBeVisible({ timeout: 4 * 60_000 });
  expect(isNoGame(await chain.gameState(address)), 'getGameState empty after endGame').toBe(true);

  // Normal signing: one signature per transaction (map? + start + turns + end).
  const signed = await testHost.getSigningLog();
  expect(signed.length).toBeGreaterThanOrEqual(replays.length + 1);
  // The app asked for sponsored play once and was refused; it fell back.
  const allocations = await page.evaluate(() => window.__TEST_HOST__.getResourceAllocationLog());
  expect(allocations).toContainEqual(
    expect.objectContaining({ resource: 'SmartContractAllowance', granted: false })
  );
  console.log('signatures', signed.length, 'console lines', guard.console.length);
});
