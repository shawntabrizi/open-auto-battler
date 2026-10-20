/**
 * Sponsored-play policy: when to set up a session key, and how a game call
 * falls back to normal signing. Chain-free and unit-tested. The session
 * itself is a registry session (`./registrySession.ts`).
 */

/** PGAS on Paseo Next Asset Hub: trust-backed asset id, sufficient, burnable. */
export const PGAS_ASSET_ID = 2_000_000_000;

// ── Policy (chain-free, unit-tested) ────────────────────────────────────────

/**
 * - `off`: not tried yet on this connection.
 * - `active`: game calls go through the session key, no prompts.
 * - `expired`: the session stopped working; the next action sets it up again.
 * - `declined`: the player said no, the setup failed, or the player ended
 *   the session; normal signing for this connection.
 * - `unavailable`: no host sponsorship here (standalone); normal signing.
 */
export type SponsorStatus = 'off' | 'active' | 'expired' | 'declined' | 'unavailable';

export type AllowanceOutcome = 'Allocated' | 'Rejected' | 'NotAvailable';

/** The session can no longer sign for the player (no funds, key revoked). */
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
  /** True when a stored session key is live and funded for the player. */
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
        // A "no" stops here. A host without sponsorship (`NotAvailable`) does
        // not: the setup may still fund a session from the player's own
        // balance (a registry session falls back to PAS), or refuse.
        const outcome = await deps.requestAllowance();
        if (outcome === 'Rejected') return 'declined';
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

/** A Revive call prepared by `@parity/product-sdk-contracts` `.prepare()`. */
export interface PreparedCall {
  decodedCall: unknown;
}
