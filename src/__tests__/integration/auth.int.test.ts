import { beforeEach, describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/errors';
import { changeInitialPassword, resolveSession, signIn } from '@/services/auth.service';
import {
  provisionMember,
  resetMember,
  revokeMember,
  revokeOrganization,
} from '@/services/operator.service';
import {
  assertSignInAllowed,
  recordSignInFailure,
  signInKeys,
} from '@/services/rate-limit.service';
import { prisma, resetDatabase } from './db';

const ORG_A = { nationalId: '10380284790', organizationName: 'سازمان الف' };
const ORG_B = { nationalId: '14006278561', organizationName: 'سازمان ب' };
const MOBILE = '09120000000';
const SOURCE = '198.51.100.1';

beforeEach(resetDatabase);

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ServiceError) return error.code;
    throw error;
  }
}

describe('operator provisioning and first sign-in (P1-07, tech spec §4.1–4.4)', () => {
  it('provision is idempotent and audits without secrets', async () => {
    const first = await provisionMember({ operator: 'op', ...ORG_A, mobile: MOBILE });
    const again = await provisionMember({ operator: 'op', ...ORG_A, mobile: '+989120000000' });

    expect(first.initialPassword).toMatch(/^[A-Za-z2-9]{16}$/);
    expect(again.initialPassword).toBeUndefined();
    expect(again.membershipId).toBe(first.membershipId);
    expect(await prisma.membership.count()).toBe(1);

    const audits = await prisma.operatorAudit.findMany();
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['organization.provision', 'membership.provision']),
    );
    const serialized = JSON.stringify(audits);
    const membership = await prisma.membership.findFirstOrThrow();
    expect(serialized).not.toContain(first.initialPassword);
    expect(serialized).not.toContain(membership.passwordHash);
  });

  it('forces a change, rejects reuse, then signs in with the new password only', async () => {
    const { initialPassword } = await provisionMember({ operator: 'op', ...ORG_A, mobile: MOBILE });
    const first = await signIn({
      ...ORG_A,
      mobile: MOBILE,
      password: initialPassword!,
      source: SOURCE,
    });
    expect(first.mustChangePassword).toBe(true);

    const restricted = await resolveSession(first.token);
    expect(restricted?.mustChangePassword).toBe(true);

    expect(await codeOf(changeInitialPassword(restricted!, initialPassword!))).toBe(
      'PASSWORD_REJECTED',
    );
    await changeInitialPassword(restricted!, 'Orbit-Lamp-73');
    expect((await resolveSession(first.token))?.mustChangePassword).toBe(false);

    expect(
      await codeOf(
        signIn({ ...ORG_A, mobile: MOBILE, password: initialPassword!, source: SOURCE }),
      ),
    ).toBe('INVALID_CREDENTIALS');
    const later = await signIn({
      ...ORG_A,
      mobile: MOBILE,
      password: 'Orbit-Lamp-73',
      source: SOURCE,
    });
    expect(later.mustChangePassword).toBe(false);
  });

  it('refuses an expired initial password', async () => {
    const { initialPassword } = await provisionMember({
      operator: 'op',
      ...ORG_A,
      mobile: MOBILE,
      now: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    expect(
      await codeOf(
        signIn({ ...ORG_A, mobile: MOBILE, password: initialPassword!, source: SOURCE }),
      ),
    ).toBe('INITIAL_PASSWORD_EXPIRED');
  });

  it('keeps the same mobile in two organizations separate', async () => {
    const a = await provisionMember({ operator: 'op', ...ORG_A, mobile: MOBILE });
    const b = await provisionMember({ operator: 'op', ...ORG_B, mobile: MOBILE });
    expect(a.organizationId).not.toBe(b.organizationId);

    // Org A's password does not open org B.
    expect(
      await codeOf(
        signIn({ ...ORG_B, mobile: MOBILE, password: a.initialPassword!, source: SOURCE }),
      ),
    ).toBe('INVALID_CREDENTIALS');
    const session = await signIn({
      ...ORG_B,
      mobile: MOBILE,
      password: b.initialPassword!,
      source: SOURCE,
    });
    expect((await resolveSession(session.token))?.organizationId).toBe(b.organizationId);
  });

  it('a non-allowlisted pair cannot sign in', async () => {
    await provisionMember({ operator: 'op', ...ORG_A, mobile: MOBILE });
    expect(
      await codeOf(
        signIn({ ...ORG_A, mobile: '09129999999', password: 'Anything-123', source: SOURCE }),
      ),
    ).toBe('INVALID_CREDENTIALS');
  });
});

describe('reset and revocation (tech spec §4.3, §4.5, offboarding)', () => {
  async function signedIn() {
    const { initialPassword } = await provisionMember({ operator: 'op', ...ORG_A, mobile: MOBILE });
    const session = await signIn({
      ...ORG_A,
      mobile: MOBILE,
      password: initialPassword!,
      source: SOURCE,
    });
    const member = await resolveSession(session.token);
    await changeInitialPassword(member!, 'Orbit-Lamp-73');
    return session.token;
  }

  it('reset invalidates the old password and every session', async () => {
    const token = await signedIn();
    const reset = await resetMember({
      operator: 'op',
      nationalId: ORG_A.nationalId,
      mobile: MOBILE,
    });
    expect(reset.sessionsRevoked).toBe(1);
    expect(await resolveSession(token)).toBeNull();
    expect(
      await codeOf(signIn({ ...ORG_A, mobile: MOBILE, password: 'Orbit-Lamp-73', source: SOURCE })),
    ).toBe('INVALID_CREDENTIALS');
    const again = await signIn({
      ...ORG_A,
      mobile: MOBILE,
      password: reset.initialPassword,
      source: SOURCE,
    });
    expect(again.mustChangePassword).toBe(true);
  });

  it('revoking a member or the organization blocks the existing session at once', async () => {
    const token = await signedIn();
    await revokeMember({ operator: 'op', nationalId: ORG_A.nationalId, mobile: MOBILE });
    expect(await resolveSession(token)).toBeNull();

    const reactivated = await provisionMember({ operator: 'op', ...ORG_A, mobile: MOBILE });
    expect(reactivated.initialPassword).toBeDefined();
    const session = await signIn({
      ...ORG_A,
      mobile: MOBILE,
      password: reactivated.initialPassword!,
      source: SOURCE,
    });
    await revokeOrganization({ operator: 'op', nationalId: ORG_A.nationalId });
    expect(await resolveSession(session.token)).toBeNull();
    expect(
      await codeOf(
        signIn({
          ...ORG_A,
          mobile: MOBILE,
          password: reactivated.initialPassword!,
          source: SOURCE,
        }),
      ),
    ).toBe('INVALID_CREDENTIALS');
  });
});

describe('PostgreSQL sign-in throttle (decision 008)', () => {
  const keys = signInKeys(ORG_A.nationalId, MOBILE, SOURCE);

  it('allows four failures, then delays the account with increasing waits', async () => {
    const start = new Date('2026-11-26T10:00:00Z');
    for (let i = 0; i < 4; i++) await recordSignInFailure(keys, start);
    await expect(assertSignInAllowed(keys, start)).resolves.toBeUndefined();

    await recordSignInFailure(keys, start); // 5th failure → 30 s delay
    expect(await codeOf(assertSignInAllowed(keys, new Date(start.getTime() + 10_000)))).toBe(
      'TOO_MANY_ATTEMPTS',
    );
    await expect(
      assertSignInAllowed(keys, new Date(start.getTime() + 31_000)),
    ).resolves.toBeUndefined();

    const later = new Date(start.getTime() + 31_000);
    await recordSignInFailure(keys, later); // 6th → 60 s
    expect(await codeOf(assertSignInAllowed(keys, new Date(later.getTime() + 45_000)))).toBe(
      'TOO_MANY_ATTEMPTS',
    );
    const row = await prisma.authRateLimit.findUniqueOrThrow({ where: { key: keys.account } });
    expect(row.failures).toBe(6);
    expect(row.key).not.toContain(MOBILE);
  });

  it('restarts the counter once the 15-minute window has passed', async () => {
    const start = new Date('2026-11-26T10:00:00Z');
    for (let i = 0; i < 5; i++) await recordSignInFailure(keys, start);
    const afterWindow = new Date(start.getTime() + 15 * 60_000 + 1);
    await recordSignInFailure(keys, afterWindow);
    const row = await prisma.authRateLimit.findUniqueOrThrow({ where: { key: keys.account } });
    expect(row.failures).toBe(1);
    await expect(assertSignInAllowed(keys, afterWindow)).resolves.toBeUndefined();
  });

  it('blocks a source after 30 failures across different accounts', async () => {
    const now = new Date('2026-11-26T10:00:00Z');
    for (let i = 0; i < 30; i++) {
      await recordSignInFailure(
        signInKeys(ORG_A.nationalId, `0912000${String(i).padStart(4, '0')}`, SOURCE),
        now,
      );
    }
    const fresh = signInKeys(ORG_B.nationalId, '09121111111', SOURCE);
    expect(await codeOf(assertSignInAllowed(fresh, now))).toBe('TOO_MANY_ATTEMPTS');
    const otherSource = signInKeys(ORG_B.nationalId, '09121111111', '198.51.100.2');
    await expect(assertSignInAllowed(otherSource, now)).resolves.toBeUndefined();
  });

  it('counts real wrong-password sign-ins and clears the account on success', async () => {
    const { initialPassword } = await provisionMember({ operator: 'op', ...ORG_A, mobile: MOBILE });
    for (let i = 0; i < 3; i++) {
      await codeOf(
        signIn({ ...ORG_A, mobile: MOBILE, password: 'Wrong-Pass-000', source: SOURCE }),
      );
    }
    expect(
      (await prisma.authRateLimit.findUnique({ where: { key: keys.account } }))?.failures,
    ).toBe(3);
    await signIn({ ...ORG_A, mobile: MOBILE, password: initialPassword!, source: SOURCE });
    expect(await prisma.authRateLimit.findUnique({ where: { key: keys.account } })).toBeNull();
  });
});
