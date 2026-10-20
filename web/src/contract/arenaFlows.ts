/**
 * Chain-free steps of the arena calls, split out of `./index.ts` so their
 * rules are unit-tested: gas headroom on game starts, the ranked eligibility
 * gate, and the badge claim.
 */

import type { TxResult, TxStatus } from '@parity/product-sdk-tx';
import type { Result } from '@parity/product-sdk-host';
import type { PreparedCall } from './session';
import type { BadgeEvent, BadgeRecord } from './codec';
import { eligibilityMessage, type RankedEligibility } from './personhood';

export type Weight = { ref_time: bigint; proof_size: bigint };

/** Structural shape of a `@parity/product-sdk-contracts` `query()` result. */
export type QueryResult<T> =
  | { success: true; value: T; gasRequired: Weight }
  | { success: false; value: unknown; gasRequired?: Weight };

export type TxOutcome = Result<TxResult, Error>;
export type Prepared = Result<PreparedCall, Error>;
export type TxOptions = { gasLimit?: Weight; onStatus?: (status: TxStatus) => void };
export type PrepareOptions = { gasLimit?: Weight };

/** Send one game call (session key or product account). See `./index.ts`. */
export type SendGameCall = (
  label: string,
  prepare: () => Promise<Prepared>,
  direct: () => Promise<TxOutcome>
) => Promise<TxResult>;

/**
 * Double a dry-run weight. A game start seeds from the inclusion block's
 * entropy, so the real run can cost more than the dry-run (`Revive.OutOfGas`).
 * Unused weight is refunded.
 */
export function withGasHeadroom(w: Weight): Weight {
  return { ref_time: w.ref_time * 2n, proof_size: w.proof_size * 2n };
}

export interface StartMethod {
  query(setId: number): Promise<QueryResult<bigint>>;
  tx(setId: number, opts?: TxOptions): Promise<TxOutcome>;
  prepare(setId: number, opts?: PrepareOptions): Promise<Prepared>;
}

/**
 * Dry-run a game start, then send it with gas headroom. A dry-run that fails
 * or returns seed 0 sends nothing and throws `rejected()`.
 */
export async function startWithHeadroom(opts: {
  label: string;
  method: StartMethod;
  setId: number;
  send: SendGameCall;
  onStatus?: (status: TxStatus) => void;
  rejected: () => Error;
}): Promise<bigint> {
  const { label, method, setId, send, onStatus } = opts;
  const dryRun = await method.query(setId);
  if (!dryRun.success || dryRun.value === 0n) throw opts.rejected();
  const gasLimit = withGasHeadroom(dryRun.gasRequired);
  await send(
    label,
    () => method.prepare(setId, { gasLimit }),
    () => method.tx(setId, { gasLimit, onStatus })
  );
  return dryRun.value;
}

/** The player cannot start a ranked game; `message` says why. */
export class RankedIneligibleError extends Error {
  readonly eligibility: RankedEligibility | null;
  constructor(eligibility: RankedEligibility | null, message?: string) {
    super(message ?? (eligibility ? eligibilityMessage(eligibility) : 'Ranked play refused'));
    this.name = 'RankedIneligibleError';
    this.eligibility = eligibility;
  }
}

/**
 * Ranked start: check the alias binding first (a read, no prompt), and only
 * then set up signing and send. A player without a binding gets the reason
 * and no signing or sponsorship prompt.
 */
export async function startRanked(deps: {
  eligibility: () => Promise<RankedEligibility>;
  prepareWrite: () => Promise<void>;
  start: () => Promise<bigint>;
}): Promise<bigint> {
  const e = await deps.eligibility();
  if (e.kind !== 'bound') throw new RankedIneligibleError(e);
  await deps.prepareWrite();
  return deps.start();
}

/** Player-facing text when a bound account's ranked start is still refused. */
export const RANKED_REFUSED_MESSAGE =
  'The arena refused the ranked start. Your personhood proof may be out of date (the ring changed), or a game is still active. Refresh your personhood in the personhood app and try again.';

export interface ClaimMethod {
  query(): Promise<QueryResult<number>>;
  tx(opts?: TxOptions): Promise<TxOutcome>;
  prepare(opts?: PrepareOptions): Promise<Prepared>;
}

/**
 * Retry the player's pending badge mints. The dry-run says how many would
 * mint now; at 0 (arena still out of funds, or nothing pending) no
 * transaction is sent, so the player pays no fee for a no-op.
 */
export async function claimBadges(opts: {
  method: ClaimMethod;
  send: SendGameCall;
  onStatus?: (status: TxStatus) => void;
  parseEvents: (events: unknown[]) => BadgeEvent[];
}): Promise<BadgeEvent[]> {
  const { method, send, onStatus } = opts;
  const dryRun = await method.query();
  if (!dryRun.success) throw new Error('Contract rejected claimPendingBadges');
  if (dryRun.value === 0) return [];
  const tx = await send(
    'claimPendingBadges',
    () => method.prepare(),
    () => method.tx({ onStatus })
  );
  return opts.parseEvents(tx.events);
}

/** Badges in `after` that `before` did not have, as events (fallback path). */
export function newBadges(before: BadgeRecord[], after: BadgeRecord[]): BadgeEvent[] {
  const key = (b: BadgeRecord) => `${b.badge}/${b.setId}`;
  const had = new Set(before.map(key));
  return after
    .filter((b) => !had.has(key(b)))
    .map((b) => ({
      kind: b.token === null ? 'pending' : 'minted',
      player: '0x',
      badge: b.badge,
      setId: b.setId,
      token: b.token,
    }));
}
