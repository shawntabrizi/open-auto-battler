/**
 * Personhood for ranked play.
 *
 * The arena admits an account to ranked play when the personhood precompile
 * returns Lite/Full and an alias for it in OAB's context. The precompile only
 * does that for an account bound in pallet `AliasAccounts` (Asset Hub) in the
 * same context. One account holds one binding (`AccountToAlias`).
 *
 * No host binds a product account automatically (not on derivation, login, or
 * `SmartContractAllowance`). Per truapi RFC-0024 "the alias flow", the product
 * binds it: a ring-VRF proof from the host (`createRingVRFProof` with the
 * personhood app's key) plus a `AliasAccounts.set_alias_account` call signed
 * by the product account. `bindPersonhood` below does that. It needs the
 * personhood app (`peopl.paseo`) to allow OAB to use its key; until then the
 * host answers `NotAllowlisted` and the UI says so.
 */

import { blake2b256 } from '@polkadot-labs/hdkd-helpers';
import type { SS58String, TypedApi } from 'polkadot-api';
import type { paseo_asset_hub } from '@parity/product-sdk-descriptors/paseo-asset-hub';
import {
  findRingVrfKeyHandle,
  formatHostError,
  getAccountsProvider,
  type RingVrfKeyHandle,
} from '@parity/product-sdk-host';
import type { CommonSignerTxCreator } from '@polkadot-api/signers-common';
import { submitAndWatch } from '@parity/product-sdk-tx';
import { accountIdBytes } from '@parity/product-sdk-address';
import { litePeopleRing, peopleRing, productContext } from '@parity/product-sdk/individuality';
import { bytesToHex, type Hex } from './codec';
import { payInPgas } from './session';

type AssetHubApi = TypedApi<typeof paseo_asset_hub>;

/** dotNS product id and index of the account the app signs with. */
export const PRODUCT_ID = 'oab-arena.paseo';
export const DERIVATION_INDEX = 0;
/** The personhood app whose ring-VRF key proves membership (RFC-0024). */
export const PERSONHOOD_APP = 'peopl.paseo';
/**
 * Genesis of the Paseo individuality chain, where the people rings live. From
 * `@parity/product-sdk-descriptors/paseo-individuality` (0.14.0).
 */
export const INDIVIDUALITY_GENESIS: Hex =
  '0x4a2b5b737de1da59e209b0000a876ec2fa20035dc34fd292a848da32d255ad48';

const utf8 = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

/**
 * OAB's product-scoped proof context (the host derives the same value for
 * `{ productId, suffix: Index(0) }`). Must equal the arena's
 * `getPersonhoodContext()`.
 */
export const OAB_CONTEXT = bytesToHex(
  productContext(PRODUCT_ID, { tag: 'Index', value: DERIVATION_INDEX })
);

/**
 * Bytes the alias proof signs (pallet `proof_message`): SCALE of
 * `(b"alias-accounts", account, proof_valid_at)`, then blake2-256. The label is
 * a fixed `[u8; 14]`, so it has no length prefix.
 */
export function aliasProofPreimage(account: Uint8Array, proofValidAt: bigint): Uint8Array {
  return concat(utf8('alias-accounts'), account, u64le(proofValidAt));
}

export function aliasProofMessage(account: Uint8Array, proofValidAt: bigint): Uint8Array {
  return blake2b256(aliasProofPreimage(account, proofValidAt));
}

// ── Eligibility ──────────────────────────────────────────────────────────────

/** `AliasAccounts.AccountToAlias` value, reduced to what ranked play needs. */
export interface AliasBinding {
  context: Hex;
  alias: Hex;
}

export type RankedEligibility =
  /** Bound in OAB's context: ranked play should work. */
  | { kind: 'bound'; alias: Hex }
  /** The contract has no personhood context: ranked play is closed. */
  | { kind: 'closed' }
  /** The account has no alias binding: bind it first. */
  | { kind: 'not-bound' }
  /** Bound in another product's context; an account holds one binding only. */
  | { kind: 'bound-elsewhere'; context: Hex }
  /** The check itself failed (network, host). */
  | { kind: 'unknown'; reason: string };

const isZero = (hex: string) => /^0x0*$/i.test(hex);

/** Classify an account's binding against the arena's context. */
export function classifyBinding(
  arenaContext: Hex | null,
  binding: AliasBinding | null
): RankedEligibility {
  if (!arenaContext || isZero(arenaContext)) return { kind: 'closed' };
  if (!binding) return { kind: 'not-bound' };
  if (binding.context.toLowerCase() !== arenaContext.toLowerCase()) {
    return { kind: 'bound-elsewhere', context: binding.context };
  }
  return { kind: 'bound', alias: binding.alias };
}

/** Player-facing text for an eligibility that blocks ranked play. */
export function eligibilityMessage(e: RankedEligibility): string {
  switch (e.kind) {
    case 'bound':
      return 'Your account is bound to your personhood alias in OAB.';
    case 'closed':
      return 'Ranked play is not open yet: the arena has no personhood context.';
    case 'not-bound':
      return 'Ranked play needs proof of personhood (Lite or Full). Your OAB account is not bound to a personhood alias in OAB yet.';
    case 'bound-elsewhere':
      return 'Your OAB account is bound to a personhood alias in another app. An account can hold only one binding, so it cannot be used for ranked play here.';
    case 'unknown':
      return `Could not check personhood: ${e.reason}`;
  }
}

/** Read the account's binding at the best block. */
export async function readAliasBinding(
  api: AssetHubApi,
  account: SS58String
): Promise<AliasBinding | null> {
  const v = await api.query.AliasAccounts.AccountToAlias.getValue(account, { at: 'best' });
  if (!v) return null;
  return { context: v.ca.context as Hex, alias: v.ca.alias as Hex };
}

// ── Bind flow (host only) ────────────────────────────────────────────────────

/** A bind step failed; `message` is for the player. */
export class BindError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'BindError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Player-facing text for a host proof failure. */
export function proofErrorMessage(error: unknown): string {
  // Match on the whole envelope too: formatHostError shows only the outer tag
  // of some shapes (`V1`).
  let json = '';
  try {
    json = JSON.stringify(error);
  } catch {
    // Not serialisable; the formatted text is enough.
  }
  const text = `${formatHostError(error)} ${json}`;
  if (/NotAllowlisted/.test(text)) {
    return `The personhood app (${PERSONHOOD_APP}) does not allow OAB to request a personhood proof yet, so the host cannot bind your account. This needs a change in that app's manifest.`;
  }
  if (/NotMember|KeyNotInRing|KeyNotRegistered/.test(text)) {
    return 'No personhood found for you. Get verified in the personhood app first.';
  }
  if (/Rejected/.test(text)) return 'You declined the personhood proof.';
  return `The host could not create a personhood proof: ${text}`;
}

/** Full personhood first, then Lite: ranked play accepts both. */
const RINGS = [
  { collection: 'people' as const, location: peopleRing(INDIVIDUALITY_GENESIS) },
  { collection: 'people-lite' as const, location: litePeopleRing(INDIVIDUALITY_GENESIS) },
];

/**
 * Bind the product account to the player's personhood alias in OAB's context.
 * One host proof prompt, then one transaction signed by the product account
 * (fee and `AliasFee` in PGAS). Throws `BindError` with a player-facing text.
 */
export async function bindPersonhood(opts: {
  api: AssetHubApi;
  account: SS58String;
  signer: CommonSignerTxCreator;
  /** Make sure the account holds PGAS (the sponsored-play allowance). */
  ensurePgas: () => Promise<void>;
}): Promise<void> {
  const accounts = await getAccountsProvider();
  if (!accounts) throw new BindError('Binding needs a Polkadot host (open OAB in the host app).');

  const keys = await accounts.listRingVrfKeys(PERSONHOOD_APP);
  if (keys.isErr()) throw new BindError(proofErrorMessage(keys.error), keys.error);
  let ring: (typeof RINGS)[number] | null = null;
  let handle: RingVrfKeyHandle | undefined;
  for (const r of RINGS) {
    handle = findRingVrfKeyHandle(keys.value, r.location);
    if (handle) {
      ring = r;
      break;
    }
  }
  if (!ring || !handle) {
    throw new BindError('No personhood key found. Get verified in the personhood app first.');
  }

  await opts.ensurePgas();

  // The pallet accepts a proof for at most ProofValidityWindow (300 s) after
  // `proof_valid_at`, which must not be ahead of chain time.
  const nowMs = await opts.api.query.Timestamp.Now.getValue({ at: 'best' });
  const validAt = nowMs / 1000n;
  const message = aliasProofMessage(accountIdBytes(opts.account), validAt);
  const proof = await accounts.createRingVRFProof(
    handle,
    { productId: PRODUCT_ID, suffix: { tag: 'Index', value: DERIVATION_INDEX } },
    ring.location,
    message
  );
  if (proof.isErr()) throw new BindError(proofErrorMessage(proof.error), proof.error);
  const context = bytesToHex(proof.value.contextualAlias.context);
  if (context.toLowerCase() !== OAB_CONTEXT.toLowerCase()) {
    throw new BindError(`The host returned a proof for another context (${context}).`);
  }

  const collection =
    ring.collection === 'people'
      ? await opts.api.constants.AliasAccounts.PeopleCollectionIdentifier()
      : await opts.api.constants.AliasAccounts.PeopleLiteCollectionIdentifier();
  const tx = opts.api.tx.AliasAccounts.set_alias_account({
    proof: proof.value.proof,
    collection,
    ring_index: proof.value.ringIndex,
    ring_revision: proof.value.ringRevision,
    context: OAB_CONTEXT,
    proof_valid_at: validAt,
  });
  const r = await submitAndWatch(payInPgas(tx), opts.signer);
  if (!r.ok) throw new BindError(`The binding transaction failed: ${r.error.message}`, r.error);
}
