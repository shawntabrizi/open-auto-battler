import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err } from '@parity/result';
import { TxDispatchError, TxValidityError } from '@parity/product-sdk-tx';
import type * as TxModule from '@parity/product-sdk-tx';
import { ss58Encode } from '@parity/product-sdk-address';
import {
  createProxySession,
  createSponsor,
  proxyExecutedResult,
  PGAS_FEE_ASSET,
  SESSION_FEE_BUDGET,
  SessionExpiredError,
  type AllowanceOutcome,
  type SponsorDeps,
} from './session';

// ── Sponsor policy ──────────────────────────────────────────────────────────
//
// The product promise: the player approves once, then plays with no prompts.
// In these tests `direct` stands for "sign with the product account", which in
// a host is a signing prompt; `viaSession` is the silent session-key path.

function fakeDeps(over: Partial<SponsorDeps> = {}) {
  const deps = {
    playerPgas: vi.fn(() => Promise.resolve(0n)),
    requestAllowance: vi.fn((): Promise<AllowanceOutcome> => Promise.resolve('Allocated')),
    sessionReady: vi.fn(() => Promise.resolve(false)),
    setUp: vi.fn(() => Promise.resolve()),
    ...over,
  };
  return deps;
}

function paths() {
  const viaSession = vi.fn(() => Promise.resolve('session'));
  const direct = vi.fn(() => Promise.resolve('direct'));
  return { viaSession, direct };
}

describe('createSponsor', () => {
  it('after one setup, every game call goes through the session (no prompts)', async () => {
    const deps = fakeDeps();
    const sponsor = createSponsor(deps);
    expect(await sponsor.ensure()).toBe('active');

    const { viaSession, direct } = paths();
    for (let i = 0; i < 12; i++) {
      await sponsor.ensure();
      await sponsor.send(viaSession, direct);
    }
    // One allowance prompt and one setup signature, then 12 silent calls.
    expect(deps.requestAllowance).toHaveBeenCalledTimes(1);
    expect(deps.setUp).toHaveBeenCalledTimes(1);
    expect(viaSession).toHaveBeenCalledTimes(12);
    expect(direct).not.toHaveBeenCalled();
  });

  it('skips the allowance prompt when the player already holds PGAS', async () => {
    const deps = fakeDeps({ playerPgas: vi.fn(() => Promise.resolve(5n)) });
    expect(await createSponsor(deps).ensure()).toBe('active');
    expect(deps.requestAllowance).not.toHaveBeenCalled();
    expect(deps.setUp).toHaveBeenCalledTimes(1);
  });

  it('restores a live stored session without any prompt', async () => {
    const deps = fakeDeps({ sessionReady: vi.fn(() => Promise.resolve(true)) });
    expect(await createSponsor(deps).ensure()).toBe('active');
    expect(deps.requestAllowance).not.toHaveBeenCalled();
    expect(deps.setUp).not.toHaveBeenCalled();
  });

  it('falls back to normal signing when the player denies the allowance, and does not ask again', async () => {
    const deps = fakeDeps({ requestAllowance: vi.fn(() => Promise.resolve('Rejected' as const)) });
    const sponsor = createSponsor(deps);
    expect(await sponsor.ensure()).toBe('declined');
    expect(await sponsor.ensure()).toBe('declined');

    const { viaSession, direct } = paths();
    expect(await sponsor.send(viaSession, direct)).toBe('direct');
    expect(viaSession).not.toHaveBeenCalled();
    // No setup prompt after a "no", and no second allowance prompt.
    expect(deps.setUp).not.toHaveBeenCalled();
    expect(deps.requestAllowance).toHaveBeenCalledTimes(1);
  });

  it('treats a host without sponsorship as unavailable and plays normally', async () => {
    const deps = fakeDeps({
      requestAllowance: vi.fn(() => Promise.resolve('NotAvailable' as const)),
    });
    const sponsor = createSponsor(deps);
    expect(await sponsor.ensure()).toBe('unavailable');
    const { viaSession, direct } = paths();
    expect(await sponsor.send(viaSession, direct)).toBe('direct');
  });

  it('falls back to normal signing when the player rejects the setup batch', async () => {
    const deps = fakeDeps({ setUp: vi.fn(() => Promise.reject(new Error('rejected'))) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sponsor = createSponsor(deps);
    expect(await sponsor.ensure()).toBe('declined');
    await sponsor.ensure();
    expect(deps.setUp).toHaveBeenCalledTimes(1);
    const { viaSession, direct } = paths();
    expect(await sponsor.send(viaSession, direct)).toBe('direct');
  });

  it('runs setup once when several actions race to enable it', async () => {
    const deps = fakeDeps();
    const sponsor = createSponsor(deps);
    const all = await Promise.all([sponsor.ensure(), sponsor.ensure(), sponsor.ensure()]);
    expect(all).toEqual(['active', 'active', 'active']);
    expect(deps.setUp).toHaveBeenCalledTimes(1);
  });

  it('when the session expires mid-run, that call is signed normally and the next action re-arms the session', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = fakeDeps();
    const sponsor = createSponsor(deps);
    await sponsor.ensure();

    const direct = vi.fn(() => Promise.resolve('direct'));
    const expired = vi.fn(() => Promise.reject(new SessionExpiredError('Invalid.Payment')));
    // The turn is not lost: it goes out with normal signing.
    expect(await sponsor.send(expired, direct)).toBe('direct');
    expect(sponsor.status).toBe('expired');

    // Next action: one setup prompt (top-up / re-add), then silent again.
    expect(await sponsor.ensure()).toBe('active');
    expect(deps.setUp).toHaveBeenCalledTimes(2);
    const { viaSession, direct: direct2 } = paths();
    expect(await sponsor.send(viaSession, direct2)).toBe('session');
    expect(direct2).not.toHaveBeenCalled();
  });

  it('does not resend a failed game call with normal signing (it would prompt and could double-apply)', async () => {
    const sponsor = createSponsor(fakeDeps());
    await sponsor.ensure();
    const direct = vi.fn(() => Promise.resolve('direct'));
    const reverted = vi.fn(() => Promise.reject(new Error('submitTurn failed: ContractReverted')));
    await expect(sponsor.send(reverted, direct)).rejects.toThrow('ContractReverted');
    expect(direct).not.toHaveBeenCalled();
    expect(sponsor.status).toBe('active');
  });
});

// ── Proxy plumbing ──────────────────────────────────────────────────────────

describe('proxyExecutedResult', () => {
  it('reports the wrapped call failure even though the outer extrinsic succeeded', () => {
    const events = [
      { type: 'System', value: { type: 'ExtrinsicSuccess', value: {} } },
      {
        type: 'Proxy',
        value: {
          type: 'ProxyExecuted',
          value: { result: { success: false, value: { type: 'Module' } } },
        },
      },
    ];
    expect(proxyExecutedResult(events)).toEqual({ ok: false, error: { type: 'Module' } });
  });

  it('accepts PAPI event records wrapped in { event }', () => {
    const events = [
      {
        event: {
          type: 'Proxy',
          value: { type: 'ProxyExecuted', value: { result: { success: true } } },
        },
      },
    ];
    expect(proxyExecutedResult(events)).toEqual({ ok: true });
  });

  it('returns null when the call was not proxied', () => {
    expect(proxyExecutedResult([{ type: 'Revive', value: { type: 'ContractEmitted' } }])).toBe(
      null
    );
  });
});

// createProxySession talks to the host store and the chain; fake both.
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

const PLAYER = ss58Encode(new Uint8Array(32).fill(7), 42);
// The last batch_all tx built by the fake api, to inspect how it is submitted.
let batchTx: { createSubmitAndWatch: unknown };

function fakeApi(opts: { proxies: () => string[]; sessionPgas: bigint }) {
  const calls: unknown[] = [];
  const tx = (name: string) => (args?: unknown) => ({
    decodedCall: { name, args },
    createSubmitAndWatch: vi.fn(),
  });
  const api = {
    query: {
      Assets: {
        Account: {
          getValue: (_id: number, who: string) =>
            Promise.resolve({ balance: who === PLAYER ? 10n ** 10n : opts.sessionPgas }),
        },
      },
      Proxy: {
        Proxies: {
          getValue: () =>
            Promise.resolve([
              opts.proxies().map((delegate) => ({
                delegate,
                proxy_type: { type: 'Any' },
                delay: 0,
              })),
              0n,
            ]),
        },
      },
      System: { Account: { getValue: () => Promise.resolve({ data: { free: 0n } }) } },
      Revive: { OriginalAccount: { getValue: () => Promise.resolve('0xmapped') } },
    },
    constants: {
      Proxy: {
        ProxyDepositBase: () => Promise.resolve(2_004_000_000n),
        ProxyDepositFactor: () => Promise.resolve(3_300_000n),
      },
      Balances: { ExistentialDeposit: () => Promise.resolve(100_000_000n) },
    },
    apis: {
      AssetConversionApi: {
        quote_price_tokens_for_exact_tokens: () => Promise.resolve(6_000_000_000n),
      },
    },
    tx: {
      AssetConversion: { swap_tokens_for_exact_tokens: tx('swap') },
      Assets: { transfer: tx('fund-session') },
      Proxy: { add_proxy: tx('add_proxy'), proxy: tx('proxy') },
      Revive: { map_account: tx('map_account') },
      Utility: {
        batch_all: (a: { calls: unknown[] }) => {
          calls.push(...a.calls);
          batchTx = tx('batch_all')(a);
          return batchTx;
        },
      },
    },
  };
  return { api, batched: calls };
}

describe('createProxySession', () => {
  beforeEach(() => {
    memory.clear();
    submitAndWatch.mockReset();
  });

  function make(proxies: string[] = [], sessionPgas = 0n) {
    const state = { proxies };
    const { api, batched } = fakeApi({ proxies: () => state.proxies, sessionPgas });
    const session = createProxySession({
      api: api as never,
      player: PLAYER,
      playerSigner: 'player-signer' as never,
      derivationIndex: 0,
      storePrefix: 'test',
    });
    return { session, batched, state };
  }

  it('setup is ONE player-signed batch that buys the deposit, funds the session and adds the proxy', async () => {
    const { session, batched } = make();
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await session.deps.setUp();

    expect(submitAndWatch).toHaveBeenCalledTimes(1);
    expect(submitAndWatch.mock.calls[0][1]).toBe('player-signer');
    expect(batched.map((c) => (c as { name: string }).name)).toEqual([
      'swap',
      'fund-session',
      'add_proxy',
    ]);
    const fund = batched[1] as { args: { amount: bigint } };
    expect(fund.args.amount).toBe(SESSION_FEE_BUDGET);

    // The player may hold no PAS, so the batch fee must be paid in PGAS.
    const wrapped = submitAndWatch.mock.calls[0][0] as {
      createSubmitAndWatch: (s: unknown, o: object) => unknown;
    };
    const inner = vi.fn();
    batchTx.createSubmitAndWatch = inner;
    wrapped.createSubmitAndWatch('player-signer', { mortality: 1 });
    expect(inner).toHaveBeenCalledWith('player-signer', { mortality: 1, asset: PGAS_FEE_ASSET });
  });

  it('game calls are signed by the session key, wrapped in Proxy.proxy for the player', async () => {
    const { session } = make();
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await session.deps.setUp();

    submitAndWatch.mockResolvedValue(
      ok({
        events: [
          {
            type: 'Proxy',
            value: { type: 'ProxyExecuted', value: { result: { success: true } } },
          },
        ],
      })
    );
    await session.submit({ decodedCall: { name: 'Revive.call' } });
    const [wrapped, signer] = submitAndWatch.mock.calls[1] as [unknown, { publicKey?: unknown }];
    // Not the product account (that would prompt): the local session key.
    expect(signer).not.toBe('player-signer');
    expect(signer.publicKey).toBeInstanceOf(Uint8Array);
    expect(wrapped).toHaveProperty('createSubmitAndWatch');
  });

  it('a session that cannot pay its fee is reported as expired (so the call is resent normally)', async () => {
    const { session } = make();
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await session.deps.setUp();
    submitAndWatch.mockResolvedValue(
      err(new TxValidityError({ type: 'Invalid', value: { type: 'Payment' } }, 'Invalid.Payment'))
    );
    await expect(session.submit({ decodedCall: {} })).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('a removed proxy is reported as expired', async () => {
    const { session } = make();
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await session.deps.setUp();
    submitAndWatch.mockResolvedValue(err(new TxDispatchError({}, 'Proxy.NotProxy')));
    await expect(session.submit({ decodedCall: {} })).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('a failed game call inside the proxy is an error, not an expiry', async () => {
    const { session } = make();
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await session.deps.setUp();
    submitAndWatch.mockResolvedValue(
      ok({
        events: [
          {
            type: 'Proxy',
            value: {
              type: 'ProxyExecuted',
              value: { result: { success: false, value: 'Revive.ContractTrapped' } },
            },
          },
        ],
      })
    );
    const p = session.submit({ decodedCall: {} });
    await expect(p).rejects.toThrow('ContractTrapped');
    await expect(p).rejects.not.toBeInstanceOf(SessionExpiredError);
  });

  it('a stored session that is still a funded proxy is ready (no setup prompt)', async () => {
    const { session, state } = make([], SESSION_FEE_BUDGET);
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await session.deps.setUp();
    // Pretend the chain now lists the stored key as the player's proxy.
    const { SessionKeyManager } = await import('@parity/product-sdk-keys');
    const { createLocalKvStore } = await import('@parity/product-sdk-local-storage');
    const keys = new SessionKeyManager({
      store: await createLocalKvStore({ prefix: 'test' }),
      name: `session-${PLAYER}`,
    });
    const key = await keys.get();
    state.proxies = [key!.account.ss58Address];
    expect(await session.deps.sessionReady()).toBe(true);
  });

  it('a stored session whose proxy was removed is not ready', async () => {
    const { session } = make([], SESSION_FEE_BUDGET);
    submitAndWatch.mockResolvedValue(ok({ events: [] }));
    await session.deps.setUp();
    expect(await session.deps.sessionReady()).toBe(false);
  });
});
