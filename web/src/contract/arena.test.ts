import { describe, expect, it } from 'vitest';
import { decodeBattleReport, decodeModeGame } from './codec';
import { loadFixtures } from './fixtures';

// SCALE bytes from the live casual arena (CDM version 4): `getGame` before
// and after one empty turn, and that turn's report. A layout change in
// oab-protocol breaks these tests, and recapturing shows the new layout.
const fx = loadFixtures('arena.txt');

describe('ModeGame decoding (getGame)', () => {
  it('reads a new game: run, engine, set, config board size, round 1 shop', () => {
    const g = decodeModeGame(fx('game_start'));
    expect(g).toMatchObject({
      engineVersion: 1,
      setId: 0,
      boardSize: 5,
      round: 1,
      wins: 0,
      lives: 3,
      phase: 'shop',
    });
    expect(g?.runId).toBeGreaterThan(0n);
    expect(g?.setHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('reads the game after a lost turn: round 2, one life less, same run', () => {
    const before = decodeModeGame(fx('game_start'))!;
    const after = decodeModeGame(fx('game_after_turn'))!;
    expect(after.runId).toBe(before.runId);
    expect(after).toMatchObject({ round: 2, wins: 0, lives: 2, phase: 'shop' });
  });

  it('treats empty bytes as no game (getGame after endGame or abandonGame)', () => {
    expect(decodeModeGame(fx('game_none'))).toBeNull();
  });
});

describe('BattleReport decoding (BattleReported)', () => {
  it('reads the report of that turn and agrees with the game after it', () => {
    const r = decodeBattleReport(fx('report'));
    const after = decodeModeGame(fx('game_after_turn'))!;
    expect(r).toMatchObject({ engineVersion: 1, setId: 0, round: 1, result: 'Defeat' });
    expect([r.wins, r.lives]).toEqual([after.wins, after.lives]);
    expect(r.playerBoard).toEqual([]);
    expect(r.opponent.length).toBeGreaterThan(0);
  });

  it.each([1, 2, 3, 4, 5, 6])('reads the M3 live report of round %i', (round) => {
    const r = decodeBattleReport(fx(`m3_report_round${round}`));
    const results = ['Victory', 'Defeat', 'Draw'];
    expect(r.round).toBe(round);
    expect(r.result).toBe(results[Number(fx(`m3_result_round${round}`))]);
  });
});
