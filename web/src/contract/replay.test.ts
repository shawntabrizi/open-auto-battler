/**
 * The WASM engine against the live casual arena: load a game from `getGame`
 * and the set bundle, and replay `BattleReported` reports. The replay must end
 * in the result the chain reported (arena v2 replays did not always: the
 * client clamped ghost health, the chain does not).
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { hexToBytes } from './codec';
import { loadFixtures } from './fixtures';
import { engine_version, GameEngine, initSync } from '../wasm/oab_client.js';

const fx = loadFixtures('arena.txt');
const bytes = (name: string) => hexToBytes(fx(name));

type Output = {
  events: { type: string; payload?: { result?: string } }[];
  initial_player_units: unknown[];
  initial_enemy_units: unknown[];
  round: number;
};

beforeAll(() => {
  initSync({ module: readFileSync(new URL('../wasm/oab_client_bg.wasm', import.meta.url)) });
});

describe('WASM engine on chain data', () => {
  it('runs engine version 1, the version the deployed arena stores', () => {
    expect(engine_version()).toBe(1);
  });

  it('loads a chain game from its ModeGame and set bundle', () => {
    const engine = new GameEngine(undefined);
    engine.init_from_mode_game(bytes('game_start'), bytes('set0_bundle'));
    const view = engine.get_view() as { round: number; lives: number; hand: unknown[] };
    expect(view.round).toBe(1);
    expect(view.lives).toBe(3);
    expect(view.hand.length).toBeGreaterThan(0);
  });

  it('refuses a bundle that does not match the game set hash', () => {
    const engine = new GameEngine(undefined);
    const bundle = bytes('set0_bundle');
    // Byte 5: the rarity of the first set entry (set id u16, compact length,
    // card id u16, rarity u8). Still decodes, but hashes differently.
    bundle[5] ^= 1;
    expect(() => engine.init_from_mode_game(bytes('game_start'), bundle)).toThrow(/set hash/);
  });

  it.each([1, 2, 3, 4, 5, 6])('replays M3 round %i to the reported result', (round) => {
    const engine = new GameEngine(undefined);
    const out = engine.replay_report(
      bytes(`m3_report_round${round}`),
      bytes('set0_bundle'),
      5
    ) as Output;
    const end = out.events[out.events.length - 1];
    const results = ['Victory', 'Defeat', 'Draw'];
    expect(end?.type).toBe('BattleEnd');
    expect(end?.payload?.result).toBe(results[Number(fx(`m3_result_round${round}`))]);
    expect(out.round).toBe(round);
    expect(out.initial_enemy_units.length).toBeGreaterThan(0);
  });

  it('refuses a report whose result the replay does not reach', () => {
    // Flip the reported result byte (offset 7): Victory -> Defeat.
    const report = bytes('m3_report_round1');
    report[7] = 1;
    const engine = new GameEngine(undefined);
    expect(() => engine.replay_report(report, bytes('set0_bundle'), 5)).toThrow(/Replay mismatch/);
  });

  it('refuses a report from another engine version', () => {
    const report = bytes('m3_report_round1');
    report[0] = 2;
    const engine = new GameEngine(undefined);
    expect(() => engine.replay_report(report, bytes('set0_bundle'), 5)).toThrow(/engine version 2/);
  });
});
