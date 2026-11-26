import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { checkPasswordPolicy } from '@/lib/validations/password';
import {
  isValidOrganizationNationalId,
  normalizeOrganizationNationalId,
} from '@/lib/validators/organization';
import { normalizeMobile } from '@/lib/validators/iran';
import { hashPassword } from '@/services/auth.service';
import { seedTaxonomy } from '@/services/taxonomy.service';

/**
 * Operator commands (tech spec §4.1–4.3, decision 008): provision, revoke and
 * reset organization members. Called only from `scripts/operator.ts` with the
 * operator database URL, never from the web app. Messages are English (plan
 * assumption A1). Every command writes an `OperatorAudit` row that holds
 * identifiers and flags only: no password, hash or token.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** No 0/O, 1/l/I: the password is read aloud or copied by hand. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_LENGTH = 16;

export class OperatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorError';
  }
}

export function generateInitialPassword(): string {
  for (;;) {
    let password = '';
    for (let i = 0; i < PASSWORD_LENGTH; i++) {
      password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    }
    // Mixed classes make it obviously "Latin only" when read; the policy check is a safeguard.
    if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) {
      if (checkPasswordPolicy(password) === null) return password;
    }
  }
}

function requireNationalId(input: string): string {
  if (!isValidOrganizationNationalId(input)) {
    throw new OperatorError(`Not a valid 11-digit organization national ID: ${input}`);
  }
  return normalizeOrganizationNationalId(input) as string;
}

function requireMobile(input: string): string {
  const mobile = normalizeMobile(input);
  if (!mobile) throw new OperatorError(`Not a valid Iranian mobile number: ${input}`);
  return mobile;
}

function audit(
  tx: Prisma.TransactionClient,
  operator: string,
  action: string,
  target: { organizationId?: string; membershipId?: string },
  detail?: Prisma.InputJsonValue,
) {
  return tx.operatorAudit.create({ data: { operator, action, ...target, detail } });
}

async function issueInitialPassword(now: Date) {
  const password = generateInitialPassword();
  return {
    password,
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      initialPasswordExpiresAt: new Date(now.getTime() + env.INITIAL_PASSWORD_EXPIRY_DAYS * DAY_MS),
      passwordChangedAt: null,
    },
  };
}

export type ProvisionResult = {
  organizationId: string;
  membershipId: string;
  organizationCreated: boolean;
  membershipCreated: boolean;
  /** Plaintext initial password, present only when one was issued by this call. */
  initialPassword?: string;
  initialPasswordExpiresAt?: Date;
};

/**
 * Idempotent: an existing active pair is left untouched and no password is
 * printed (use `reset` for a new one). A revoked membership is reactivated with
 * a fresh initial password.
 */
export async function provisionMember(input: {
  operator: string;
  nationalId: string;
  organizationName: string;
  mobile: string;
  now?: Date;
}): Promise<ProvisionResult> {
  const now = input.now ?? new Date();
  const nationalId = requireNationalId(input.nationalId);
  const mobile = requireMobile(input.mobile);
  const name = input.organizationName.trim();
  if (!name) throw new OperatorError('Organization name is required');
  const issued = await issueInitialPassword(now);

  return prisma.$transaction(async (tx) => {
    let organization = await tx.organization.findUnique({ where: { nationalId } });
    const organizationCreated = !organization;
    if (!organization) {
      organization = await tx.organization.create({
        data: { nationalId, name, retentionDays: env.RETENTION_DAYS },
      });
      await seedTaxonomy(tx, organization.id);
      await audit(tx, input.operator, 'organization.provision', {
        organizationId: organization.id,
      });
    }

    const existing = await tx.membership.findUnique({
      where: { organizationId_mobile: { organizationId: organization.id, mobile } },
    });
    if (existing && !existing.revokedAt) {
      await audit(
        tx,
        input.operator,
        'membership.provision',
        {
          organizationId: organization.id,
          membershipId: existing.id,
        },
        { outcome: 'unchanged' },
      );
      return {
        organizationId: organization.id,
        membershipId: existing.id,
        organizationCreated,
        membershipCreated: false,
      };
    }

    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: { ...issued.data, revokedAt: null, activatedAt: now },
        })
      : await tx.membership.create({
          data: { organizationId: organization.id, mobile, activatedAt: now, ...issued.data },
        });
    await audit(
      tx,
      input.operator,
      'membership.provision',
      {
        organizationId: organization.id,
        membershipId: membership.id,
      },
      { outcome: existing ? 'reactivated' : 'created', initialPasswordIssued: true },
    );

    return {
      organizationId: organization.id,
      membershipId: membership.id,
      organizationCreated,
      membershipCreated: !existing,
      initialPassword: issued.password,
      initialPasswordExpiresAt: issued.data.initialPasswordExpiresAt,
    };
  });
}

async function findMembership(nationalId: string, mobile: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      mobile: requireMobile(mobile),
      organization: { nationalId: requireNationalId(nationalId) },
    },
  });
  if (!membership) throw new OperatorError('No membership for that national ID and mobile');
  return membership;
}

/** New one-time password; the old password and every session stop working at once. */
export async function resetMember(input: {
  operator: string;
  nationalId: string;
  mobile: string;
  now?: Date;
}): Promise<{
  membershipId: string;
  initialPassword: string;
  initialPasswordExpiresAt: Date;
  sessionsRevoked: number;
}> {
  const now = input.now ?? new Date();
  const membership = await findMembership(input.nationalId, input.mobile);
  if (membership.revokedAt) {
    throw new OperatorError('Membership is revoked; run provision to reactivate it');
  }
  const issued = await issueInitialPassword(now);
  const sessionsRevoked = await prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membership.id }, data: issued.data });
    const { count } = await tx.memberSession.deleteMany({ where: { membershipId: membership.id } });
    await audit(
      tx,
      input.operator,
      'membership.reset',
      {
        organizationId: membership.organizationId,
        membershipId: membership.id,
      },
      { sessionsRevoked: count },
    );
    return count;
  });
  return {
    membershipId: membership.id,
    initialPassword: issued.password,
    initialPasswordExpiresAt: issued.data.initialPasswordExpiresAt,
    sessionsRevoked,
  };
}

/** Revoke one member: sign-in stops and every existing session is rejected on its next request. */
export async function revokeMember(input: {
  operator: string;
  nationalId: string;
  mobile: string;
  now?: Date;
}): Promise<{ membershipId: string; sessionsRevoked: number }> {
  const now = input.now ?? new Date();
  const membership = await findMembership(input.nationalId, input.mobile);
  const sessionsRevoked = await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: membership.id },
      data: { revokedAt: membership.revokedAt ?? now },
    });
    const { count } = await tx.memberSession.deleteMany({ where: { membershipId: membership.id } });
    await audit(
      tx,
      input.operator,
      'membership.revoke',
      {
        organizationId: membership.organizationId,
        membershipId: membership.id,
      },
      { sessionsRevoked: count },
    );
    return count;
  });
  return { membershipId: membership.id, sessionsRevoked };
}

/** Revoke a whole organization (offboarding, tech spec §4): every session and sign-in stops. */
export async function revokeOrganization(input: {
  operator: string;
  nationalId: string;
}): Promise<{ organizationId: string; sessionsRevoked: number }> {
  const nationalId = requireNationalId(input.nationalId);
  const organization = await prisma.organization.findUnique({ where: { nationalId } });
  if (!organization) throw new OperatorError('No organization with that national ID');
  const sessionsRevoked = await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: organization.id }, data: { isActive: false } });
    const { count } = await tx.memberSession.deleteMany({
      where: { organizationId: organization.id },
    });
    await audit(
      tx,
      input.operator,
      'organization.revoke',
      { organizationId: organization.id },
      {
        sessionsRevoked: count,
      },
    );
    return count;
  });
  return { organizationId: organization.id, sessionsRevoked };
}
