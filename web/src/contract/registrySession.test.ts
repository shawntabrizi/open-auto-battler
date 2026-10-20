import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err } from '@parity/result';
import { TxDispatchError, TxValidityError } from '@parity/product-sdk-tx';
import type * as TxModule from '@parity/product-sdk-tx';
import { ss58Encode, ss58ToH160 } from '@parity/product-sdk-address';
import {
  chooseFunding,
  classifySession,
  createRegistrySession,
  PAS_SESSION_BUDGET,
  PAS_SESSION_MIN,
  PAS_SETUP_OVERHEAD,
  SESSION_BUDGET,
  SESSION_MIN_PGAS,
  SETUP_OVERHEAD,
} from './registrySession';
import { V1_OPTIONS } from './v1';
import { PGAS_ASSET_ID, SessionExpiredError } from './session';

// The product promise (docs/CONTRACT_ARCHITECTURE.md 7.4): ONE player prompt
// sets up the session; the key then plays with no prompt. Fee in PGAS (V1) by
// default; in PAS (V0) when the player cannot fund PGAS.

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
  /** Free native balance per SS58. */
  pas: Map<string, bigint>;
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
      System: {
        Account: {
          getValue: (who: string) => Promise.resolve({ data: { free: chain.pas.get(who) ?? 0n } }),
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
      Assets: {
        transfer_keep_alive: tx('transfer_keep_alive'),
        transfer_all: tx('Assets.transfer_all'),
      },
      Balances: {
        transfer_keep_alive: tx('Balances.transfer_keep_alive'),
        transfer_all: tx('Balances.transfer_all'),
      },
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
    revokeSession: {
      prepare: vi.fn(() => Promise.resolve(ok({ decodedCall: { name: 'revokeSession' } }))),
    },
  };
  return identity;
}

function make(over: Partial<Chain> = {}) {
  const chain: Chain = {
    pgas: new Map([[PLAYER, SESSION_BUDGET + SETUP_OVERHEAD]]),
    pas: new Map(),
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
  const fund = m.batch()?.calls.find((c) => c.name.endsWith('transfer_keep_alive'));
  const args = fund?.args as { target?: { value: string }; dest?: { value: string } } | undefined;
  const target = (args?.target ?? args?.dest)?.value;
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

  it('sends nothing when the player can fund neither PGAS nor PAS (the sponsor falls back to normal signing)', async () => {
    const m = make({
      pgas: new Map([[PLAYER, SESSION_BUDGET]]),
      pas: new Map([[PLAYER, PAS_SESSION_BUDGET]]),
    });
    await expect(m.session.deps.setUp()).rejects.toThrow(/Not enough PGAS or PAS/);
    expect(submitAndWatch).not.toHaveBeenCalled();
  });

  it('without enough PGAS, is ONE player-signed V0 batch that funds the key SS58 with PAS', async () => {
    // Some PGAS, not enough: the PAS path is safe (a deposit the PGAS cannot
    // cover is taken in PAS, checked live).
    const m = make({
      pgas: new Map([[PLAYER, 50_000_000n]]),
      pas: new Map([[PLAYER, PAS_SESSION_BUDGET + PAS_SETUP_OVERHEAD]]),
    });
    await setUp(m);
    const calls = m.batch()!.calls;
    expect(calls.map((c) => c.name)).toEqual(['Balances.transfer_keep_alive', 'registerSession']);
    expect(calls[0].args).toMatchObject({ value: PAS_SESSION_BUDGET });
    expect((calls[1].args as { session: string }).session).toBe(storedKey().h160);

    // Classic V0: no V1 options, so the fee is native.
    const wrapped = submitAndWatch.mock.calls[0][0] as {
      createSubmitAndWatch: (s: unknown, o: object) => unknown;
    };
    wrapped.createSubmitAndWatch('player-signer', { mortalityPeriod: 64 });
    const inner = m.batch()!.tx as { createSubmitAndWatch: ReturnType<typeof vi.fn> };
    expect(inner.createSubmitAndWatch).toHaveBeenCalledWith('player-signer', {
      mortalityPeriod: 64,
    });
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

  it('a PAS-funded key signs its calls on V0 (native fee), still with no player prompt', async () => {
    const m = make({ pgas: new Map(), pas: new Map([[PLAYER, 100n * PAS_SESSION_BUDGET]]) });
    await setUp(m);
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await m.session.submit({ decodedCall: { name: 'startGame' } });
    expect(m.batch()!.calls.map((c) => c.name)).toEqual(['acceptSession', 'startGame']);
    expect(submitAndWatch.mock.calls[1][1]).not.toBe('player-signer');
    const wrapped = submitAndWatch.mock.calls[1][0] as {
      createSubmitAndWatch: (s: unknown, o: object) => unknown;
    };
    wrapped.createSubmitAndWatch('key', {});
    const inner = m.batch()!.tx as { createSubmitAndWatch: ReturnType<typeof vi.fn> };
    expect(inner.createSubmitAndWatch).toHaveBeenCalledWith('key', {});
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

describe('registry session end (logout)', () => {
  beforeEach(() => {
    memory.clear();
    submitAndWatch.mockReset();
    lastKey = null;
  });

  it('the player revokes the live key (one prompt), then the key returns its PAS (silent)', async () => {
    const m = make({ pgas: new Map(), pas: new Map([[PLAYER, 100n * PAS_SESSION_BUDGET]]) });
    await setUp(m);
    const key = storedKey();
    m.chain.session = [key.h160, NOW_S + 86_400n, 2];
    m.chain.pas.set(key.ss58, PAS_SESSION_BUDGET);
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await m.session.end();

    const [revoke, sweep] = submitAndWatch.mock.calls.slice(1);
    expect(revoke[1]).toBe('player-signer');
    expect(sweep[1]).not.toBe('player-signer');
    expect(submitAndWatch).toHaveBeenCalledTimes(3);
    expect(m.identity.revokeSession.prepare).toHaveBeenCalledWith({ origin: PLAYER });
  });

  it('a key whose session is already gone is only drained: no player prompt', async () => {
    const m = make({ pgas: new Map(), pas: new Map([[PLAYER, 100n * PAS_SESSION_BUDGET]]) });
    await setUp(m);
    m.chain.session = [ZERO, 0n, 0];
    m.chain.pas.set(storedKey().ss58, PAS_SESSION_BUDGET);
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await m.session.end();
    expect(submitAndWatch).toHaveBeenCalledTimes(2);
    expect(submitAndWatch.mock.calls[1][1]).not.toBe('player-signer');
    expect(m.identity.revokeSession.prepare).not.toHaveBeenCalled();
  });
});

describe('chooseFunding', () => {
  const key0 = { keyPgas: 0n, keyPas: 0n };
  const pgasNeed = SESSION_BUDGET + SETUP_OVERHEAD;
  const pasNeed = PAS_SESSION_BUDGET + PAS_SETUP_OVERHEAD;

  it('enough PGAS: PGAS, the default, even when the player also holds PAS', () => {
    expect(chooseFunding({ ...key0, playerPgas: pgasNeed, playerPas: 10n * pasNeed })).toEqual({
      token: 'PGAS',
      topUp: SESSION_BUDGET,
    });
  });

  it('low PGAS and enough PAS: PAS', () => {
    expect(chooseFunding({ ...key0, playerPgas: pgasNeed - 1n, playerPas: pasNeed })).toEqual({
      token: 'PAS',
      topUp: PAS_SESSION_BUDGET,
    });
  });

  it('PAS only: PAS', () => {
    expect(chooseFunding({ ...key0, playerPgas: 0n, playerPas: pasNeed })).toEqual({
      token: 'PAS',
      topUp: PAS_SESSION_BUDGET,
    });
  });

  it('neither enough PGAS nor enough PAS: no session (normal signing)', () => {
    expect(chooseFunding({ ...key0, playerPgas: pgasNeed - 1n, playerPas: pasNeed - 1n })).toBe(
      null
    );
    expect(chooseFunding({ ...key0, playerPgas: 0n, playerPas: 0n })).toBe(null);
  });

  it('tops a low key up to the budget only', () => {
    expect(
      chooseFunding({
        keyPgas: 0n,
        keyPas: PAS_SESSION_MIN - 1n,
        playerPgas: 0n,
        playerPas: pasNeed,
      })
    ).toEqual({ token: 'PAS', topUp: PAS_SESSION_BUDGET - PAS_SESSION_MIN + 1n });
    expect(
      chooseFunding({ keyPgas: SESSION_MIN_PGAS, keyPas: 0n, playerPgas: pgasNeed, playerPas: 0n })
    ).toEqual({ token: 'PGAS', topUp: 0n });
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
