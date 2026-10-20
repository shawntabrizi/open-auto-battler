import { hostTest, expect } from '../fixtures';
import { connect } from '../helpers';
import { connectChain, PAS, type Chain } from '../chain';
import { commitTurn, playShopTurn, watchBattle, type BattleResult, type Replay } from '../game';
import type { ModeGameInfo } from '../../src/contract/codec';

// Alice's OAB product account (default subtree //Alice//oab-arena.paseo),
// funded with PAS from //Alice. Sponsored play is withheld (DEFAULT_BEHAVIORS),
// so every call is signed by the product account on pipeline V0 (native fee).
const test = hostTest({ accounts: ['alice'] });

const MAX_ROUNDS = 25;

let chain: Chain;
test.beforeAll(() => {
  chain = connectChain();
});
test.afterAll(() => chain?.destroy());

/** The battle result the chain recorded: the change in wins and lives. */
function chainResult(before: ModeGameInfo, after: ModeGameInfo): BattleResult {
  if (after.wins === before.wins + 1 && after.lives === before.lives) return 'VICTORY!';
  if (after.lives === before.lives - 1 && after.wins === before.wins) return 'DEFEAT';
  if (after.wins === before.wins && after.lives === before.lives) return 'DRAW';
  throw new Error(
    `impossible change ${JSON.stringify([before, after], (_, v: unknown) => (typeof v === 'bigint' ? `${v}` : v))}`
  );
}

test('casual run: shop, commit, replay each battle until game over; chain agrees', async ({
  testHost,
  guard,
}) => {
  const page = testHost.page;
  const { frame, address } = await connect(testHost);

  // Preconditions on chain: gas money, and no PGAS (so no sponsored session
  // is set up and the run spends no PGAS: deposits come from PGAS when an
  // account holds it).
  await chain.topUp(address, 5n * PAS, 20n * PAS);
  expect(await chain.pgas(address), 'product account must hold no PGAS').toBe(0n);

  // A run left by an aborted attempt resumes on the game page. Decide from
  // chain state: the arena shows an enabled Start Game before its own
  // active-game check finishes (see e2e/README.md, app findings).
  const leftover = (await chain.game(address)) !== null;
  await frame.getByRole('link', { name: 'Contract Arena' }).click();
  const start = frame.getByRole('button', { name: 'Start Game' });
  const commit = frame.locator('[data-game-custom-action="true"]');
  if (!leftover) {
    await expect(start).toBeEnabled({ timeout: 60_000 });
    await page.screenshot({ path: 'e2e/results/screens/arena.png' });
    await start.click();
  }

  await expect(commit).toBeVisible({ timeout: 4 * 60_000 });
  let game = await chain.game(address);
  expect(game, 'game active on chain after start').not.toBeNull();
  expect(game?.phase).toBe('shop');
  await page.screenshot({ path: 'e2e/results/screens/shop.png' });

  const replays: Replay[] = [];
  let unitsPlaced = 0;
  const gameOver = frame.getByRole('button', { name: 'New Run' });
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const before = game!;
    unitsPlaced += await playShopTurn(frame);
    if (i === 0) await page.screenshot({ path: 'e2e/results/screens/shop-placed.png' });
    await commitTurn(frame);
    const replay = await watchBattle(
      frame,
      page,
      i === 0 ? 'e2e/results/screens/battle.png' : undefined
    );
    replays.push(replay);

    // Chain agreement: the turn landed in this run and moved one round, and
    // the replay the player watched (from BattleReported, replayed by the
    // WASM engine) ends in the result the chain applied.
    game = await chain.game(address);
    expect(game, 'game still on chain after a turn').not.toBeNull();
    expect(game!.runId).toBe(before.runId);
    expect(replay.round, 'replay shows the round that was fought').toBe(before.round);
    expect(replay.result, `round ${before.round}: replay matches chain`).toBe(
      chainResult(before, game!)
    );
    if (game!.phase === 'shop') expect(game!.round).toBe(before.round + 1);

    await expect(commit.or(gameOver)).toBeVisible({ timeout: 2 * 60_000 });
    if (await gameOver.isVisible()) break;
  }
  console.log('replays', JSON.stringify(replays), 'units placed', unitsPlaced);

  expect(unitsPlaced, 'bought and placed at least one unit').toBeGreaterThan(0);
  expect(replays.length).toBeGreaterThan(0);
  replays.forEach((r) => expect(r.logLines, `round ${r.round} log`).toBeGreaterThan(0));
  expect(guard.console.filter((l) => l.includes('Replay mismatch'))).toEqual([]);

  // Game over screen: Victory after 10 wins, Defeat after the last life.
  await expect(gameOver).toBeVisible();
  const outcome = frame.getByRole('heading', { level: 1 });
  await expect(outcome).toHaveText(/Victory|Defeat/);
  await page.screenshot({ path: 'e2e/results/screens/game-over.png' });
  expect(game!.phase, 'game completed on chain, kept until endGame').toBe('completed');
  expect((await outcome.textContent())?.includes('Victory')).toBe(game!.lives > 0);

  // New Run finalizes the run on chain (endGame) and returns to the arena.
  await gameOver.click();
  await expect(start).toBeVisible({ timeout: 4 * 60_000 });
  expect(await chain.game(address), 'getGame empty after endGame').toBeNull();

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
