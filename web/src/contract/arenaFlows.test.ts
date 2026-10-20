import { describe, expect, it, vi } from 'vitest';
import type { TxResult } from '@parity/product-sdk-tx';
import {
  claimBadges,
  newBadges,
  RankedIneligibleError,
  startRanked,
  startWithHeadroom,
  withGasHeadroom,
  type ClaimMethod,
  type SendGameCall,
  type StartMethod,
} from './arenaFlows';
import { findBadgeEvents } from './index';
import { BADGE_MINTED_TOPIC, BADGE_PENDING_TOPIC, type BadgeEvent } from './codec';

const GAS = { ref_time: 1_000n, proof_size: 50n };
const ok = <T>(value: T) => ({ ok: true as const, value });

/** A start method whose dry-run returns `seed`, recording the gas it is sent with. */
function fakeStart(seed: bigint) {
  const sent: { via: 'prepare' | 'tx'; gasLimit: unknown }[] = [];
  const method: StartMethod = {
    query: vi.fn(() => Promise.resolve({ success: true as const, value: seed, gasRequired: GAS })),
    prepare: vi.fn((_s: number, o?: { gasLimit?: unknown }) => {
      sent.push({ via: 'prepare', gasLimit: o?.gasLimit });
      return Promise.resolve(ok({ decodedCall: {} }));
    }),
    tx: vi.fn((_s: number, o?: { gasLimit?: unknown }) => {
      sent.push({ via: 'tx', gasLimit: o?.gasLimit });
      return Promise.resolve(ok({ events: [] } as unknown as TxResult));
    }),
  };
  return { method, sent };
}

/** Sends through `direct` (normal signing), like an inactive sponsor. */
const directSend: SendGameCall = async (_label, _prepare, direct) => {
  const r = await direct();
  if (!r.ok) throw r.error;
  return r.value;
};
/** Sends through `prepare` (session key), like an active sponsor. */
const sessionSend: SendGameCall = async (_label, prepare) => {
  await prepare();
  return { events: [] } as unknown as TxResult;
};

describe('game start gas headroom', () => {
  it('doubles both weight dimensions', () => {
    expect(withGasHeadroom(GAS)).toEqual({ ref_time: 2_000n, proof_size: 100n });
  });

  it.each([
    ['normal signing', directSend, 'tx'],
    ['a session key', sessionSend, 'prepare'],
  ] as const)(
    'sends a ranked start via %s with twice the dry-run gas',
    async (_name, send, via) => {
      // The seed comes from the inclusion block's entropy, and ranked start
      // also calls the personhood precompile: the exact dry-run weight can run
      // out of gas on chain (Revive.OutOfGas) and lose the player's fee.
      const { method, sent } = fakeStart(42n);
      const seed = await startWithHeadroom({
        label: 'startRankedGame',
        method,
        setId: 1,
        send,
        rejected: () => new Error('rejected'),
      });
      expect(seed).toBe(42n);
      expect(sent).toEqual([{ via, gasLimit: { ref_time: 2_000n, proof_size: 100n } }]);
    }
  );

  it('sends nothing when the dry-run returns seed 0 (the contract refused)', async () => {
    const { method, sent } = fakeStart(0n);
    await expect(
      startWithHeadroom({
        label: 'startRankedGame',
        method,
        setId: 1,
        send: directSend,
        rejected: () => new RankedIneligibleError(null, 'refused'),
      })
    ).rejects.toThrow('refused');
    expect(sent).toEqual([]);
  });
});

describe('ranked start eligibility gate', () => {
  it('explains a missing binding and never prompts or sends', async () => {
    // A player without a personhood alias in OAB's context cannot play
    // ranked. Asking them to approve sponsorship or sign first would cost a
    // prompt (and maybe a fee) for a game the contract refuses.
    const prepareWrite = vi.fn(() => Promise.resolve());
    const start = vi.fn(() => Promise.resolve(1n));
    const err = await startRanked({
      eligibility: () => Promise.resolve({ kind: 'not-bound' }),
      prepareWrite,
      start,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RankedIneligibleError);
    expect((err as RankedIneligibleError).eligibility).toEqual({ kind: 'not-bound' });
    expect((err as Error).message).toMatch(/not bound to a personhood alias/);
    expect(prepareWrite).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('treats a failed check as ineligible, not as permission to try', async () => {
    const start = vi.fn(() => Promise.resolve(1n));
    await expect(
      startRanked({
        eligibility: () => Promise.resolve({ kind: 'unknown', reason: 'offline' }),
        prepareWrite: () => Promise.resolve(),
        start,
      })
    ).rejects.toThrow(/offline/);
    expect(start).not.toHaveBeenCalled();
  });

  it('sets up signing, then starts, for a bound account', async () => {
    const order: string[] = [];
    const seed = await startRanked({
      eligibility: () => Promise.resolve({ kind: 'bound', alias: `0x${'aa'.repeat(32)}` }),
      prepareWrite: () => {
        order.push('prepare');
        return Promise.resolve();
      },
      start: () => {
        order.push('start');
        return Promise.resolve(7n);
      },
    });
    expect(seed).toBe(7n);
    expect(order).toEqual(['prepare', 'start']);
  });
});

describe('pending badge claim', () => {
  function fakeClaim(wouldMint: number) {
    const tx = vi.fn(() => Promise.resolve(ok({ events: ['minted'] } as unknown as TxResult)));
    const method: ClaimMethod = {
      query: () => Promise.resolve({ success: true as const, value: wouldMint, gasRequired: GAS }),
      prepare: () => Promise.resolve(ok({ decodedCall: {} })),
      tx,
    };
    return { method, tx };
  }
  const minted: BadgeEvent = { kind: 'minted', player: '0x01', badge: 0, setId: 0, token: 5n };

  it('sends no transaction when nothing would mint, so a no-op costs no fee', async () => {
    const { method, tx } = fakeClaim(0);
    const result = await claimBadges({ method, send: directSend, parseEvents: () => [minted] });
    expect(result).toEqual([]);
    expect(tx).not.toHaveBeenCalled();
  });

  it('sends the claim and reports the badges the tx minted', async () => {
    const { method, tx } = fakeClaim(1);
    const parseEvents = vi.fn(() => [minted]);
    expect(await claimBadges({ method, send: directSend, parseEvents })).toEqual([minted]);
    expect(tx).toHaveBeenCalledOnce();
    expect(parseEvents).toHaveBeenCalledWith(['minted']);
  });
});

describe('badge events in a transaction', () => {
  const me = '0x' + 'ab'.repeat(20);
  const other = '0x' + 'cd'.repeat(20);
  const word = (v: number) => v.toString(16).padStart(64, '0');
  const emitted = (topic: string, player: string, data: string) => ({
    phase: { type: 'ApplyExtrinsic', value: 1 },
    event: {
      type: 'Revive',
      value: {
        type: 'ContractEmitted',
        value: {
          contract: '0x00',
          topics: [topic, '0x' + '00'.repeat(12) + player.slice(2)],
          data: '0x' + data,
        },
      },
    },
  });

  it("keeps only the player's own badge events", () => {
    // A batch or a proxied call can carry other players' events; showing them
    // as "your new badge" would be wrong.
    const events = [
      emitted(BADGE_MINTED_TOPIC, me, word(1) + word(2) + word(9)),
      emitted(BADGE_PENDING_TOPIC, other, word(0) + word(2)),
      emitted(BADGE_PENDING_TOPIC, me, word(0) + word(2)),
      { event: { type: 'System', value: { type: 'ExtrinsicSuccess', value: {} } } },
    ];
    expect(findBadgeEvents(events, me.toUpperCase().replace('0X', '0x'))).toEqual([
      { kind: 'minted', player: me, badge: 1, setId: 2, token: 9n },
      { kind: 'pending', player: me, badge: 0, setId: 2, token: null },
    ]);
  });
});

describe('new badges by diff (fallback when events are unreadable)', () => {
  it('reports only records that were not held before the run', () => {
    const old = { badge: 0, setId: 0, block: 1n, token: 3n };
    const fresh = { badge: 1, setId: 0, block: 9n, token: null };
    expect(newBadges([old], [old, fresh])).toEqual([
      { kind: 'pending', player: '0x', badge: 1, setId: 0, token: null },
    ]);
    expect(newBadges([old], [old])).toEqual([]);
  });
});
