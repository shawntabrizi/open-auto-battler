import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BADGE_MINTED_TOPIC,
  BADGE_PENDING_TOPIC,
  decodeBadgeConfig,
  decodeBadgeEvent,
  decodeBadges,
  decodeBestRun,
  decodeLeaderboard,
  hexToBytes,
} from './codec';

// Bytes produced by the contract's own Rust types: the contract test
// `frontend_scale_fixtures` asserts this file equals `.encode()` of known
// values. These tests decode the same bytes and expect those values back, so a
// layout change on either side breaks one of the two tests.
const FIXTURES = Object.fromEntries(
  readFileSync(new URL('./fixtures/scale.txt', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split('=') as [string, string])
);
const fixture = (name: string): string => {
  const hex = FIXTURES[name];
  if (!hex) throw new Error(`missing fixture ${name}`);
  return hex;
};

const FIRST = {
  alias: `0x${'11'.repeat(32)}`,
  setId: 2,
  wins: 10,
  lives: 3,
  rounds: 10,
  block: 2_050_400n,
};

describe('leaderboard decoding (Rust LeaderboardEntry)', () => {
  it('decodes an empty board, which is what every set shows before its first ranked run', () => {
    expect(decodeLeaderboard(fixture('leaderboard_empty'))).toEqual([]);
  });

  it('reads every field in Rust field order, with u16 and u64 little-endian', () => {
    // A field-order or width slip would show wrong wins/lives on the board,
    // which is the ranking itself.
    expect(decodeLeaderboard(fixture('leaderboard_two'))).toEqual([
      FIRST,
      {
        alias: `0x${'ab'.repeat(32)}`,
        setId: 0x0102,
        wins: 7,
        lives: 0,
        rounds: 9,
        block: 0x0102_0304_0506_0708n,
      },
    ]);
  });

  it('decodes a full 100-entry board, whose length needs the 2-byte compact prefix', () => {
    // The contract keeps the top 100: a one-byte-only compact reader would
    // break exactly when the board becomes popular.
    const board = decodeLeaderboard(fixture('leaderboard_full'));
    expect(board).toHaveLength(100);
    expect(board[99]).toEqual({
      alias: `0x${'63'.repeat(32)}`,
      setId: 1,
      wins: 10 - 9,
      lives: 3 - (99 % 4),
      rounds: 10 + (99 % 3),
      block: 1099n,
    });
  });

  it('rejects truncated or padded input instead of showing a garbled board', () => {
    const hex = fixture('leaderboard_two');
    expect(() => decodeLeaderboard(hex.slice(0, -2))).toThrow();
    expect(() => decodeLeaderboard(hex + '00')).toThrow(/trailing/);
  });
});

describe('best run decoding', () => {
  it('decodes one entry', () => {
    expect(decodeBestRun(fixture('best_run'))).toEqual(FIRST);
  });

  it('maps the empty answer to null: the person has no finished ranked run on the set', () => {
    expect(decodeBestRun('0x')).toBeNull();
  });
});

describe('badge decoding (Rust BadgeRecord / BadgeConfig)', () => {
  it('keeps a minted badge token and marks a pending one with null', () => {
    // `token: None` is the only signal that a badge needs claimPendingBadges.
    expect(decodeBadges(fixture('badges'))).toEqual([
      { badge: 0, setId: 2, block: 2_050_400n, token: 42n },
      { badge: 1, setId: 2, block: 2_050_400n, token: null },
    ]);
    expect(decodeBadges(fixture('badges_empty'))).toEqual([]);
  });

  it('rejects an Option tag other than 0 or 1', () => {
    const bad = fixture('badges').replace(/012a00000000000000/, '022a00000000000000');
    expect(() => decodeBadges(bad)).toThrow(/Option/);
  });

  it('decodes the badge config, and null before initAchievements', () => {
    expect(decodeBadgeConfig(fixture('badge_config'))).toEqual({ collection: 30, items: [0, 1] });
    expect(decodeBadgeConfig('0x')).toBeNull();
  });
});

describe('badge event decoding', () => {
  const player = '0x' + '00'.repeat(12) + 'aa'.repeat(20);
  // Layout written by the contract's `emit_badge_event`: ABI words badge,
  // set id, and for BadgeMinted the token id.
  const words = (...vals: bigint[]) =>
    hexToBytes(vals.map((v) => v.toString(16).padStart(64, '0')).join(''));

  it('reads a BadgeMinted event: the new badge to show after a ranked run', () => {
    expect(decodeBadgeEvent([BADGE_MINTED_TOPIC, player], words(1n, 2n, 77n))).toEqual({
      kind: 'minted',
      player: '0x' + 'aa'.repeat(20),
      badge: 1,
      setId: 2,
      token: 77n,
    });
  });

  it('reads a BadgePending event: earned, but needs a claim', () => {
    expect(decodeBadgeEvent([BADGE_PENDING_TOPIC, player], words(0n, 1n))).toMatchObject({
      kind: 'pending',
      badge: 0,
      setId: 1,
      token: null,
    });
  });

  it('ignores other contract events', () => {
    expect(decodeBadgeEvent(['0x' + '96'.repeat(32), player], words(0n, 0n, 0n))).toBeNull();
  });
});
