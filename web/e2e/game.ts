/**
 * Drive the OAB game UI like a player: buy and place units in the shop,
 * commit the turn on chain, watch the battle replay, and continue.
 */
import type { FrameLocator, Page } from '@playwright/test';
import { expect } from './fixtures';

export type BattleResult = 'VICTORY!' | 'DEFEAT' | 'DRAW';

/**
 * Spend the shop phase: place every affordable card while the board has room,
 * burning surplus hand cards for mana when nothing is affordable. Returns the
 * number of units placed.
 */
export async function playShopTurn(frame: FrameLocator): Promise<number> {
  let placed = 0;
  for (let step = 0; step < 10; step++) {
    const hand = frame.getByTestId('hand-card');
    const handCount = await hand.count();
    const emptySlots = await frame
      .locator('[data-testid="board-slot"][data-occupied="false"]')
      .count();
    if (handCount === 0 || emptySlots === 0) break;

    const affordable = frame.locator('[data-testid="hand-card"][data-affordable="true"]');
    if ((await affordable.count()) > 0) {
      const before = emptySlots;
      await affordable.first().click();
      await frame.getByRole('button', { name: 'Place unit here' }).first().click();
      await expect(
        frame.locator('[data-testid="board-slot"][data-occupied="false"]')
      ).toHaveCount(before - 1);
      placed++;
      continue;
    }

    // Nothing affordable: burn the last card for mana, keep at least one.
    if (handCount < 2) break;
    await hand.last().click();
    await frame.getByTitle(/^Burn selected card or unit/).click();
    await expect(frame.getByTestId('hand-card')).toHaveCount(handCount - 1);
  }
  return placed;
}

/** Press Commit (confirming if asked) and wait for the battle replay. */
export async function commitTurn(frame: FrameLocator): Promise<void> {
  const commit = frame.locator('[data-game-custom-action="true"]');
  await expect(commit).toBeEnabled();
  await commit.click();
  if ((await commit.textContent())?.includes('Are you sure?')) await commit.click();
}

export interface Replay {
  result: BattleResult;
  round: number;
  logLines: number;
}

/**
 * Assert the battle replay renders (title, both teams, at least one log line),
 * skip to the end, read the result, and press Continue.
 */
export async function watchBattle(
  frame: FrameLocator,
  page: Page,
  screenshot?: string
): Promise<Replay> {
  // The submit is a chain transaction: allow block time plus the host round trip.
  const title = frame.getByRole('heading', { name: /^Round \d+ Battle$/ });
  await expect(title).toBeVisible({ timeout: 4 * 60_000 });
  const round = Number((await title.textContent())?.match(/\d+/)?.[0]);

  await expect(frame.getByText('Your Team')).toBeVisible();
  await expect(frame.getByText('Enemy', { exact: true })).toBeVisible();
  const log = frame.locator('.battle-log > div.truncate');
  await expect(log.first()).toBeVisible({ timeout: 30_000 });
  if (screenshot) await page.screenshot({ path: screenshot });

  await frame.getByTitle('Skip to end').click();
  const banner = frame.locator('.battle-result-banner');
  await expect(banner).toBeVisible({ timeout: 30_000 });
  const result = (await banner.textContent())?.trim() as BattleResult;
  expect(['VICTORY!', 'DEFEAT', 'DRAW']).toContain(result);
  const logLines = await log.count();

  await frame.getByRole('button', { name: 'Continue' }).click();
  await expect(title).toBeHidden({ timeout: 30_000 });
  return { result, round, logLines };
}
