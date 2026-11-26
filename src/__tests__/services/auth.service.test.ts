import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  memberSessionFactory,
  membershipFactory,
  organizationFactory,
} from '@/__tests__/factories';
import { prismaMock, resetPrismaMock } from '@/__tests__/helpers/prisma-mock';
import { ServiceError } from '@/lib/errors';
import { t } from '@/lib/t';

vi.mock('@/services/rate-limit.service', () => ({
  signInKeys: vi.fn(() => ({ account: 'acct', source: 'src' })),
  assertSignInAllowed: vi.fn(),
  recordSignInFailure: vi.fn(),
  clearAccountFailures: vi.fn(),
}));

import {
  assertSignInAllowed,
  clearAccountFailures,
  recordSignInFailure,
} from '@/services/rate-limit.service';
import {
  changeInitialPassword,
  hashPassword,
  hashSessionToken,
  resolveSession,
  revokeMembershipSessions,
  signIn,
  verifyPassword,
} from '@/services/auth.service';

resetPrismaMock();

const NOW = new Date('2026-11-26T10:00:00Z');
const PASSWORD = 'Orbit-Lamp-73';
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockResolvedValue([] as never);
});

const input = {
  nationalId: '10380284790',
  mobile: '09120000001',
  password: PASSWORD,
  source: '203.0.113.7',
};

function memberRow(overrides: Parameters<typeof membershipFactory.build>[0] = {}) {
  return {
    ...membershipFactory.build({ id: 'm1', organizationId: 'org-a', passwordHash, ...overrides }),
    organization: { isActive: true },
  };
}

async function expectCode(promise: Promise<unknown>, code: string, message?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ServiceError);
  expect((error as ServiceError).code).toBe(code);
  if (message) expect((error as ServiceError).message).toBe(message);
}

describe('hashPassword / verifyPassword', () => {
  it('produces an Argon2id hash that verifies only the same password', async () => {
    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(passwordHash, PASSWORD)).toBe(true);
    expect(await verifyPassword(passwordHash, 'orbit-lamp-73')).toBe(false);
    expect(await verifyPassword('not-a-hash', PASSWORD)).toBe(false);
  });
});

describe('signIn', () => {
  it('opens a session with 24 h idle and 7 d absolute expiry', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(memberRow() as never);

    const result = await signIn(input, NOW);

    expect(prismaMock.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mobile: '09120000001', organization: { nationalId: '10380284790' } },
      }),
    );
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toEqual(new Date('2026-12-03T10:00:00Z'));
    expect(result.mustChangePassword).toBe(false);
    expect(prismaMock.memberSession.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-a',
        membershipId: 'm1',
        tokenHash: hashSessionToken(result.token),
        idleExpiresAt: new Date('2026-11-27T10:00:00Z'),
        absoluteExpiresAt: new Date('2026-12-03T10:00:00Z'),
        lastSeenAt: NOW,
      },
    });
    expect(clearAccountFailures).toHaveBeenCalled();
    expect(recordSignInFailure).not.toHaveBeenCalled();
  });

  it('gives the same generic failure for a wrong password and an unknown pair', async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(memberRow() as never);
    await expectCode(
      signIn({ ...input, password: 'Wrong-Password-1' }, NOW),
      'INVALID_CREDENTIALS',
      t('auth.errors.invalidCredentials'),
    );

    prismaMock.membership.findFirst.mockResolvedValueOnce(null);
    await expectCode(
      signIn(input, NOW),
      'INVALID_CREDENTIALS',
      t('auth.errors.invalidCredentials'),
    );

    expect(recordSignInFailure).toHaveBeenCalledTimes(2);
    expect(prismaMock.memberSession.create).not.toHaveBeenCalled();
  });

  it('treats a revoked membership and an inactive organization as bad credentials', async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(memberRow({ revokedAt: NOW }) as never);
    await expectCode(signIn(input, NOW), 'INVALID_CREDENTIALS');

    prismaMock.membership.findFirst.mockResolvedValueOnce({
      ...memberRow(),
      organization: { isActive: false },
    } as never);
    await expectCode(signIn(input, NOW), 'INVALID_CREDENTIALS');
    expect(recordSignInFailure).toHaveBeenCalledTimes(2);
  });

  it('stops before any lookup while throttled', async () => {
    vi.mocked(assertSignInAllowed).mockRejectedValueOnce(
      new ServiceError(t('auth.errors.tooManyAttempts', { minutes: 15 }), 'TOO_MANY_ATTEMPTS'),
    );
    await expectCode(signIn(input, NOW), 'TOO_MANY_ATTEMPTS');
    expect(prismaMock.membership.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an expired initial password once the password itself matched', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(
      memberRow({
        mustChangePassword: true,
        initialPasswordExpiresAt: new Date('2026-11-26T09:59:59Z'),
      }) as never,
    );
    await expectCode(
      signIn(input, NOW),
      'INITIAL_PASSWORD_EXPIRED',
      t('auth.errors.initialPasswordExpired'),
    );
    expect(prismaMock.memberSession.create).not.toHaveBeenCalled();
  });

  it('opens a restricted session for a valid initial password', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(
      memberRow({
        mustChangePassword: true,
        initialPasswordExpiresAt: new Date('2026-11-30T00:00:00Z'),
      }) as never,
    );
    expect((await signIn(input, NOW)).mustChangePassword).toBe(true);
  });
});

describe('resolveSession', () => {
  function sessionRow(
    overrides: Parameters<typeof memberSessionFactory.build>[0] = {},
    membership: Partial<{
      revokedAt: Date | null;
      mustChangePassword: boolean;
      active: boolean;
    }> = {},
  ) {
    return {
      ...memberSessionFactory.build({
        id: 's1',
        organizationId: 'org-a',
        membershipId: 'm1',
        lastSeenAt: new Date('2026-11-26T09:58:00Z'),
        ...overrides,
      }),
      membership: {
        mobile: '09120000001',
        mustChangePassword: membership.mustChangePassword ?? false,
        revokedAt: membership.revokedAt ?? null,
        organization: {
          name: organizationFactory.build({ name: 'سازمان الف' }).name,
          isActive: membership.active ?? true,
        },
      },
    };
  }

  it('returns the member scoped to its organization', async () => {
    prismaMock.memberSession.findUnique.mockResolvedValue(sessionRow() as never);
    expect(await resolveSession('tok', NOW)).toEqual({
      sessionId: 's1',
      membershipId: 'm1',
      organizationId: 'org-a',
      organizationName: 'سازمان الف',
      mobile: '09120000001',
      mustChangePassword: false,
    });
    expect(prismaMock.memberSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashSessionToken('tok') } }),
    );
    expect(prismaMock.memberSession.update).not.toHaveBeenCalled();
  });

  it.each([
    ['idle-expired', sessionRow({ idleExpiresAt: new Date('2026-11-26T10:00:00Z') })],
    ['absolutely expired', sessionRow({ absoluteExpiresAt: new Date('2026-11-26T09:00:00Z') })],
    ['revoked membership', sessionRow({}, { revokedAt: new Date('2026-11-26T09:00:00Z') })],
    ['inactive organization', sessionRow({}, { active: false })],
  ])('returns null for a %s session', async (_label, row) => {
    prismaMock.memberSession.findUnique.mockResolvedValue(row as never);
    expect(await resolveSession('tok', NOW)).toBeNull();
  });

  it('slides the idle expiry, never past the absolute one', async () => {
    prismaMock.memberSession.findUnique.mockResolvedValue(
      sessionRow({
        lastSeenAt: new Date('2026-11-26T09:00:00Z'),
        absoluteExpiresAt: new Date('2026-11-26T20:00:00Z'),
      }) as never,
    );
    await resolveSession('tok', NOW);
    expect(prismaMock.memberSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { lastSeenAt: NOW, idleExpiresAt: new Date('2026-11-26T20:00:00Z') },
    });
  });
});

describe('changeInitialPassword', () => {
  const member = { membershipId: 'm1', organizationId: 'org-a', sessionId: 's1' };

  function withOrg(overrides: Parameters<typeof membershipFactory.build>[0]) {
    return { ...memberRow(overrides), organization: { nationalId: '10380284790' } };
  }

  it('scopes the lookup to the session organization', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(null);
    await expectCode(changeInitialPassword(member, 'New-Password-99', NOW), 'INVALID_CREDENTIALS');
    expect(prismaMock.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', organizationId: 'org-a' } }),
    );
  });

  it('refuses when no change is pending or the initial password has expired', async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(withOrg({}) as never);
    await expectCode(
      changeInitialPassword(member, 'New-Password-99', NOW),
      'PASSWORD_CHANGE_NOT_REQUIRED',
    );

    prismaMock.membership.findFirst.mockResolvedValueOnce(
      withOrg({ mustChangePassword: true, initialPasswordExpiresAt: NOW }) as never,
    );
    await expectCode(
      changeInitialPassword(member, 'New-Password-99', NOW),
      'INITIAL_PASSWORD_EXPIRED',
    );
  });

  it('rejects a password equal to the mobile, or the initial password itself', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(
      withOrg({ mustChangePassword: true, initialPasswordExpiresAt: null }) as never,
    );
    await expectCode(
      changeInitialPassword(member, '09120000001', NOW),
      'PASSWORD_REJECTED',
      t('password.errors.matchesIdentifier'),
    );
    await expectCode(
      changeInitialPassword(member, PASSWORD, NOW),
      'PASSWORD_REJECTED',
      t('password.errors.reusedInitial'),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('stores the new hash, clears the flag and revokes the other sessions together', async () => {
    prismaMock.membership.findFirst.mockResolvedValue(
      withOrg({
        mustChangePassword: true,
        initialPasswordExpiresAt: new Date('2026-12-01'),
      }) as never,
    );
    await changeInitialPassword(member, 'New-Password-99', NOW);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const update = prismaMock.membership.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'm1' });
    expect(update.data).toMatchObject({
      mustChangePassword: false,
      initialPasswordExpiresAt: null,
      passwordChangedAt: NOW,
    });
    expect(await verifyPassword(update.data.passwordHash as string, 'New-Password-99')).toBe(true);
    expect(prismaMock.memberSession.deleteMany).toHaveBeenCalledWith({
      where: { membershipId: 'm1', id: { not: 's1' } },
    });
  });
});

describe('revokeMembershipSessions', () => {
  it('deletes every session of the member', async () => {
    prismaMock.memberSession.deleteMany.mockResolvedValue({ count: 3 });
    expect(await revokeMembershipSessions('m1')).toBe(3);
    expect(prismaMock.memberSession.deleteMany).toHaveBeenCalledWith({
      where: { membershipId: 'm1' },
    });
  });
});
