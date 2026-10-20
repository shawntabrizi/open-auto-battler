import { describe, expect, it } from 'vitest';
import {
  aliasProofPreimage,
  classifyBinding,
  eligibilityMessage,
  OAB_CONTEXT,
  proofErrorMessage,
} from './personhood';

// The context the live arena was configured with (contract/README.md,
// setPersonhoodContext at block 2050284).
const ARENA_CONTEXT = '0x51dccb5fc990cce21a58dcecc3334babcea01f0f034567f0d64ca4c423356012';

describe('OAB personhood context', () => {
  it('equals the context the arena checks, so a binding we make is one ranked play accepts', () => {
    expect(OAB_CONTEXT).toBe(ARENA_CONTEXT);
  });
});

describe('alias proof message', () => {
  it('matches the pallet SCALE layout: fixed 14-byte label, 32-byte account, u64 LE', () => {
    // A length prefix on the label or a big-endian time would make the chain
    // reject every proof the host signs for us.
    const account = new Uint8Array(32).fill(7);
    const pre = aliasProofPreimage(account, 0x0102030405060708n);
    expect(pre.length).toBe(14 + 32 + 8);
    expect(new TextDecoder().decode(pre.slice(0, 14))).toBe('alias-accounts');
    expect(pre.slice(14, 46)).toEqual(account);
    expect(Array.from(pre.slice(46))).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });
});

describe('ranked eligibility', () => {
  const alias = `0x${'aa'.repeat(32)}` as const;

  it('admits an account bound in the arena context, with its alias for the leaderboard', () => {
    expect(classifyBinding(ARENA_CONTEXT, { context: ARENA_CONTEXT, alias })).toEqual({
      kind: 'bound',
      alias,
    });
  });

  it('reports no binding: the player must bind before ranked play', () => {
    expect(classifyBinding(ARENA_CONTEXT, null)).toEqual({ kind: 'not-bound' });
  });

  it('reports a binding in another app: one binding per account, so binding here would fail', () => {
    const other = `0x${'12'.repeat(32)}` as const;
    const e = classifyBinding(ARENA_CONTEXT, { context: other, alias });
    expect(e).toEqual({ kind: 'bound-elsewhere', context: other });
    expect(eligibilityMessage(e)).toMatch(/only one binding/);
  });

  it('reports ranked play closed while the arena has no context', () => {
    expect(classifyBinding(`0x${'00'.repeat(32)}`, null)).toEqual({ kind: 'closed' });
    expect(classifyBinding(null, { context: ARENA_CONTEXT, alias })).toEqual({ kind: 'closed' });
  });
});

describe('host proof errors', () => {
  it('names the missing allowlist, the known blocker for OAB today', () => {
    // The CallErrorValue envelope the host returns for a foreign key.
    const err = { tag: 'Domain', value: { tag: 'V1', value: { tag: 'NotAllowlisted' } } };
    expect(proofErrorMessage(err)).toMatch(/does not allow OAB/);
  });
});
