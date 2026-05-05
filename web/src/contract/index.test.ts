import { describe, expect, it } from 'vitest';
import { isMissingArenaSessionPayload } from './index';

describe('isMissingArenaSessionPayload', () => {
  it('treats the zeroed ArenaSession sentinel as no active game', () => {
    expect(isMissingArenaSessionPayload(new Uint8Array(21))).toBe(true);
  });

  it('keeps real session payloads intact', () => {
    const payload = new Uint8Array(21);
    payload[0] = 4; // non-empty SCALE vec prefix for bag/hand/etc.
    expect(isMissingArenaSessionPayload(payload)).toBe(false);
  });
});
