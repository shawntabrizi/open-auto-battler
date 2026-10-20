import { describe, expect, it, vi } from 'vitest';
import type { TxResult } from '@parity/product-sdk-tx';
import {
  startWithHeadroom,
  withGasHeadroom,
  type QueryResult,
  type SendGameCall,
  type StartMethod,
} from './arenaFlows';
import { ArenaRevertError } from './errors';

const GAS = { ref_time: 1_000n, proof_size: 50n };
const ok = <T>(value: T) => ({ ok: true as const, value });

/** A start method whose dry-run gives `dry`, recording the gas it is sent with. */
function fakeStart(dry: QueryResult<bigint>) {
  const sent: { via: 'prepare' | 'tx'; gasLimit: unknown }[] = [];
  const method: StartMethod = {
    query: vi.fn(() => Promise.resolve(dry)),
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
const runId = (v: bigint): QueryResult<bigint> => ({ success: true, value: v, gasRequired: GAS });

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
  ] as const)('sends a start via %s with twice the dry-run gas', async (_name, send, via) => {
    // The seed comes from the inclusion block, so the exact dry-run weight
    // can run out of gas on chain (Revive.OutOfGas) and lose the player's fee.
    const { method, sent } = fakeStart(runId(42n));
    const id = await startWithHeadroom({
      label: 'startGame',
      method,
      setId: 1,
      send,
      rejected: () => new Error('rejected'),
    });
    expect(id).toBe(42n);
    expect(sent).toEqual([{ via, gasLimit: { ref_time: 2_000n, proof_size: 100n } }]);
  });

  it('sends nothing and names the typed revert when the dry-run reverts', async () => {
    // A player with a game on chain must learn that, not see a generic
    // failure or pay a fee for a call that cannot succeed.
    const { method, sent } = fakeStart({
      success: false,
      value: { type: 'ContractRevertedWithPayload', decoded: { errorName: 'GameActive' } },
    });
    const err = await startWithHeadroom({
      label: 'startGame',
      method,
      setId: 0,
      send: directSend,
      rejected: () => new Error('rejected'),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArenaRevertError);
    expect((err as Error).message).toMatch(/already have a game/);
    expect(sent).toEqual([]);
  });

  it('sends nothing on a dry-run failure without a revert (e.g. unmapped origin)', async () => {
    const { method, sent } = fakeStart({ success: false, value: { type: 'Module' } });
    await expect(
      startWithHeadroom({
        label: 'startGame',
        method,
        setId: 0,
        send: directSend,
        rejected: () => new Error('refused'),
      })
    ).rejects.toThrow('refused');
    expect(sent).toEqual([]);
  });

  it('sends nothing when the dry-run returns run id 0 (run ids start at 1)', async () => {
    const { method, sent } = fakeStart(runId(0n));
    await expect(
      startWithHeadroom({
        label: 'startGame',
        method,
        setId: 0,
        send: directSend,
        rejected: () => new Error('refused'),
      })
    ).rejects.toThrow('refused');
    expect(sent).toEqual([]);
  });
});
