import { describe, expect, it, vi } from 'vitest';
import {
  createSponsor,
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

  it('a host without sponsorship still runs the setup (it may fund the session with PAS)', async () => {
    const deps = fakeDeps({
      requestAllowance: vi.fn(() => Promise.resolve('NotAvailable' as const)),
    });
    expect(await createSponsor(deps).ensure()).toBe('active');
    expect(deps.setUp).toHaveBeenCalledTimes(1);
  });

  it('a host without sponsorship and a setup that cannot fund a session: normal signing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = fakeDeps({
      requestAllowance: vi.fn(() => Promise.resolve('NotAvailable' as const)),
      setUp: vi.fn(() => Promise.reject(new Error('Not enough PGAS or PAS for a session'))),
    });
    const sponsor = createSponsor(deps);
    expect(await sponsor.ensure()).toBe('declined');
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
