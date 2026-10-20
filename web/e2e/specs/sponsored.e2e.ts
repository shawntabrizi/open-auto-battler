import { test as base, type FrameLocator, type Page } from '@playwright/test';
import type { TestHost } from '@parity/host-api-test-sdk/playwright';
import { hostTest, expect } from '../fixtures';
import { connect } from '../helpers';
import { connectChain, PAS, productAccount, type Chain, type TestAccount } from '../chain';
import { commitTurn, playShopTurn, watchBattle, type BattleResult, type Replay } from '../game';
import type { ModeGameInfo } from '../../src/contract/codec';

/**
 * Sponsored play with a registry session (src/contract/registrySession.ts).
 * ONE product-account batch funds a session key and offers it in
 * `@oab/identity`; the key then signs every game call with no prompt. Its
 * first call carries `acceptSession`.
 *
 * The fee token is PGAS (pipeline V1) when the player can fund the PGAS
 * budget, else PAS (pipeline V0). The test host cannot claim PGAS (a real
 * host does that with a personhood proof), and no dev account holds enough,
 * so these specs run the PAS path live:
 *  - a player with too little PAS for a session falls back to normal
 *    signing and sends no setup transaction;
 *  - a player with PAS only: one setup prompt, a full casual game with no
 *    prompt, logout, and the fallback of a key revoked outside the app.
 * The PGAS path runs only with OAB_E2E_SESSION=1 (needs about 1.8 G PGAS).
 *
 * Each run uses fresh product accounts (custom subtree `//Alice//<label>`),
 * funded with PAS only from //Alice, and returns what is left to //Alice.
 * An account that holds PGAS must not be the player here.
 */

const RUN = Date.now() % 1_000_000_000;

/** Progress line with the time, so a hang shows where it is. */
const step = (text: string) => console.log(new Date().toISOString(), text);
/** Below the existential deposit (0.01 PAS): the account is empty. */
const DUST = 100_000_000n;

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
    timeout: 60_000,
  });
}

async function abandon(frame: FrameLocator): Promise<void> {
  await frame.getByRole('button', { name: 'Open menu' }).click();
  await frame.getByRole('button', { name: 'Abandon' }).click();
  await frame.getByRole('button', { name: 'Abandon', exact: true }).last().click();
  await expect(frame.getByRole('link', { name: 'Contract Arena' })).toBeVisible({
    timeout: 60_000,
  });
}

/** From the arena page to the menu, then press End session and wait for its toast. */
async function endSession(frame: FrameLocator, timeout = 60_000): Promise<void> {
  const back = frame.getByRole('link', { name: /Contract$/ });
  if (await back.isVisible()) await back.click({ timeout });
  await frame.getByRole('button', { name: 'End session' }).click({ timeout });
  await expect(frame.getByText('Session ended')).toBeVisible({ timeout });
}

/**
 * After a failure: end a live session through the app, so the key returns
 * its PAS (only the app holds the key). Abandons a game first to reach the
 * menu. Best effort, short timeouts.
 */
async function cleanUpSession(frame: FrameLocator, address: string): Promise<void> {
  if ((await chain.sessionOf(address)).state === 0) return;
  try {
    if (await frame.getByRole('button', { name: 'Open menu' }).isVisible()) {
      await frame.getByRole('button', { name: 'Open menu' }).click({ timeout: 10_000 });
      await frame.getByRole('button', { name: 'Abandon' }).click({ timeout: 10_000 });
      await frame
        .getByRole('button', { name: 'Abandon', exact: true })
        .last()
        .click({ timeout: 10_000 });
      await expect(frame.getByRole('link', { name: /Contract$/ })).toBeVisible({
        timeout: 60_000,
      });
    }
    await endSession(frame, 60_000);
  } catch (e) {
    console.log('cleanup through the app failed; the key keeps its PAS', e);
  }
}

/** The battle result the chain recorded: the change in wins and lives. */
function chainResult(before: ModeGameInfo, after: ModeGameInfo): BattleResult {
  if (after.wins === before.wins + 1 && after.lives === before.lives) return 'VICTORY!';
  if (after.lives === before.lives - 1 && after.wins === before.wins) return 'DEFEAT';
  if (after.wins === before.wins && after.lives === before.lives) return 'DRAW';
  throw new Error(
    `impossible change ${JSON.stringify([before, after], (_, v: unknown) => (typeof v === 'bigint' ? `${v}` : v))}`
  );
}

/**
 * Play the active game to game over. After each turn the chain must agree
 * (same run, round moved on, replay result = chain result). `afterTurn` runs
 * after each committed turn. Leaves the game-over screen open.
 */
async function playToGameOver(
  frame: FrameLocator,
  page: Page,
  address: string,
  afterTurn: () => Promise<void>
): Promise<{ replays: Replay[]; game: ModeGameInfo }> {
  const commit = frame.locator('[data-game-custom-action="true"]');
  const gameOver = frame.getByRole('button', { name: 'New Run' });
  let game = (await chain.game(address))!;
  const replays: Replay[] = [];
  for (let i = 0; i < 25; i++) {
    const before = game;
    await playShopTurn(frame);
    await commitTurn(frame);
    const replay = await watchBattle(frame, page);
    replays.push(replay);
    await afterTurn();
    const after = await chain.game(address);
    expect(after, 'game still on chain after a turn').not.toBeNull();
    game = after!;
    expect(game.runId).toBe(before.runId);
    expect(replay.round, 'replay shows the round that was fought').toBe(before.round);
    expect(replay.result, `round ${before.round}: replay matches chain`).toBe(
      chainResult(before, game)
    );
    if (game.phase === 'shop') expect(game.round).toBe(before.round + 1);
    await expect(commit.or(gameOver)).toBeVisible({ timeout: 60_000 });
    if (await gameOver.isVisible()) break;
  }
  await expect(gameOver).toBeVisible();
  expect(game.phase, 'game completed on chain').toBe('completed');
  return { replays, game };
}

/** Host prompts since the last clear; logs a short form of each for diagnosis. */
async function signatures(testHost: TestHost): Promise<number> {
  const log = await testHost.getSigningLog();
  for (const e of log) {
    const text = JSON.stringify(e.payload, (_, v: unknown) => (typeof v === 'bigint' ? `${v}` : v));
    console.log('signed', e.type, text.slice(0, 200));
  }
  return log.length;
}

/** A host test on a fresh product subtree; every resource but AutoSigning granted. */
function freshPlayer(label: string): { test: ReturnType<typeof hostTest>; player: TestAccount } {
  const test = hostTest({
    accounts: ['dave'],
    productSubtree: { name: label, uri: `//Alice//${label}` },
    behaviors: { resourceAllocation: { AutoSigning: false } },
  });
  // A click has no time limit by default; blocks are 2 s, so 60 s means a hang.
  test.use({ actionTimeout: 60_000, navigationTimeout: 60_000 });
  return { test, player: productAccount(label) };
}

const poor = freshPlayer(`oabpoor${RUN}`);

poor.test(
  'too little PAS and no PGAS: no setup transaction, play falls back to normal signing',
  async ({ testHost, guard }) => {
    // The label lets a person empty the account by hand after a crash.
    step(`player //Alice//oabpoor${RUN}`);
    const { frame, address } = await connect(testHost);
    expect(address, 'Node derives the same product account').toBe(poor.player.ss58);
    try {
      // Enough to play with normal signing, too little for a PAS session (1.1 PAS).
      await chain.topUp(address, PAS / 2n, PAS / 2n);
      expect(await chain.pgas(address)).toBe(0n);
      await testHost.clearSigningLog();

      await startGame(frame);
      expect(await chain.game(address), 'game active on chain').not.toBeNull();
      const allocations = await testHost.page.evaluate(() =>
        window.__TEST_HOST__.getResourceAllocationLog()
      );
      expect(allocations).toContainEqual(
        expect.objectContaining({ resource: 'SmartContractAllowance', granted: true })
      );
      // The setup refused before it built a transaction.
      expect(
        guard.console.some(
          (l) => l.includes('Sponsored play setup failed') && l.includes('Not enough PGAS or PAS')
        )
      ).toBe(true);
      // startGame only, by the player. The PAS transfer that created the
      // account also mapped it (pallet-revive AutoMap), so no map_account.
      expect(await signatures(testHost)).toBe(1);
      await abandon(frame);
      expect(await chain.game(address), 'no game after abandon').toBeNull();
    } finally {
      console.log('returned to Alice (planck)', await chain.returnToAlice(poor.player));
    }
  }
);

const pas = freshPlayer(`oabpas${RUN}`);

pas.test(
  'PAS session: one setup prompt, a full game with no prompt, logout, revoked-key fallback',
  async ({ testHost, guard }) => {
    pas.test.setTimeout(20 * 60_000);
    const page = testHost.page;
    step(`player //Alice//oabpas${RUN}`);
    const { frame, address } = await connect(testHost);
    expect(address, 'Node derives the same product account').toBe(pas.player.ss58);
    const keys: string[] = [];
    try {
      await chain.topUp(address, 3n * PAS, 3n * PAS);
      expect(await chain.pgas(address), 'the PAS path needs a player without PGAS').toBe(0n);
      const playerStart = await chain.free(address);
      await testHost.clearSigningLog();

      step('1. First write');
      // 1. First write: the setup batch (ONE prompt), then the key's first
      //    call, silent: batch_all[acceptSession, startGame].
      await startGame(frame);
      expect(await signatures(testHost), 'setup is one host prompt').toBe(1);
      const s1 = await chain.sessionOf(address);
      expect(s1.state, 'the key accepted in its first call').toBe(2);
      const key1 = await chain.accountOf(s1.key);
      keys.push(key1);
      expect(await chain.game(address), 'the key started the PLAYER game').not.toBeNull();
      expect(await chain.pgas(key1), 'the key holds no PGAS').toBe(0n);
      const playerAfterSetup = await chain.free(address);
      let keyBefore = await chain.free(key1);
      console.log(
        'PAS setup: player paid (planck)',
        String(playerStart - playerAfterSetup),
        'key after accept+start',
        String(keyBefore)
      );

      step('2. A full casual game');
      // 2. A full casual game to game over, signed by the key only.
      await testHost.clearSigningLog();
      const turnCosts: bigint[] = [];
      const { replays, game } = await playToGameOver(frame, page, address, async () => {
        const now = await chain.free(key1);
        turnCosts.push(keyBefore - now);
        keyBefore = now;
      });
      expect(replays.length).toBeGreaterThan(0);
      replays.forEach((r) => expect(r.logLines, `round ${r.round} log`).toBeGreaterThan(0));
      expect(guard.console.filter((l) => l.includes('Replay mismatch'))).toEqual([]);
      await frame.getByRole('button', { name: 'New Run' }).click();
      await expect(frame.getByRole('button', { name: 'Start Game' })).toBeVisible({
        timeout: 60_000,
      });
      expect(await chain.game(address), 'getGame empty after endGame').toBeNull();
      const endCost = keyBefore - (await chain.free(key1));
      expect(await signatures(testHost), 'turns and endGame: no host prompt').toBe(0);
      expect(await chain.free(address), 'the player paid nothing during play').toBe(
        playerAfterSetup
      );
      console.log(
        'PAS game:',
        JSON.stringify({
          rounds: replays.length,
          lives: game.lives,
          wins: game.wins,
          turnCosts: turnCosts.map(String),
          endGame: String(endCost),
        })
      );

      step('3. Logout');
      // 3. Logout: the player revokes (one prompt), the key returns its PAS.
      await testHost.clearSigningLog();
      await endSession(frame);
      expect(await signatures(testHost), 'logout is one host prompt').toBe(1);
      expect((await chain.sessionOf(address)).state, 'no session after logout').toBe(0);
      expect((await chain.keyOf(s1.key)).revoked, 'the old key is burned').toBe(true);
      expect(await chain.free(key1), 'the key returned its PAS').toBeLessThan(DUST);

      step('4. After logout');
      // 4. After logout, play uses normal signing: one prompt per call.
      await testHost.clearSigningLog();
      await startGame(frame);
      await abandon(frame);
      expect(await signatures(testHost), 'startGame and abandonGame signed normally').toBe(2);

      step('5. A key revoked');
      // 5. A key revoked outside the app falls back to normal signing.
      // The abandon left the app on the menu.
      await frame.getByRole('button', { name: 'Disconnect' }).click();
      await connect(testHost);
      await testHost.clearSigningLog();
      await startGame(frame);
      expect(await signatures(testHost), 'a new session: one setup prompt').toBe(1);
      const s2 = await chain.sessionOf(address);
      expect(s2.state).toBe(2);
      expect(s2.key.toLowerCase()).not.toBe(s1.key.toLowerCase());
      const key2 = await chain.accountOf(s2.key);
      keys.push(key2);
      await chain.revokeSession(pas.player);
      expect((await chain.sessionOf(address)).state).toBe(0);
      await testHost.clearSigningLog();
      await abandon(frame);
      expect(await chain.game(address), 'the abandon landed').toBeNull();
      expect(await signatures(testHost), 'the revoked key fell back to one normal prompt').toBe(1);
      expect(guard.console.some((l) => l.includes('Session expired; signing this call'))).toBe(
        true
      );

      step('6. Logout with no live');
      // 6. Logout with no live session: no prompt, the key returns its PAS.
      await testHost.clearSigningLog();
      await endSession(frame);
      expect(await signatures(testHost)).toBe(0);
      expect(await chain.free(key2)).toBeLessThan(DUST);
    } finally {
      step('cleanup');
      await cleanUpSession(frame, address);
      for (const k of keys) console.log('key', k, 'left (planck)', String(await chain.free(k)));
      console.log('returned to Alice (planck)', String(await chain.returnToAlice(pas.player)));
    }
  }
);

const sponsored = hostTest({
  accounts: ['dave'],
  behaviors: { resourceAllocation: { AutoSigning: false } },
});

sponsored(
  'PGAS registry session: setup prompts once, then the key plays with no prompts',
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
    expect(await signatures(testHost), 'setup is one host prompt').toBe(1);

    await testHost.clearSigningLog();
    for (let turn = 0; turn < 2; turn++) {
      await playShopTurn(frame);
      await commitTurn(frame);
      await watchBattle(frame, testHost.page);
      await expect(frame.locator('[data-game-custom-action="true"]')).toBeVisible({
        timeout: 60_000,
      });
    }
    await abandon(frame);

    // Turns and the abandon were signed by the session key: no host prompt.
    expect(await testHost.getSigningLog()).toEqual([]);
    expect(await chain.game(address), 'no game after abandon').toBeNull();
    expect(await chain.pgas(address)).toBeLessThan(pgasBefore);
  }
);
