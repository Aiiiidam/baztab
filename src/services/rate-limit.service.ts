import { createHash } from 'node:crypto';
import type { RateLimitScope } from '@prisma/client';
import { env } from '@/lib/env';
import { ServiceError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { t } from '@/lib/t';
import { utc } from '@/services/sql';

/**
 * Sign-in throttling kept in PostgreSQL (decision 008, tech spec §4.4), so it
 * survives restarts and works across replicas.
 *
 * - Account (national ID + mobile): after LOGIN_ACCOUNT_MAX_FAILURES failures
 *   in the window, each further attempt waits an increasing delay
 *   (30 s, 1 min, 2 min … capped at the window). No hard lockout.
 * - Source (client address): LOGIN_SOURCE_MAX_FAILURES failures in the window
 *   block that source until the window ends.
 *
 * Keys are SHA-256 hashes, so the table never holds an identifier or address.
 */

const BASE_DELAY_MS = 30_000;

export type SignInKeys = { account: string; source: string };

function hashKey(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function signInKeys(nationalId: string, mobile: string, source: string): SignInKeys {
  return {
    account: hashKey(`account:${nationalId}:${mobile}`),
    source: hashKey(`source:${source}`),
  };
}

const windowMs = () => env.LOGIN_WINDOW_MINUTES * 60_000;

/** Delay after the account limit is reached: doubles per extra failure, capped at the window. */
export function accountDelayMs(failuresOverLimit: number): number {
  return Math.min(windowMs(), BASE_DELAY_MS * 2 ** Math.max(0, failuresOverLimit));
}

type Counter = {
  key: string;
  scope: RateLimitScope;
  failures: number;
  windowStart: Date;
  lastFailureAt: Date;
};

/** When this counter allows the next attempt, or null when it does not block. */
export function retryAt(counter: Counter, now: Date): Date | null {
  const windowEnd = counter.windowStart.getTime() + windowMs();
  if (windowEnd <= now.getTime()) return null;
  if (counter.scope === 'SOURCE') {
    return counter.failures >= env.LOGIN_SOURCE_MAX_FAILURES ? new Date(windowEnd) : null;
  }
  const over = counter.failures - env.LOGIN_ACCOUNT_MAX_FAILURES;
  if (over < 0) return null;
  const at = counter.lastFailureAt.getTime() + accountDelayMs(over);
  return at > now.getTime() ? new Date(at) : null;
}

/** Throws `ServiceError('TOO_MANY_ATTEMPTS')` while either key is throttled. */
export async function assertSignInAllowed(keys: SignInKeys, now = new Date()): Promise<void> {
  const counters = await prisma.authRateLimit.findMany({
    where: { key: { in: [keys.account, keys.source] } },
  });
  const blockedUntil = counters
    .map((counter) => retryAt(counter, now))
    .filter((at): at is Date => at !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!blockedUntil) return;
  const minutes = Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 60_000));
  throw new ServiceError(t('auth.errors.tooManyAttempts', { minutes }), 'TOO_MANY_ATTEMPTS');
}

/** Count one failure against both keys. A counter whose window has ended restarts at 1. */
export async function recordSignInFailure(keys: SignInKeys, now = new Date()): Promise<void> {
  const window = `${env.LOGIN_WINDOW_MINUTES} minutes`;
  const rows: [string, RateLimitScope][] = [
    [keys.account, 'ACCOUNT'],
    [keys.source, 'SOURCE'],
  ];
  const at = utc(now);
  for (const [key, scope] of rows) {
    await prisma.$executeRaw`
      INSERT INTO auth_rate_limits (key, scope, failures, "windowStart", "lastFailureAt", "expiresAt")
      VALUES (${key}, ${scope}::"RateLimitScope", 1, ${at}, ${at}, ${at} + ${window}::interval)
      ON CONFLICT (key) DO UPDATE SET
        failures = CASE WHEN auth_rate_limits."windowStart" + ${window}::interval <= ${at}
                        THEN 1 ELSE auth_rate_limits.failures + 1 END,
        "windowStart" = CASE WHEN auth_rate_limits."windowStart" + ${window}::interval <= ${at}
                             THEN ${at} ELSE auth_rate_limits."windowStart" END,
        "lastFailureAt" = ${at},
        "expiresAt" = ${at} + ${window}::interval`;
  }
}

/** A successful sign-in clears the account counter (the source counter keeps running). */
export async function clearAccountFailures(keys: SignInKeys): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { key: keys.account } });
}

/** Maintenance: drop counters whose window and delay have passed. */
export async function purgeExpiredRateLimits(now = new Date()): Promise<number> {
  const { count } = await prisma.authRateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}
