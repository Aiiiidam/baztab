import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { env } from '@/lib/env';
import { ServiceError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { t } from '@/lib/t';
import { checkPasswordPolicy, passwordIssueMessage } from '@/lib/validations/password';
import {
  assertSignInAllowed,
  clearAccountFailures,
  recordSignInFailure,
  signInKeys,
} from '@/services/rate-limit.service';
import type { AuthMember } from '@/types/auth';

/**
 * Membership sign-in, sessions and password changes (tech spec §4, decision
 * 008). Framework-free: callers own cookies and redirects.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Sliding idle expiry is written at most this often per session. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Argon2id at the OWASP baseline (19 MiB, t=2, p=1). Measured ≈ 25–30 ms per
 * hash on a laptop core; `scripts/bench-argon2.mjs` re-measures under load.
 */
export const ARGON2_OPTIONS = {
  // Algorithm.Argon2id; the enum is a const enum, which isolatedModules cannot import.
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Verified against when the national ID + mobile pair is unknown, so an
 * unknown account costs the same Argon2id work as a wrong password.
 */
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

/** Only the SHA-256 of the raw token is stored; a leaked DB cannot forge cookies. */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function invalidCredentials(): ServiceError {
  return new ServiceError(t('auth.errors.invalidCredentials'), 'INVALID_CREDENTIALS');
}

// ─── Sign-in ─────────────────────────────────────────────────────────────

export type SignInInput = {
  nationalId: string;
  mobile: string;
  password: string;
  /** Client address for the per-source limit. */
  source: string;
};

export type SignInResult = {
  /** Raw token for the cookie. Never persisted. */
  token: string;
  /** Absolute expiry; the cookie lives this long. */
  expiresAt: Date;
  mustChangePassword: boolean;
};

/**
 * Verify credentials and open a session. Every credential problem (unknown
 * pair, wrong password, revoked membership, inactive organization) produces
 * the same `INVALID_CREDENTIALS` error and counts as a failure. An expired
 * initial password is reported as such only after the password matched.
 */
export async function signIn(input: SignInInput, now = new Date()): Promise<SignInResult> {
  const keys = signInKeys(input.nationalId, input.mobile, input.source);
  await assertSignInAllowed(keys, now);

  const membership = await prisma.membership.findFirst({
    where: { mobile: input.mobile, organization: { nationalId: input.nationalId } },
    include: { organization: { select: { isActive: true } } },
  });
  const valid = await verifyPassword(membership?.passwordHash ?? (await dummyHash), input.password);
  if (!membership || !valid || membership.revokedAt || !membership.organization.isActive) {
    await recordSignInFailure(keys, now);
    throw invalidCredentials();
  }

  if (
    membership.mustChangePassword &&
    membership.initialPasswordExpiresAt &&
    membership.initialPasswordExpiresAt <= now
  ) {
    throw new ServiceError(t('auth.errors.initialPasswordExpired'), 'INITIAL_PASSWORD_EXPIRED');
  }

  await clearAccountFailures(keys);

  const token = randomBytes(32).toString('hex');
  const absoluteExpiresAt = new Date(now.getTime() + env.SESSION_ABSOLUTE_DAYS * DAY_MS);
  const idleExpiresAt = new Date(
    Math.min(now.getTime() + env.SESSION_IDLE_HOURS * HOUR_MS, absoluteExpiresAt.getTime()),
  );

  await prisma.$transaction([
    prisma.memberSession.deleteMany({
      where: { membershipId: membership.id, absoluteExpiresAt: { lt: now } },
    }),
    prisma.memberSession.create({
      data: {
        organizationId: membership.organizationId,
        membershipId: membership.id,
        tokenHash: hashSessionToken(token),
        idleExpiresAt,
        absoluteExpiresAt,
        lastSeenAt: now,
      },
    }),
    prisma.membership.update({ where: { id: membership.id }, data: { lastSignInAt: now } }),
  ]);

  return { token, expiresAt: absoluteExpiresAt, mustChangePassword: membership.mustChangePassword };
}

// ─── Sessions ────────────────────────────────────────────────────────────

/**
 * Resolve a raw cookie token to the signed-in member, or null when the session
 * is missing, idle- or absolutely expired, or its membership or organization is
 * no longer active. Runs on every request, so revocation takes effect at once.
 */
export async function resolveSession(
  rawToken: string,
  now = new Date(),
): Promise<AuthMember | null> {
  const session = await prisma.memberSession.findUnique({
    where: { tokenHash: hashSessionToken(rawToken) },
    include: {
      membership: {
        select: {
          mobile: true,
          mustChangePassword: true,
          revokedAt: true,
          organization: { select: { name: true, isActive: true } },
        },
      },
    },
  });
  if (!session) return null;
  const { membership } = session;
  if (
    session.idleExpiresAt <= now ||
    session.absoluteExpiresAt <= now ||
    membership.revokedAt ||
    !membership.organization.isActive
  ) {
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + env.SESSION_IDLE_HOURS * HOUR_MS,
        session.absoluteExpiresAt.getTime(),
      ),
    );
    await prisma.memberSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, idleExpiresAt },
    });
  }

  return {
    sessionId: session.id,
    membershipId: session.membershipId,
    organizationId: session.organizationId,
    organizationName: membership.organization.name,
    mobile: membership.mobile,
    mustChangePassword: membership.mustChangePassword,
  };
}

export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.memberSession.deleteMany({ where: { tokenHash: hashSessionToken(rawToken) } });
}

/** Sign a member out everywhere (operator reset or revoke). */
export async function revokeMembershipSessions(membershipId: string): Promise<number> {
  const { count } = await prisma.memberSession.deleteMany({ where: { membershipId } });
  return count;
}

/** Maintenance: delete sessions past either expiry. */
export async function purgeExpiredSessions(now = new Date()): Promise<number> {
  const { count } = await prisma.memberSession.deleteMany({
    where: { OR: [{ absoluteExpiresAt: { lt: now } }, { idleExpiresAt: { lt: now } }] },
  });
  return count;
}

// ─── Initial password change ────────────────────────────────────────────

/**
 * Replace the operator-issued initial password (tech spec §4.3). Sets the new
 * hash, clears the change requirement and the initial expiry, and revokes every
 * other session of the member, in one transaction. The initial password cannot
 * be chosen again.
 */
export async function changeInitialPassword(
  member: Pick<AuthMember, 'membershipId' | 'organizationId' | 'sessionId'>,
  newPassword: string,
  now = new Date(),
): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { id: member.membershipId, organizationId: member.organizationId },
    include: { organization: { select: { nationalId: true } } },
  });
  if (!membership || membership.revokedAt) throw invalidCredentials();
  if (!membership.mustChangePassword) {
    throw new ServiceError(
      t('auth.errors.passwordChangeNotRequired'),
      'PASSWORD_CHANGE_NOT_REQUIRED',
    );
  }
  if (membership.initialPasswordExpiresAt && membership.initialPasswordExpiresAt <= now) {
    throw new ServiceError(t('auth.errors.initialPasswordExpired'), 'INITIAL_PASSWORD_EXPIRED');
  }

  const issue = checkPasswordPolicy(newPassword, {
    nationalId: membership.organization.nationalId,
    mobile: membership.mobile,
  });
  if (issue) throw new ServiceError(passwordIssueMessage(issue), 'PASSWORD_REJECTED');
  if (await verifyPassword(membership.passwordHash, newPassword)) {
    throw new ServiceError(t('password.errors.reusedInitial'), 'PASSWORD_REJECTED');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.membership.update({
      where: { id: membership.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        initialPasswordExpiresAt: null,
        passwordChangedAt: now,
      },
    }),
    prisma.memberSession.deleteMany({
      where: { membershipId: membership.id, id: { not: member.sessionId } },
    }),
  ]);
}
