/**
 * Player-facing text for the typed reverts of `@oab/arena` (casual) and
 * `@oab/identity`. `@parity/product-sdk-contracts` decodes a revert against
 * the ABI: `.tx()` and `.prepare()` fail with a `ContractRevertedError` whose
 * `decoded` names the error, and `.query()` returns `{ success: false, value:
 * { decoded } }`. Error names come from `arena/README.md` and
 * `identity/README.md`.
 */

/** A typed contract revert: the ABI error name and its arguments. */
export interface DecodedRevert {
  errorName: string;
  args?: readonly unknown[];
}

/** `oab_battle::GameError` variants, in SCALE index order (`battle/src/error.rs`). */
const GAME_ERRORS = [
  'not enough mana',
  'the board is full',
  'invalid board slot',
  'board slot already taken',
  'board slot is empty',
  'empty slot',
  'wrong phase',
  'unknown card',
  'battle limit exceeded',
  'invalid hand card',
  'card already used this turn',
  'invalid board burn',
  'invalid board move',
  'board mismatch',
  'wrong board size',
  'mana limit exceeded',
];

const MESSAGES: Record<string, string> = {
  GameActive: 'You already have a game on chain. Resume it, or abandon it first.',
  NoGame: 'You have no active game on chain.',
  WrongPhase: 'The game on chain is not at this step. The game state is reloaded.',
  SetNotAllowed: 'This card set is not open for play.',
  SetUnavailable: 'This card set is not available on chain.',
  Draining: 'This arena takes no new games. Update the app to play.',
  NotConfigured: 'The arena is not set up yet. Try again later.',
  InvalidSession: 'Your session key is expired or revoked.',
  IdentityUnavailable: 'The identity contract did not answer. Try again later.',
  ContentUnavailable: 'The content contract did not answer. Try again later.',
  BadContent: 'The card set on chain failed its hash check.',
  BadInput: 'The turn data is malformed.',
  ItemTooLarge: 'The game state is too large to store.',
  // @oab/identity (session setup)
  SessionKeyInUse: 'This session key is in use by another player.',
  SessionKeyBurned: 'This session key was revoked and cannot be used again.',
  SessionKeyCannotOwn: 'A session key cannot own a session.',
  OwnerCannotBeSessionKey: 'A player account cannot be a session key.',
  InvalidSessionKey: 'The session key is not valid.',
  InvalidExpiry: 'The session expiry is not valid.',
  TtlTooLong: 'The session lasts longer than the identity contract allows.',
  NoOffer: 'No session offer for this key.',
  OfferExpired: 'The session offer expired.',
  NoActiveSession: 'There is no session to revoke.',
};

function hexBytes(v: unknown): number[] {
  if (typeof v !== 'string' || !/^0x([0-9a-f]{2})*$/i.test(v)) return [];
  const out: number[] = [];
  for (let i = 2; i < v.length; i += 2) out.push(parseInt(v.slice(i, i + 2), 16));
  return out;
}

/** Text for one decoded revert. Unknown names keep the raw name. */
export function revertMessage(revert: DecodedRevert): string {
  if (revert.errorName === 'InvalidTurn') {
    const index = hexBytes(revert.args?.[0])[0];
    const reason = index === undefined ? undefined : GAME_ERRORS[index];
    return `The arena refused the turn${reason ? `: ${reason}` : ''}. The game state is reloaded.`;
  }
  return MESSAGES[revert.errorName] ?? `The contract refused the call (${revert.errorName}).`;
}

/** The decoded revert inside a query failure value, or null. */
export function queryRevert(value: unknown): DecodedRevert | null {
  const decoded = (value as { decoded?: unknown } | null)?.decoded;
  if (decoded && typeof (decoded as DecodedRevert).errorName === 'string') {
    return decoded as DecodedRevert;
  }
  return null;
}

/** The first decoded revert on an error's cause chain, or null. */
export function findRevert(err: unknown): DecodedRevert | null {
  let e: unknown = err;
  for (let depth = 0; e instanceof Error && depth < 6; depth++) {
    if (e instanceof ArenaRevertError) return e.revert;
    const found = queryRevert(e);
    if (found) return found;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/** A contract call that reverted with a typed error. `message` is player-facing. */
export class ArenaRevertError extends Error {
  readonly revert: DecodedRevert;
  constructor(revert: DecodedRevert, options?: { cause?: unknown }) {
    super(revertMessage(revert));
    this.name = 'ArenaRevertError';
    this.revert = revert;
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** Player-facing text for any failed contract action, or null to use the raw message. */
export function chainErrorMessage(err: unknown): string | null {
  const revert = findRevert(err);
  return revert ? revertMessage(revert) : null;
}
