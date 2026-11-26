import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/**
 * E2E members are provisioned through the real operator CLI, exactly as an
 * operator would, and the one-time password is read from its output. Each run
 * uses fresh random mobiles inside fixed synthetic organizations.
 */

const WEIGHTS = [29, 27, 23, 19, 17];

/** A random, valid 11-digit organization national ID (legal-entity check digit). */
export function randomNationalId(): string {
  for (;;) {
    const body = Array.from({ length: 10 }, (_, i) => (i === 0 ? 1 + randomInt(9) : randomInt(10)));
    if (body.slice(3, 9).every((d) => d === 0)) continue;
    const d = body[9] + 2;
    const sum = body.reduce((acc, digit, i) => acc + (digit + d) * WEIGHTS[i % 5], 0);
    const check = sum % 11 === 10 ? 0 : sum % 11;
    return [...body, check].join('');
  }
}

export type Org = { nationalId: string; name: string };

/** A fresh synthetic organization per run, so fixture uploads never collide with earlier runs. */
export function randomOrg(name = 'سازمان آزمون خودکار'): Org {
  return { nationalId: randomNationalId(), name };
}

/** Shared by the specs of one run (the module is loaded once per worker). */
export const E2E_ORG: Org = {
  nationalId: process.env.E2E_ORG_ID ?? randomNationalId(),
  name: 'سازمان آزمون خودکار',
};
/** Password members choose after the forced change. */
export const MEMBER_PASSWORD = 'E2e-Orbit-Lamp-73';

export type Credentials = { nationalId: string; mobile: string; password: string };

export function randomMobile(): string {
  return `0912${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
}

function operator(args: string[]): string {
  return execFileSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', '--conditions=react-server', 'scripts/operator.ts', ...args],
    { encoding: 'utf8', env: { ...process.env, OPERATOR_NAME: 'e2e' } },
  );
}

function initialPasswordFrom(output: string): string {
  const match = /Initial password \(shown once\): (\S+)/.exec(output);
  if (!match) throw new Error(`Operator output had no initial password:\n${output}`);
  return match[1];
}

/** A new member holding an operator-issued initial password. */
export function provisionMember(org: Org = E2E_ORG, mobile = randomMobile()): Credentials {
  const output = operator([
    'provision',
    '--national-id',
    org.nationalId,
    '--name',
    org.name,
    '--mobile',
    mobile,
  ]);
  return { nationalId: org.nationalId, mobile, password: initialPasswordFrom(output) };
}

export function resetMember(credentials: Pick<Credentials, 'nationalId' | 'mobile'>): Credentials {
  const output = operator([
    'reset',
    '--national-id',
    credentials.nationalId,
    '--mobile',
    credentials.mobile,
  ]);
  return { ...credentials, password: initialPasswordFrom(output) };
}

let prisma: PrismaClient | undefined;
function db(): PrismaClient {
  prisma ??= new PrismaClient();
  return prisma;
}

/** Test-only time travel: make a member's initial password already expired. */
export async function expireInitialPassword(
  credentials: Pick<Credentials, 'nationalId' | 'mobile'>,
) {
  await db().membership.updateMany({
    where: { mobile: credentials.mobile, organization: { nationalId: credentials.nationalId } },
    data: { initialPasswordExpiresAt: new Date(Date.now() - 60_000) },
  });
}

/** Sign-in throttling is covered by integration tests; e2e runs start from a clean slate. */
export async function clearRateLimits() {
  await db().authRateLimit.deleteMany({});
}

export async function disconnect() {
  await prisma?.$disconnect();
}
