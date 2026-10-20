import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err } from '@parity/result';
import { TxDispatchError, TxValidityError } from '@parity/product-sdk-tx';
import type * as TxModule from '@parity/product-sdk-tx';
import { ss58Encode, ss58ToH160 } from '@parity/product-sdk-address';
import {
  classifySession,
  createRegistrySession,
  SESSION_BUDGET,
  SETUP_OVERHEAD,
} from './registrySession';
import { V1_OPTIONS } from './v1';
import { PGAS_ASSET_ID, SessionExpiredError } from './session';

// The product promise (docs/CONTRACT_ARCHITECTURE.md 7.4): ONE player prompt
// sets up the session; the key then plays with no prompt, fee in PGAS (V1).

const memory = new Map<string, string>();
vi.mock('@parity/product-sdk-local-storage', () => ({
  createLocalKvStore: () =>
    Promise.resolve({
      get: (k: string) => Promise.resolve(memory.get(k) ?? null),
      set: (k: string, v: string) => Promise.resolve(void memory.set(k, v)),
      remove: (k: string) => Promise.resolve(void memory.delete(k)),
      getJSON: () => Promise.resolve(null),
      setJSON: () => Promise.resolve(),
    }),
}));
const submitAndWatch = vi.fn();
vi.mock('@parity/product-sdk-tx', async (orig) => ({
  ...(await orig<typeof TxModule>()),
  submitAndWatch: (...a: unknown[]) => submitAndWatch(...a) as unknown,
}));

const PLAYER = ss58Encode(new Uint8Array(32).fill(7), 0);
const NOW_S = 1_800_000_000n;
const ZERO = '0x0000000000000000000000000000000000000000';

interface Chain {
  pgas: Map<string, bigint>;
  /** Identity.sessionOf(player): key H160, expiry, state. */
  session: [string, bigint, number];
  /** Identity.keyOf(key).owner per key H160. */
  keyOwner: Map<string, string>;
  mapped: boolean;
}

function fakeApi(chain: Chain) {
  const tx = (name: string) => (args?: unknown) => ({
    decodedCall: { name, args },
    createSubmitAndWatch: vi.fn(),
  });
  let lastBatch: { calls: { name: string; args?: unknown }[]; tx: unknown } | null = null;
  const api = {
    query: {
      Assets: {
        Account: {
          getValue: (_id: number, who: string) =>
            Promise.resolve({ balance: chain.pgas.get(who) ?? 0n }),
        },
      },
      Timestamp: { Now: { getValue: () => Promise.resolve(NOW_S * 1000n) } },
      Revive: {
        OriginalAccount: {
          getValue: () => Promise.resolve(chain.mapped ? '0xmapped' : undefined),
        },
      },
    },
    tx: {
      Assets: { transfer_keep_alive: tx('transfer_keep_alive') },
      Revive: { map_account: tx('map_account') },
      Utility: {
        batch_all: (a: { calls: { name: string }[] }) => {
          const t = tx('batch_all')(a);
          lastBatch = { calls: a.calls, tx: t };
          return t;
        },
      },
    },
  };
  return { api, batch: () => lastBatch };
}

function fakeIdentity(chain: Chain) {
  const identity = {
    sessionOf: {
      query: vi.fn(() => Promise.resolve({ success: true as const, value: chain.session })),
    },
    keyOf: {
      query: vi.fn((key: string) =>
        Promise.resolve({
          success: true as const,
          value: [chain.keyOwner.get(key.toLowerCase()) ?? ZERO, 0n, false],
        })
      ),
    },
    maxTtl: { query: vi.fn(() => Promise.resolve({ success: true as const, value: 604_800n })) },
    registerSession: {
      prepare: vi.fn((session: string, expiresAt: bigint) =>
        Promise.resolve(
          ok({ decodedCall: { name: 'registerSession', args: { session, expiresAt } } })
        )
      ),
    },
    acceptSession: {
      prepare: vi.fn((owner: string) =>
        Promise.resolve(ok({ decodedCall: { name: 'acceptSession', args: { owner } } }))
      ),
    },
  };
  return identity;
}

function make(over: Partial<Chain> = {}) {
  const chain: Chain = {
    pgas: new Map([[PLAYER, SESSION_BUDGET + SETUP_OVERHEAD]]),
    session: [ZERO, 0n, 0],
    keyOwner: new Map(),
    mapped: true,
    ...over,
  };
  const { api, batch } = fakeApi(chain);
  const identity = fakeIdentity(chain);
  const session = createRegistrySession({
    api: api as never,
    player: PLAYER,
    playerSigner: 'player-signer' as never,
    identity: identity,
    derivationIndex: 0,
    storePrefix: 'test',
  });
  return { chain, session, identity, batch };
}

/** The session key the last setup funded (its SS58 and H160). */
let lastKey: { ss58: string; h160: string } | null = null;
function storedKey(): { ss58: string; h160: string } {
  if (!lastKey) throw new Error('no setup seen');
  return lastKey;
}

/** Run setup and record the key it funded. */
async function setUp(m: ReturnType<typeof make>) {
  submitAndWatch.mockResolvedValueOnce(ok({ events: [] }));
  await m.session.deps.setUp();
  const fund = m.batch()?.calls.find((c) => c.name === 'transfer_keep_alive');
  const target = (fund?.args as { target: { value: string } } | undefined)?.target.value;
  if (target) lastKey = { ss58: target, h160: ss58ToH160(target) };
}

describe('registry session setup', () => {
  beforeEach(() => {
    memory.clear();
    submitAndWatch.mockReset();
    lastKey = null;
  });

  it('is ONE player-signed V1 batch: fund the key SS58 with PGAS, offer it in Identity', async () => {
    const m = make();
    await setUp(m);

    expect(submitAndWatch).toHaveBeenCalledTimes(1);
    expect(submitAndWatch.mock.calls[0][1]).toBe('player-signer');
    const calls = m.batch()!.calls;
    expect(calls.map((c) => c.name)).toEqual(['transfer_keep_alive', 'registerSession']);
    // PGAS goes to the key's SS58 account by Assets.transfer_keep_alive: that
    // creates and maps the account. (A precompile transfer to its H160 would
    // be lost.)
    expect(calls[0].args).toMatchObject({ id: PGAS_ASSET_ID, amount: SESSION_BUDGET });
    const key = storedKey();
    expect((calls[1].args as { session: string }).session).toBe(key.h160);
    // The expiry is inside Identity's maxTtl (registerSession reverts TtlTooLong).
    const expiresAt = (calls[1].args as { expiresAt: bigint }).expiresAt;
    expect(expiresAt).toBeGreaterThan(NOW_S);
    expect(expiresAt).toBeLessThanOrEqual(NOW_S + 604_800n);

    // Signed on pipeline V1, so a PGAS-only product account can pay the fee.
    const wrapped = submitAndWatch.mock.calls[0][0] as {
      createSubmitAndWatch: (s: unknown, o: object) => unknown;
    };
    wrapped.createSubmitAndWatch('player-signer', { mortalityPeriod: 64 });
    const inner = m.batch()!.tx as { createSubmitAndWatch: ReturnType<typeof vi.fn> };
    expect(inner.createSubmitAndWatch).toHaveBeenCalledWith('player-signer', {
      mortalityPeriod: 64,
      ...V1_OPTIONS,
    });
  });

  it('maps an unmapped player in the same batch, so play needs no second prompt', async () => {
    const m = make({ mapped: false });
    await setUp(m);
    expect(m.batch()!.calls.map((c) => c.name)).toEqual([
      'transfer_keep_alive',
      'map_account',
      'registerSession',
    ]);
  });

  it('sends nothing when the player lacks the PGAS (the sponsor falls back to normal signing)', async () => {
    const m = make({ pgas: new Map([[PLAYER, SESSION_BUDGET]]) });
    await expect(m.session.deps.setUp()).rejects.toThrow(/Not enough PGAS/);
    expect(submitAndWatch).not.toHaveBeenCalled();
  });

  it('replaces a stored key that was bound before and is now dead (burned keys never rebind)', async () => {
    const m = make();
    await setUp(m);
    const first = storedKey();
    // That key was accepted once and its session has since expired.
    m.chain.keyOwner.set(first.h160.toLowerCase(), ss58ToH160(PLAYER));
    m.chain.session = [first.h160, NOW_S - 1n, 2];
    await setUp(m);
    expect(storedKey().h160).not.toBe(first.h160);
  });
});

describe('registry session calls', () => {
  beforeEach(() => {
    memory.clear();
    submitAndWatch.mockReset();
    lastKey = null;
  });

  it('the first call carries acceptSession; later calls do not', async () => {
    const m = make();
    await setUp(m);

    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await m.session.submit({ decodedCall: { name: 'startGame' } });
    expect(m.batch()!.calls.map((c) => c.name)).toEqual(['acceptSession', 'startGame']);
    // The accept is dry-run as the key (only the key can accept) for the player.
    expect(m.identity.acceptSession.prepare).toHaveBeenCalledWith(ss58ToH160(PLAYER), {
      origin: storedKey().ss58,
    });
    // Signed by the session key, not the player: no host prompt.
    expect(submitAndWatch.mock.calls[1][1]).not.toBe('player-signer');

    await m.session.submit({ decodedCall: { name: 'submitTurn' } });
    expect(m.batch()!.calls.map((c) => c.name)).toEqual(['submitTurn']);
  });

  it('a key that cannot pay its V1 fee is expired, so the call is resent with normal signing', async () => {
    const m = make();
    await setUp(m);
    submitAndWatch.mockResolvedValue(
      err(new TxValidityError({ type: 'Invalid', value: { type: 'Payment' } }, 'Invalid.Payment'))
    );
    await expect(m.session.submit({ decodedCall: {} })).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('a failed game call on a live session is the game error, not an expiry (no double prompt)', async () => {
    const m = make();
    await setUp(m);
    m.chain.session = [storedKey().h160, NOW_S + 86_400n, 1];
    submitAndWatch.mockResolvedValue(
      err(new TxDispatchError({ type: 'Module' }, 'Revive.ContractReverted'))
    );
    const e = await m.session.submit({ decodedCall: {} }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TxDispatchError);
  });

  it('a failed call after the session was revoked is an expiry', async () => {
    const m = make();
    await setUp(m);
    m.chain.session = [ZERO, 0n, 0];
    submitAndWatch.mockResolvedValue(
      err(new TxDispatchError({ type: 'Module' }, 'Revive.ContractReverted'))
    );
    await expect(m.session.submit({ decodedCall: {} })).rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe('registry session restore', () => {
  beforeEach(() => {
    memory.clear();
    submitAndWatch.mockReset();
    lastKey = null;
  });

  it('a stored, bound, funded key with time left is ready: no prompt on reload', async () => {
    const m = make();
    await setUp(m);
    const key = storedKey();
    m.chain.session = [key.h160, NOW_S + 86_400n, 2];
    m.chain.pgas.set(key.ss58, SESSION_BUDGET);
    expect(await m.session.deps.sessionReady()).toBe(true);
    // Bound already: the next call does not accept again.
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await m.session.submit({ decodedCall: { name: 'submitTurn' } });
    expect(m.batch()!.calls.map((c) => c.name)).toEqual(['submitTurn']);
  });

  it('is not ready when the key ran low on PGAS or the session ends within the margin', async () => {
    const m = make();
    await setUp(m);
    const key = storedKey();
    m.chain.session = [key.h160, NOW_S + 86_400n, 2];
    m.chain.pgas.set(key.ss58, 1n);
    expect(await m.session.deps.sessionReady()).toBe(false);
    m.chain.pgas.set(key.ss58, SESSION_BUDGET);
    m.chain.session = [key.h160, NOW_S + 60n, 2];
    expect(await m.session.deps.sessionReady()).toBe(false);
  });
});

describe('classifySession', () => {
  const key = '0x' + 'ab'.repeat(20);
  it('trusts only the stored key, offered or bound, with time left', () => {
    expect(classifySession({ key, expiresAt: NOW_S + 86_400n, state: 2 }, key, NOW_S)).toEqual({
      usable: true,
      accepted: true,
    });
    expect(classifySession({ key, expiresAt: NOW_S + 86_400n, state: 1 }, key, NOW_S)).toEqual({
      usable: true,
      accepted: false,
    });
    const other = '0x' + 'cd'.repeat(20);
    expect(
      classifySession({ key: other, expiresAt: NOW_S + 86_400n, state: 2 }, key, NOW_S)
    ).toMatchObject({ usable: false });
    expect(classifySession({ key, expiresAt: NOW_S, state: 2 }, key, NOW_S)).toMatchObject({
      usable: false,
    });
  });
});
