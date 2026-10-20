/**
 * Sponsored play with a registry session (`@oab/identity`,
 * `docs/CONTRACT_ARCHITECTURE.md` section 7.4).
 *
 * The player approves once, then a local session key signs every game call
 * with no prompt. The arena resolves the key to its owner through
 * `@oab/identity`, so the key plays the player's game.
 *
 * Two fee tokens, one flow (`chooseFunding`). Only the funding transfer and
 * the transaction version differ:
 *   - PGAS (the default): every transaction is a v5 general transaction on
 *     extension pipeline V1, fee in PGAS.
 *   - PAS (the fallback, when the player cannot fund the PGAS budget but
 *     holds enough PAS): classic v4 transactions on pipeline V0, native fee.
 *
 * Flow (host only):
 *   1. No PGAS on the product account: request `SmartContractAllowance` (host
 *      prompt; the host claims PGAS with a personhood proof).
 *   2. ONE product-account prompt: `Utility.batch_all[ fund(session SS58,
 *      budget), (Revive.map_account), Revive.call(Identity.registerSession(
 *      session, expiresAt)) ]`. `fund` is `Assets.transfer_keep_alive(PGAS)`
 *      or `Balances.transfer_keep_alive`. Either transfer creates and
 *      auto-maps the key's account. (Never send PGAS to the key's H160
 *      through the ERC-20 precompile: an unmapped H160 is credited to a
 *      fallback account and the funds are lost.)
 *   3. The key's first call, silent: `Utility.batch_all[
 *      Revive.call(acceptSession(owner)), <game call> ]`. Later calls are the
 *      game call alone.
 *   4. End (logout): the player signs `revokeSession` (one prompt), and the
 *      key sends what it has left back to the player (silent).
 *
 * Storage deposits (206.4 M for a new item: the owner record, the key record,
 * a new ghost bracket) are taken from the origin's PGAS when its PGAS covers
 * the deposit, else from its native balance (checked live 2026-10-20, see the
 * M5 status). A PAS-funded key holds no PGAS, so it pays them in PAS.
 *
 * Any failure falls back to normal signing (`createSponsor` in `./session`).
 */

import { Enum, type SS58String, type TypedApi } from 'polkadot-api';
import { getTxCreator, getVerifyMultiSignatureTxCreator } from 'polkadot-api/tx-creator';
import type { CommonSignerTxCreator } from '@polkadot-api/signers-common';
import type { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { requestResourceAllocation } from '@parity/product-sdk-host';
import { SessionKeyManager } from '@parity/product-sdk-keys';
import { createLocalKvStore } from '@parity/product-sdk-local-storage';
import {
  submitAndWatch,
  TxValidityError,
  type SubmitOptions,
  type SubmittableTransaction,
  type TxResult,
} from '@parity/product-sdk-tx';
import { ss58ToH160 } from '@parity/product-sdk-address';
import { sr25519CreateDerive } from '@polkadot-labs/hdkd';
import { entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers';
import { onPipelineV1 } from './v1';
import { PGAS_ASSET_ID, SessionExpiredError, type PreparedCall, type SponsorDeps } from './session';

type AssetHubApi = TypedApi<typeof paseo_asset_hub>;

/**
 * PGAS the setup gives the session key: the Q12 proposal (1.5 G). It covers
 * the key record (206.4 M), the accept, two new game items, and about 20
 * turns at 38 M (M3 measured 38.1 M per turn).
 */
export const SESSION_BUDGET = 1_500_000_000n;
/** Below this the key cannot be trusted to pay a turn and a new bracket item: top it up. */
export const SESSION_MIN_PGAS = 400_000_000n;
/** PGAS the player needs on top of the budget: owner record (206.4 M) and the setup fee. */
export const SETUP_OVERHEAD = 250_000_000n;
/**
 * PAS (planck, 10 decimals) the setup gives a PAS-funded key: 1 PAS. A full
 * casual game cost the key 0.13–0.21 PAS live (5 and 10 rounds, with the key
 * record, a new game item and new brackets; M5 status), so this covers
 * about five games.
 */
export const PAS_SESSION_BUDGET = 10_000_000_000n;
/** Below this a PAS-funded key gets a top-up: 0.1 PAS, several turns with new brackets. */
export const PAS_SESSION_MIN = 1_000_000_000n;
/**
 * PAS the player keeps on top of the budget: owner record (0.02 PAS),
 * mapping, the setup fee, and the existential deposit (0.01 PAS).
 */
export const PAS_SETUP_OVERHEAD = 1_000_000_000n;
/** A session is renewed when it has less than this left (seconds). */
const EXPIRY_MARGIN_S = 3_600n;
/** Session lifetime asked for, capped by Identity's `maxTtl` (7 days at deploy). */
const SESSION_TTL_S = 7n * 24n * 3_600n;

/**
 * `registerSession` limits: about 3x its dry-run on Paseo Next (2026-10-20:
 * ref_time 0.67 G, proof 58.9 KB, deposit 206.4 M for a new owner record).
 * Unused weight is refunded; only the real deposit is charged.
 */
const REGISTER_GAS = { ref_time: 2_000_000_000n, proof_size: 180_000n };
const REGISTER_DEPOSIT_LIMIT = 300_000_000n;

/** The token a session's key pays fees in: PGAS on pipeline V1, PAS (native) on V0. */
export type SessionToken = 'PGAS' | 'PAS';

export interface Balances {
  playerPgas: bigint;
  /** Free native balance (planck). */
  playerPas: bigint;
  keyPgas: bigint;
  keyPas: bigint;
}

/**
 * Pick the fee token of a session setup, or null when the player can fund
 * neither (then play uses normal signing).
 *
 * PGAS first: when the player can pay the PGAS top-up and the setup overhead.
 * Else PAS: when the player can pay the PAS top-up and the overhead. A player
 * with some PGAS (not enough for the budget) can take the PAS path: a deposit
 * comes from PGAS only when the PGAS covers it, else from PAS, so it never
 * fails for lack of PGAS. The key gets only PAS, so it pays in PAS.
 */
export function chooseFunding(b: Balances): { token: SessionToken; topUp: bigint } | null {
  const pgasTopUp = b.keyPgas < SESSION_MIN_PGAS ? SESSION_BUDGET - b.keyPgas : 0n;
  if (b.playerPgas >= pgasTopUp + SETUP_OVERHEAD) return { token: 'PGAS', topUp: pgasTopUp };
  const pasTopUp = b.keyPas < PAS_SESSION_MIN ? PAS_SESSION_BUDGET - b.keyPas : 0n;
  if (b.playerPas >= pasTopUp + PAS_SETUP_OVERHEAD) return { token: 'PAS', topUp: pasTopUp };
  return null;
}

/** The token a funded key signs with: PGAS when it holds enough, else PAS, else none. */
export function keyToken(b: Pick<Balances, 'keyPgas' | 'keyPas'>): SessionToken | null {
  if (b.keyPgas >= SESSION_MIN_PGAS) return 'PGAS';
  if (b.keyPas >= PAS_SESSION_MIN) return 'PAS';
  return null;
}

/** Sign `tx` on the token's pipeline: V1 for PGAS; V0 (the default) for PAS. */
const onPipeline = (token: SessionToken, tx: SubmittableTransaction): SubmittableTransaction =>
  token === 'PGAS' ? onPipelineV1(tx) : tx;

type Ok<T> = { success: true; value: T };
type Fail = { success: false; value: unknown };
type Prepared = { ok: true; value: PreparedCall } | { ok: false; error: Error };

/** The `@oab/identity` calls the session uses (`createContract` handle). */
export interface IdentityContract {
  sessionOf: {
    query(
      owner: string,
      opts?: { origin?: SS58String }
    ): Promise<Ok<{ session: string; expires_at: bigint; _2: number } | unknown[]> | Fail>;
  };
  keyOf: {
    query(
      key: string,
      opts?: { origin?: SS58String }
    ): Promise<Ok<{ owner: string; expires_at: bigint; _2: boolean } | unknown[]> | Fail>;
  };
  maxTtl: { query(opts?: { origin?: SS58String }): Promise<Ok<bigint> | Fail> };
  registerSession: {
    prepare(
      session: string,
      expiresAt: bigint,
      opts: { gasLimit: { ref_time: bigint; proof_size: bigint }; storageDepositLimit: bigint }
    ): Promise<Prepared>;
  };
  acceptSession: { prepare(owner: string, opts?: { origin?: SS58String }): Promise<Prepared> };
  revokeSession: { prepare(opts?: { origin?: SS58String }): Promise<Prepared> };
}

/** A view's tuple output as an array (the SDK returns an object keyed by output name). */
function tuple(v: unknown): unknown[] {
  return Array.isArray(v) ? v : Object.values(v as Record<string, unknown>);
}

const ZERO = '0x0000000000000000000000000000000000000000';
const sameAddress = (a: unknown, b: string) =>
  typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

/** The on-chain state of the player's session. */
export interface SessionRecord {
  key: string;
  expiresAt: bigint;
  /** 1 offered (not yet accepted), 2 bound. */
  state: number;
}

/**
 * Is the stored key the player's session, with time left? `accepted` says
 * whether the first call must carry `acceptSession`.
 */
export function classifySession(
  record: SessionRecord,
  keyH160: string,
  nowS: bigint
): { usable: boolean; accepted: boolean } {
  const usable =
    sameAddress(record.key, keyH160) &&
    (record.state === 1 || record.state === 2) &&
    record.expiresAt > nowS + EXPIRY_MARGIN_S;
  return { usable, accepted: usable && record.state === 2 };
}

export interface RegistrySession {
  deps: SponsorDeps;
  /** Sign `call` with the session key on its token's pipeline; the first call carries the accept. */
  submit(call: PreparedCall, options?: SubmitOptions): Promise<TxResult>;
  /**
   * Logout. If the stored key is the player's session, the player revokes it
   * (one prompt). Then the key sends its leftover back to the player (silent).
   */
  end(): Promise<void>;
}

export function createRegistrySession(opts: {
  api: AssetHubApi;
  player: SS58String;
  playerSigner: CommonSignerTxCreator;
  identity: IdentityContract;
  /** Product-account derivation index the allowance targets. */
  derivationIndex: number;
  /** Namespace for the stored session key. */
  storePrefix: string;
}): RegistrySession {
  const { api, player, playerSigner, identity } = opts;
  const playerH160 = ss58ToH160(player);
  let keys: SessionKeyManager | null = null;
  let session: ReturnType<typeof loadKey> | null = null;
  // The token the loaded key signs with (set with `session`).
  let token: SessionToken = 'PGAS';
  let accepted = false;

  async function keyManager(): Promise<SessionKeyManager> {
    keys ??= new SessionKeyManager({
      store: await createLocalKvStore({ prefix: opts.storePrefix }),
      name: `registry-session-${player}`,
    });
    return keys;
  }

  /** The key's signers. `SessionKeyManager` derives `//0` from the stored mnemonic. */
  function loadKey(mnemonic: string, ss58: SS58String) {
    const kp = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(mnemonic)))('//0');
    // A V1 creator (VerifyMultiSignature); submitAndWatch types the V0 one.
    const v1 = getVerifyMultiSignatureTxCreator(kp.publicKey, 'Sr25519', kp.sign);
    const signers: Record<SessionToken, CommonSignerTxCreator> = {
      PGAS: v1 as unknown as CommonSignerTxCreator,
      PAS: getTxCreator(kp.publicKey, 'Sr25519', kp.sign),
    };
    return { ss58, h160: ss58ToH160(ss58), signers };
  }

  const pgasOf = async (address: SS58String): Promise<bigint> =>
    (await api.query.Assets.Account.getValue(PGAS_ASSET_ID, address, { at: 'best' }))?.balance ??
    0n;
  const pasOf = async (address: SS58String): Promise<bigint> =>
    (await api.query.System.Account.getValue(address, { at: 'best' })).data.free;

  const nowS = async (): Promise<bigint> =>
    (await api.query.Timestamp.Now.getValue({ at: 'best' })) / 1000n;

  async function record(): Promise<SessionRecord> {
    const r = await identity.sessionOf.query(playerH160, { origin: player });
    if (!r.success) throw new Error('Identity.sessionOf read failed');
    const [key, expiresAt, state] = tuple(r.value);
    return { key: String(key), expiresAt: BigInt(expiresAt as bigint), state: Number(state) };
  }

  /** True when `key` was ever bound to anyone (then it can never be offered again). */
  async function everBound(keyH160: string): Promise<boolean> {
    const r = await identity.keyOf.query(keyH160, { origin: player });
    if (!r.success) throw new Error('Identity.keyOf read failed');
    const [owner] = tuple(r.value);
    return !sameAddress(owner, ZERO);
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
      const key = loadKey(stored.mnemonic, stored.account.ss58Address);
      const c = classifySession(await record(), key.h160, await nowS());
      if (!c.usable) return false;
      const t = keyToken({ keyPgas: await pgasOf(key.ss58), keyPas: await pasOf(key.ss58) });
      if (!t) return false;
      session = key;
      token = t;
      accepted = c.accepted;
      return true;
    },

    async setUp() {
      const km = await keyManager();
      let info = await km.getOrCreate();
      let key = loadKey(info.mnemonic, info.account.ss58Address);
      const now = await nowS();
      let c = classifySession(await record(), key.h160, now);
      // A key that was bound before and is not the live session (expired,
      // revoked, or rotated) is burned for good: make a new one.
      if (!c.usable && (await everBound(key.h160))) {
        info = await km.create();
        key = loadKey(info.mnemonic, info.account.ss58Address);
        c = { usable: false, accepted: false };
      }

      const balances: Balances = {
        playerPgas: await pgasOf(player),
        playerPas: await pasOf(player),
        keyPgas: await pgasOf(key.ss58),
        keyPas: await pasOf(key.ss58),
      };
      const funding = chooseFunding(balances);
      if (!funding) {
        throw new Error(
          `Not enough PGAS or PAS for a session: have ${balances.playerPgas} PGAS, ` +
            `${balances.playerPas} PAS planck`
        );
      }

      const calls: unknown[] = [];
      if (funding.topUp > 0n) {
        calls.push(
          funding.token === 'PGAS'
            ? api.tx.Assets.transfer_keep_alive({
                id: PGAS_ASSET_ID,
                target: Enum('Id', key.ss58),
                amount: funding.topUp,
              }).decodedCall
            : api.tx.Balances.transfer_keep_alive({
                dest: Enum('Id', key.ss58),
                value: funding.topUp,
              }).decodedCall
        );
      }
      // The player's own calls (normal signing, and the game dry-runs) need
      // a mapped account: map it here so play needs no second prompt.
      const mapped = await api.query.Revive.OriginalAccount.getValue(playerH160, {
        at: 'best',
      });
      if (mapped === undefined) calls.push(api.tx.Revive.map_account().decodedCall);
      if (!c.usable) {
        const ttl = await identity.maxTtl.query({ origin: player });
        const maxTtl = ttl.success ? ttl.value : SESSION_TTL_S;
        const expiresAt = now + (maxTtl < SESSION_TTL_S ? maxTtl : SESSION_TTL_S) - 60n;
        // Fixed limits, no dry-run: the player may not be mapped yet (the
        // map_account above runs in the same batch).
        const register = await identity.registerSession.prepare(key.h160, expiresAt, {
          gasLimit: REGISTER_GAS,
          storageDepositLimit: REGISTER_DEPOSIT_LIMIT,
        });
        if (!register.ok) throw register.error;
        calls.push(register.value.decodedCall);
      }
      if (calls.length > 0) {
        const r = await submitAndWatch(
          onPipeline(funding.token, api.tx.Utility.batch_all({ calls: calls as never })),
          playerSigner
        );
        if (!r.ok) throw r.error;
      }
      session = key;
      token = funding.token;
      accepted = c.accepted;
    },
  };

  return {
    deps,
    async submit(call, options) {
      const key = session;
      if (!key) throw new SessionExpiredError('No session key loaded');
      const calls: unknown[] = [];
      if (!accepted) {
        // Dry-run as the key: the accept must come from it. Its account was
        // created (and mapped) by the setup transfer.
        const accept = await identity.acceptSession.prepare(playerH160, { origin: key.ss58 });
        if (!accept.ok) throw new SessionExpiredError(accept.error.message, accept.error);
        calls.push(accept.value.decodedCall);
      }
      calls.push(call.decodedCall);
      const r = await submitAndWatch(
        onPipeline(token, api.tx.Utility.batch_all({ calls: calls as never })),
        key.signers[token],
        options
      );
      if (!r.ok) {
        // Not valid before inclusion (e.g. `Payment`: the key cannot pay the
        // fee): nothing ran, so the caller can resend with normal signing.
        if (r.error instanceof TxValidityError) {
          throw new SessionExpiredError(r.error.message, r.error);
        }
        // batch_all is atomic: a failed call changed nothing but the fee. If
        // the session is no longer live (expired, revoked), normal signing
        // can play the call; any other failure is the game's and is shown.
        const c = classifySession(await record(), key.h160, await nowS());
        if (!c.usable) throw new SessionExpiredError(r.error.message, r.error);
        throw r.error;
      }
      accepted = true;
      return r.value;
    },

    async end() {
      const stored = await (await keyManager()).get();
      if (!stored) return;
      const key = loadKey(stored.mnemonic, stored.account.ss58Address);
      const keyPgas = await pgasOf(key.ss58);
      const keyPas = await pasOf(key.ss58);
      // The player funded the key in this token, so the player can pay the revoke in it.
      const t = keyToken({ keyPgas, keyPas }) ?? (keyPgas > 0n ? 'PGAS' : 'PAS');
      const r = await record();
      if (sameAddress(r.key, key.h160) && (r.state === 1 || r.state === 2)) {
        const revoke = await identity.revokeSession.prepare({ origin: player });
        if (!revoke.ok) throw revoke.error;
        const res = await submitAndWatch(
          onPipeline(t, api.tx.Utility.batch_all({ calls: [revoke.value.decodedCall] as never })),
          playerSigner
        );
        if (!res.ok) throw res.error;
      }
      session = null;
      accepted = false;
      // Best effort: a key with nothing left has nothing to return.
      const sweep =
        t === 'PGAS'
          ? api.tx.Assets.transfer_all({
              id: PGAS_ASSET_ID,
              dest: Enum('Id', player),
              keep_alive: false,
            })
          : api.tx.Balances.transfer_all({ dest: Enum('Id', player), keep_alive: false });
      const res = await submitAndWatch(onPipeline(t, sweep), key.signers[t]);
      if (!res.ok) console.warn('Session key leftover was not returned:', res.error);
    },
  };
}
