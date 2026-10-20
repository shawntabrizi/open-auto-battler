/**
 * Chain-free steps of the arena calls, split out of `./index.ts` so their
 * rules are unit-tested: the dry-run gate and gas headroom on game starts.
 */

import type { TxResult, TxStatus } from '@parity/product-sdk-tx';
import type { Result } from '@parity/product-sdk-host';
import type { PreparedCall } from './session';
import { ArenaRevertError, queryRevert } from './errors';

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
 * Double a dry-run weight. A game start seeds from the inclusion block, so
 * the real run can cost more than the dry-run (`Revive.OutOfGas`). Unused
 * weight is refunded.
 */
export function withGasHeadroom(w: Weight): Weight {
  return { ref_time: w.ref_time * 2n, proof_size: w.proof_size * 2n };
}

/**
 * A failed dry-run as an error: the typed revert when the contract gave one
 * (`GameActive`, `SetNotAllowed`, ...), else `fallback()`.
 */
export function dryRunError(value: unknown, fallback: () => Error): Error {
  const revert = queryRevert(value);
  return revert ? new ArenaRevertError(revert) : fallback();
}

export interface StartMethod {
  query(setId: number): Promise<QueryResult<bigint>>;
  tx(setId: number, opts?: TxOptions): Promise<TxOutcome>;
  prepare(setId: number, opts?: PrepareOptions): Promise<Prepared>;
}

/**
 * Dry-run a game start, then send it with gas headroom. A failed dry-run
 * sends nothing and throws the typed revert (else `rejected()`). Returns the
 * dry-run's run id (advisory: the real call can get a later one).
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
  if (!dryRun.success) throw dryRunError(dryRun.value, opts.rejected);
  if (dryRun.value === 0n) throw opts.rejected();
  const gasLimit = withGasHeadroom(dryRun.gasRequired);
  await send(
    label,
    () => method.prepare(setId, { gasLimit }),
    () => method.tx(setId, { gasLimit, onStatus })
  );
  return dryRun.value;
}
