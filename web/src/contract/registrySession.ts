/**
 * Sponsored play with a registry session (`@oab/identity`,
 * `docs/CONTRACT_ARCHITECTURE.md` section 7.4).
 *
 * The player approves once, then a local session key signs every game call
 * with no prompt, and pays its fee in PGAS. The arena resolves the key to its
 * owner through `@oab/identity`, so the key plays the player's game.
 *
 * Flow (host only):
 *   1. No PGAS on the product account: request `SmartContractAllowance` (host
 *      prompt; the host claims PGAS with a personhood proof).
 *   2. ONE product-account prompt, on extension pipeline V1 (fee in PGAS):
 *      `Utility.batch_all[ Assets.transfer_keep_alive(PGAS, session SS58,
 *      budget), Revive.call(Identity.registerSession(session, expiresAt)) ]`.
 *      The transfer creates and auto-maps the key's account. (Never send PGAS
 *      to the key's H160 through the ERC-20 precompile: an unmapped H160 is
 *      credited to a fallback account and the funds are lost.)
 *   3. The key's first call, silent, V1: `Utility.batch_all[
 *      Revive.call(acceptSession(owner)), <game call> ]`. Later calls are the
 *      game call alone.
 *
 * Storage deposits on V1 are charged in PGAS to the origin: the owner record
 * (206.4 M) to the player at setup, the key record (206.4 M) and new game
 * items to the session key. The budget covers them (decision Q12).
 *
 * Any failure falls back to normal signing (`createSponsor` in `./session`).
 */

import { Enum, type SS58String, type TypedApi } from 'polkadot-api';
import { getVerifyMultiSignatureTxCreator } from 'polkadot-api/tx-creator';
import type { CommonSignerTxCreator } from '@polkadot-api/signers-common';
import type { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import { requestResourceAllocation } from '@parity/product-sdk-host';
import { SessionKeyManager } from '@parity/product-sdk-keys';
import { createLocalKvStore } from '@parity/product-sdk-local-storage';
import {
  submitAndWatch,
  TxValidityError,
  type SubmitOptions,
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
  /** Sign `call` with the session key on V1 (fee in PGAS); the first call carries the accept. */
  submit(call: PreparedCall, options?: SubmitOptions): Promise<TxResult>;
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
  let accepted = false;

  async function keyManager(): Promise<SessionKeyManager> {
    keys ??= new SessionKeyManager({
      store: await createLocalKvStore({ prefix: opts.storePrefix }),
      name: `registry-session-${player}`,
    });
    return keys;
  }

  /** The key's V1 signer. `SessionKeyManager` derives `//0` from the stored mnemonic. */
  function loadKey(mnemonic: string, ss58: SS58String) {
    const kp = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(mnemonic)))('//0');
    return {
      ss58,
      h160: ss58ToH160(ss58),
      signer: getVerifyMultiSignatureTxCreator(kp.publicKey, 'Sr25519', kp.sign),
    };
  }

  const pgasOf = async (address: SS58String): Promise<bigint> =>
    (await api.query.Assets.Account.getValue(PGAS_ASSET_ID, address, { at: 'best' }))?.balance ??
    0n;

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
      if (!c.usable || (await pgasOf(key.ss58)) < SESSION_MIN_PGAS) return false;
      session = key;
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

      const keyPgas = await pgasOf(key.ss58);
      const topUp = keyPgas < SESSION_MIN_PGAS ? SESSION_BUDGET - keyPgas : 0n;
      const need = topUp + (c.usable ? 0n : SETUP_OVERHEAD);
      const have = await pgasOf(player);
      if (have < need) {
        throw new Error(`Not enough PGAS for a session: need ${need}, have ${have}`);
      }

      const calls: unknown[] = [];
      if (topUp > 0n) {
        calls.push(
          api.tx.Assets.transfer_keep_alive({
            id: PGAS_ASSET_ID,
            target: Enum('Id', key.ss58),
            amount: topUp,
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
          onPipelineV1(api.tx.Utility.batch_all({ calls: calls as never })),
          playerSigner
        );
        if (!r.ok) throw r.error;
      }
      session = key;
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
        onPipelineV1(api.tx.Utility.batch_all({ calls: calls as never })),
        // A V1 creator (VerifyMultiSignature); submitAndWatch types the V0 one.
        key.signer as unknown as CommonSignerTxCreator,
        options
      );
      if (!r.ok) {
        // Not valid before inclusion (e.g. `Payment`: the key cannot pay the
        // fee on V1): nothing ran, so the caller can resend with normal signing.
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
  };
}
