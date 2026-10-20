/**
 * Sponsored play — PGAS allowance + a proxy session key.
 *
 * Goal: the player approves once, then every game call is signed silently by
 * a local session key and paid in PGAS, so the player never holds PAS/DOT.
 *
 * Pattern: **proxy sessions** (see the gaming-retreat-2026 session-autosigning
 * skill). The session key is an `Any` proxy of the player's product account and
 * wraps each contract call in `Proxy.proxy(player, call)`. The arena contract
 * still sees `msg.sender = player`, so the contract needs no change. Costs on
 * Paseo Next: `Proxy.proxy` is outside the free `ChargePGAS` filter, so each
 * call pays a normal fee, in PGAS through the DOT<->PGAS pool; `add_proxy`
 * reserves a native deposit, which the setup batch buys with PGAS.
 *
 * Flow (host only):
 *   1. No PGAS on the product account -> request `SmartContractAllowance`
 *      (host prompt; the host claims PGAS with a personhood proof).
 *   2. ONE product-account-signed batch, fee in PGAS: swap PGAS for the proxy
 *      deposit, send the session key a PGAS fee budget, `add_proxy`.
 *   3. Game calls: the session key signs `Proxy.proxy(player, Revive.call)`.
 *
 * If the player declines either prompt, or the host cannot sponsor, play falls
 * back to normal product-account signing. If a live session stops working
 * (out of PGAS, proxy removed), that call falls back to normal signing and the
 * next game action sets the session up again.
 *
 * Note: contract storage deposits are charged in PGAS to the call's origin —
 * the player's product account, not the session key.
 */

import { Enum, type SS58String, type TypedApi } from 'polkadot-api';
import type { CommonSignerTxCreator } from '@polkadot-api/signers-common';
import type { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { requestResourceAllocation } from '@parity/product-sdk-host';
import { SessionKeyManager, type DerivedAccount } from '@parity/product-sdk-keys';
import { createLocalKvStore } from '@parity/product-sdk-local-storage';
import {
  submitAndWatch,
  TxDispatchError,
  TxValidityError,
  type SubmitOptions,
  type SubmittableTransaction,
  type TxResult,
} from '@parity/product-sdk-tx';
import { accountIdBytes, publicKeysEqual, ss58ToH160 } from '@parity/product-sdk-address';

type AssetHubApi = TypedApi<typeof paseo_asset_hub>;

/** PGAS on Paseo Next Asset Hub: trust-backed asset id, sufficient, burnable. */
export const PGAS_ASSET_ID = 2_000_000_000;

/** `ChargeAssetTxPayment` fee asset: pay the fee in PGAS through the pool. */
export const PGAS_FEE_ASSET = {
  parents: 0,
  interior: Enum('X2', [Enum('PalletInstance', 50), Enum('GeneralIndex', BigInt(PGAS_ASSET_ID))]),
};
const PGAS_LOCATION = PGAS_FEE_ASSET;
const NATIVE_LOCATION = { parents: 1, interior: Enum('Here') };

/**
 * PGAS the session key holds for fees. One game call costs about 0.07–0.2e9
 * PGAS at the pool price on 2026-10-20, so this covers a few full runs.
 */
export const SESSION_FEE_BUDGET = 3_000_000_000n;
/** Below this, the session cannot be trusted to pay the next call: top it up. */
export const SESSION_MIN_PGAS = 400_000_000n;

// ── Policy (chain-free, unit-tested) ────────────────────────────────────────

/**
 * - `off`: not tried yet on this connection.
 * - `active`: game calls go through the session key, no prompts.
 * - `expired`: the session stopped working; the next action sets it up again.
 * - `declined`: the player said no; normal signing for this connection.
 * - `unavailable`: no host sponsorship here (standalone, or host said
 *   `NotAvailable`); normal signing.
 */
export type SponsorStatus = 'off' | 'active' | 'expired' | 'declined' | 'unavailable';

export type AllowanceOutcome = 'Allocated' | 'Rejected' | 'NotAvailable';

/** The session can no longer sign for the player (no PGAS, proxy gone). */
export class SessionExpiredError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SessionExpiredError';
    this.cause = cause;
  }
}

export interface SponsorDeps {
  /** PGAS on the player's product account. */
  playerPgas(): Promise<bigint>;
  /** Ask the host for the `SmartContractAllowance` (one prompt). */
  requestAllowance(): Promise<AllowanceOutcome>;
  /** True when a stored session key is a funded proxy of the player. */
  sessionReady(): Promise<boolean>;
  /** Sign the one setup batch with the product account. Throws on reject. */
  setUp(): Promise<void>;
}

export interface Sponsor {
  readonly status: SponsorStatus;
  /** Make sure a session is live if the player allows it. Never throws. */
  ensure(): Promise<SponsorStatus>;
  /**
   * Run a game call through the session when it is live, otherwise (or when
   * the session expires during the call) through normal signing.
   */
  send<T>(viaSession: () => Promise<T>, direct: () => Promise<T>): Promise<T>;
}

export function createSponsor(deps: SponsorDeps, initial: SponsorStatus = 'off'): Sponsor {
  let status: SponsorStatus = initial;
  let pending: Promise<SponsorStatus> | null = null;

  async function setUpSession(): Promise<SponsorStatus> {
    try {
      if (await deps.sessionReady()) return 'active';
      if ((await deps.playerPgas()) === 0n) {
        const outcome = await deps.requestAllowance();
        if (outcome === 'Rejected') return 'declined';
        if (outcome === 'NotAvailable') return 'unavailable';
      }
      await deps.setUp();
      return 'active';
    } catch (err) {
      // A rejected signature or a failed setup: keep playing with normal
      // signing and do not ask again on this connection.
      console.warn('Sponsored play setup failed; using normal signing:', err);
      return 'declined';
    }
  }

  return {
    get status() {
      return status;
    },

    ensure() {
      if (status !== 'off' && status !== 'expired') return Promise.resolve(status);
      pending ??= setUpSession().then((s) => {
        status = s;
        pending = null;
        return s;
      });
      return pending;
    },

    async send<T>(viaSession: () => Promise<T>, direct: () => Promise<T>): Promise<T> {
      if (status !== 'active') return direct();
      try {
        return await viaSession();
      } catch (err) {
        if (!(err instanceof SessionExpiredError)) throw err;
        console.warn('Session expired; signing this call normally:', err);
        status = 'expired';
        return direct();
      }
    },
  };
}

// ── Chain plumbing (verified on chain by scripts/e2e-session.mjs) ───────────

/**
 * Wrap a tx so the signer pays its fee in PGAS (submitAndWatch has no
 * fee-asset option of its own).
 */
export const payInPgas = (tx: SubmittableTransaction): SubmittableTransaction => ({
  createSubmitAndWatch: (signer, o) =>
    tx.createSubmitAndWatch(signer, { ...o, asset: PGAS_FEE_ASSET } as typeof o),
});

/** Find `Proxy.ProxyExecuted` and report whether the wrapped call succeeded. */
export function proxyExecutedResult(
  events: unknown[]
): { ok: true } | { ok: false; error: unknown } | null {
  for (const e of events) {
    const ev = (e as { event?: unknown }).event ?? e;
    const { type, value } = ev as { type?: string; value?: { type?: string; value?: unknown } };
    if (type !== 'Proxy' || value?.type !== 'ProxyExecuted') continue;
    const result = (value.value as { result?: { success: boolean; value?: unknown } }).result;
    if (!result) return null;
    return result.success ? { ok: true } : { ok: false, error: result.value };
  }
  return null;
}

/** A Revive call prepared by `@parity/product-sdk-contracts` `.prepare()`. */
export interface PreparedCall {
  decodedCall: unknown;
}

export interface ProxySession {
  deps: SponsorDeps;
  /** Sign `Proxy.proxy(player, call)` with the session key, fee in PGAS. */
  submit(call: PreparedCall, options?: SubmitOptions): Promise<TxResult>;
}

export function createProxySession(opts: {
  api: AssetHubApi;
  player: SS58String;
  playerSigner: CommonSignerTxCreator;
  /** Product-account derivation index the allowance targets. */
  derivationIndex: number;
  /** Namespace for the stored session key. */
  storePrefix: string;
}): ProxySession {
  const { api, player, playerSigner } = opts;
  let session: DerivedAccount | null = null;
  let keys: SessionKeyManager | null = null;

  async function keyManager(): Promise<SessionKeyManager> {
    keys ??= new SessionKeyManager({
      store: await createLocalKvStore({ prefix: opts.storePrefix }),
      name: `session-${player}`,
    });
    return keys;
  }

  const pgasOf = async (address: SS58String): Promise<bigint> =>
    (await api.query.Assets.Account.getValue(PGAS_ASSET_ID, address, { at: 'best' }))?.balance ??
    0n;

  async function isProxy(key: DerivedAccount): Promise<boolean> {
    const [proxies] = await api.query.Proxy.Proxies.getValue(player, { at: 'best' });
    return proxies.some(
      (p) =>
        p.proxy_type.type === 'Any' &&
        p.delay === 0 &&
        // Compare public keys: the chain may encode another SS58 prefix.
        publicKeysEqual(accountIdBytes(p.delegate), key.publicKey)
    );
  }

  const deps: SponsorDeps = {
    playerPgas: () => pgasOf(player),

    async requestAllowance() {
      const r = await requestResourceAllocation([
        { tag: 'SmartContractAllowance', value: { tag: 'Index', value: opts.derivationIndex } },
      ]);
      if (!r.ok) return 'NotAvailable';
      return r.value[0] ?? 'NotAvailable';
    },

    async sessionReady() {
      const stored = await (await keyManager()).get();
      if (!stored) return false;
      session = stored.account;
      return (await isProxy(session)) && (await pgasOf(session.ss58Address)) >= SESSION_MIN_PGAS;
    },

    async setUp() {
      session = (await (await keyManager()).getOrCreate()).account;
      const calls: unknown[] = [];
      const proxied = await isProxy(session);
      if (!proxied) {
        // `add_proxy` reserves a native deposit on the player. Buy what is
        // missing with PGAS (the player may hold no native at all).
        const deposit =
          (await api.constants.Proxy.ProxyDepositBase()) +
          (await api.constants.Proxy.ProxyDepositFactor());
        const ed = await api.constants.Balances.ExistentialDeposit();
        const { free } = (await api.query.System.Account.getValue(player, { at: 'best' })).data;
        const missing = deposit + ed > free ? deposit + ed - free : 0n;
        if (missing > 0n) {
          const pgasIn = await api.apis.AssetConversionApi.quote_price_tokens_for_exact_tokens(
            PGAS_LOCATION,
            NATIVE_LOCATION,
            missing,
            true,
            { at: 'best' }
          );
          if (!pgasIn) throw new Error('No PGAS->PAS pool quote for the proxy deposit');
          calls.push(
            api.tx.AssetConversion.swap_tokens_for_exact_tokens({
              path: [PGAS_LOCATION, NATIVE_LOCATION],
              amount_out: missing,
              amount_in_max: (pgasIn * 105n) / 100n,
              send_to: player,
              keep_alive: false,
            }).decodedCall
          );
        }
      }
      const sessionPgas = await pgasOf(session.ss58Address);
      if (sessionPgas < SESSION_FEE_BUDGET) {
        calls.push(
          api.tx.Assets.transfer({
            id: PGAS_ASSET_ID,
            target: Enum('Id', session.ss58Address),
            amount: SESSION_FEE_BUDGET - sessionPgas,
          }).decodedCall
        );
      }
      // Receiving PGAS auto-maps a new account, but an older account may not be
      // mapped; map it here so the first game call needs no extra prompt.
      const mapped = await api.query.Revive.OriginalAccount.getValue(ss58ToH160(player), {
        at: 'best',
      });
      if (mapped === undefined) calls.push(api.tx.Revive.map_account().decodedCall);
      if (!proxied) {
        calls.push(
          api.tx.Proxy.add_proxy({
            delegate: Enum('Id', session.ss58Address),
            proxy_type: Enum('Any'),
            delay: 0,
          }).decodedCall
        );
      }
      if (calls.length === 0) return;
      const r = await submitAndWatch(
        payInPgas(api.tx.Utility.batch_all({ calls: calls as never })),
        playerSigner
      );
      if (!r.ok) throw r.error;
    },
  };

  return {
    deps,
    async submit(call, options) {
      if (!session) throw new SessionExpiredError('No session key loaded');
      const tx = api.tx.Proxy.proxy({
        real: Enum('Id', player),
        force_proxy_type: undefined,
        call: call.decodedCall as never,
      });
      const r = await submitAndWatch(payInPgas(tx), session.signer, options);
      if (!r.ok) {
        // Not valid before inclusion (e.g. `Payment`: the session cannot pay
        // the fee), or the proxy link is gone: nothing ran, so the caller can
        // safely retry with normal signing.
        if (r.error instanceof TxValidityError) {
          throw new SessionExpiredError(r.error.message, r.error);
        }
        if (r.error instanceof TxDispatchError && r.error.formatted.includes('NotProxy')) {
          throw new SessionExpiredError(r.error.message, r.error);
        }
        throw r.error;
      }
      // The outer extrinsic succeeds even when the wrapped call fails.
      const inner = proxyExecutedResult(r.value.events);
      if (!inner) throw new Error('Proxied call: no Proxy.ProxyExecuted event');
      if (!inner.ok) {
        throw new Error(
          `Proxied call failed: ${JSON.stringify(inner.error, (_k, v: unknown) =>
            typeof v === 'bigint' ? v.toString() : v
          )}`
        );
      }
      return r.value;
    },
  };
}
