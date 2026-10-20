import { describe, expect, it } from 'vitest';
import { findBattleReport } from './index';
import { hexToBytes } from './codec';
import { loadFixtures } from './fixtures';

// A real submitTurn's BattleReported (arena v4, Paseo Next block 2058218),
// captured by scripts/capture-fixtures.mjs.
const fx = loadFixtures('arena.txt');
const topics = fx('battle_reported_topics').split(',');
const player = '0x' + topics[1].slice(-40);

/** A PAPI tx event record for a contract event. */
const emitted = (t: string[], data: string) => ({
  phase: { type: 'ApplyExtrinsic', value: 1 },
  event: {
    type: 'Revive',
    value: { type: 'ContractEmitted', value: { contract: '0x00', topics: t, data } },
  },
});

describe('BattleReported in a transaction', () => {
  it("returns the player's SCALE report from the ABI bytes", () => {
    const events = [
      { event: { type: 'System', value: { type: 'ExtrinsicSuccess', value: {} } } },
      emitted(topics, fx('battle_reported_data')),
    ];
    expect(findBattleReport(events, player)).toEqual(hexToBytes(fx('report')));
  });

  it("ignores another player's report", () => {
    // A batch can carry events of other players; replaying one of them as
    // "your battle" would show a fight that did not happen to you.
    const other = [topics[0], '0x' + '00'.repeat(12) + 'cd'.repeat(20), topics[2]];
    expect(findBattleReport([emitted(other, fx('battle_reported_data'))], player)).toBeNull();
  });

  it('ignores other events of the arena', () => {
    const gameEnded = ['0x' + '11'.repeat(32), topics[1]];
    expect(findBattleReport([emitted(gameEnded, fx('battle_reported_data'))], player)).toBeNull();
  });
});
