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
import { releaseCommitted } from '@/services/call.service';
import { enqueueOrGetActive } from '@/services/queue.service';
import { getStorage } from '@/services/storage.service';
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

// ─── Reprocessing (tech spec §7, plan M5-T6) ─────────────────────────────

/**
 * Queue a new analysis of a ready call. The result becomes active only when
 * the active revision has no human-set fields; otherwise it is stored as a
 * CANDIDATE that `activateCandidate` or `discardCandidate` resolves (audited).
 */
export async function reprocessCall(input: { operator: string; callId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const call = await tx.call.findUnique({
      where: { id: input.callId },
      select: {
        organizationId: true,
        state: true,
        recording: { select: { state: true, expiresAt: true } },
      },
    });
    if (!call) throw new OperatorError('No call with that ID');
    if (call.state !== 'READY') {
      throw new OperatorError(`Only READY calls can be reprocessed (state: ${call.state})`);
    }
    if (call.recording?.state !== 'STORED' || call.recording.expiresAt <= now) {
      throw new OperatorError('The recording is no longer retained; reprocessing is impossible');
    }
    const job = await enqueueOrGetActive(tx, {
      organizationId: call.organizationId,
      callId: input.callId,
      trigger: 'REPROCESS',
      now,
    });
    await audit(
      tx,
      input.operator,
      'call.reprocess',
      { organizationId: call.organizationId },
      { callId: input.callId, jobId: job.jobId, created: job.created },
    );
    return job;
  });
}

async function candidateOf(tx: Prisma.TransactionClient, callId: string, revisionId: string) {
  const revision = await tx.analysisRevision.findFirst({
    where: { id: revisionId, callId, status: 'CANDIDATE' },
    select: { id: true, organizationId: true },
  });
  if (!revision) throw new OperatorError('No candidate revision with that ID for this call');
  return revision;
}

/** Activate a held-back reprocessing result, discarding the human corrections it replaces. */
export async function activateCandidate(input: {
  operator: string;
  callId: string;
  revisionId: string;
}) {
  await prisma.$transaction(async (tx) => {
    const revision = await candidateOf(tx, input.callId, input.revisionId);
    const previous = await tx.call.findUniqueOrThrow({
      where: { id: input.callId },
      select: { activeRevisionId: true },
    });
    await tx.analysisRevision.update({
      where: { id: revision.id },
      data: { status: 'PUBLISHED', parentRevisionId: previous.activeRevisionId },
    });
    await tx.call.update({
      where: { id: input.callId },
      data: { activeRevisionId: revision.id, rowVersion: { increment: 1 } },
    });
    await audit(
      tx,
      input.operator,
      'revision.activate_candidate',
      { organizationId: revision.organizationId },
      {
        callId: input.callId,
        revisionId: revision.id,
        replacedRevisionId: previous.activeRevisionId,
      },
    );
  });
}

/** Keep the corrected revision and discard the held-back reprocessing result. */
export async function discardCandidate(input: {
  operator: string;
  callId: string;
  revisionId: string;
}) {
  await prisma.$transaction(async (tx) => {
    const revision = await candidateOf(tx, input.callId, input.revisionId);
    await tx.analysisRevision.update({ where: { id: revision.id }, data: { status: 'DISCARDED' } });
    await audit(
      tx,
      input.operator,
      'revision.discard_candidate',
      { organizationId: revision.organizationId },
      { callId: input.callId, revisionId: revision.id },
    );
  });
}

// ─── Organization deletion (tech spec §4 offboarding, plan M5-T6) ────────

export type DeleteOrganizationResult = {
  organizationId: string;
  objectsDeleted: number;
  objectsFailed: number;
  finished: boolean;
};

/**
 * Two-phase, resumable deletion.
 *
 * Phase 1 (one transaction): state DELETING and inactive, every membership
 * revoked, every session deleted, queued jobs cancelled. From here no page,
 * API, playback, sign-in or upload succeeds, and a running job cannot publish
 * (claims and the fenced publish check the organization).
 *
 * Phase 2: delete each stored object (a missing object counts as deleted),
 * marking its recording DELETED and releasing its bytes only after the
 * confirmed delete. If any object fails, stop with the organization still
 * DELETING and its rows intact; re-running continues. Then delete every
 * organization row and leave a DELETED tombstone (ID and national ID only)
 * for the audit trail.
 */
export async function deleteOrganization(input: {
  operator: string;
  nationalId: string;
  now?: Date;
}): Promise<DeleteOrganizationResult> {
  const now = input.now ?? new Date();
  const nationalId = requireNationalId(input.nationalId);
  const organization = await prisma.organization.findUnique({ where: { nationalId } });
  if (!organization) throw new OperatorError('No organization with that national ID');
  const organizationId = organization.id;
  if (organization.state === 'DELETED') {
    return { organizationId, objectsDeleted: 0, objectsFailed: 0, finished: true };
  }

  if (organization.state === 'ACTIVE') {
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { state: 'DELETING', isActive: false },
      });
      await tx.membership.updateMany({
        where: { organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
      const sessions = await tx.memberSession.deleteMany({ where: { organizationId } });
      const jobs = await tx.processingJob.updateMany({
        where: { organizationId, state: 'QUEUED' },
        data: { state: 'CANCELLED', completedAt: now, errorCode: 'organization_deleted' },
      });
      await audit(
        tx,
        input.operator,
        'organization.delete.start',
        { organizationId },
        { sessionsRevoked: sessions.count, jobsCancelled: jobs.count },
      );
    });
  }

  const storage = getStorage();
  const recordings = await prisma.recording.findMany({
    where: { organizationId, state: { not: 'DELETED' } },
    select: { id: true, objectKey: true, bytes: true, state: true },
  });
  let objectsDeleted = 0;
  let objectsFailed = 0;
  for (const recording of recordings) {
    try {
      await storage.delete(recording.objectKey);
    } catch {
      objectsFailed += 1;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const moved = await tx.recording.updateMany({
        where: { id: recording.id, state: { not: 'DELETED' } },
        data: { state: 'DELETED', deletedAt: now },
      });
      if (moved.count !== 1) return;
      if (recording.state === 'PENDING') {
        await tx.$executeRaw`
          UPDATE storage_ledger
          SET "reservedBytes" = GREATEST("reservedBytes" - ${recording.bytes}, 0)
          WHERE id = 1`;
      } else {
        await releaseCommitted(tx, recording.bytes, now);
      }
    });
    objectsDeleted += 1;
  }
  if (objectsFailed > 0) {
    await prisma.operatorAudit.create({
      data: {
        operator: input.operator,
        action: 'organization.delete.incomplete',
        organizationId,
        detail: { objectsDeleted, objectsFailed },
      },
    });
    return { organizationId, objectsDeleted, objectsFailed, finished: false };
  }

  await prisma.$transaction(async (tx) => {
    // Calls first: their findings reference categories (ON DELETE RESTRICT).
    await tx.call.deleteMany({ where: { organizationId } });
    await tx.issueCategory.deleteMany({ where: { organizationId } });
    await tx.membership.deleteMany({ where: { organizationId } });
    await tx.organization.update({
      where: { id: organizationId },
      data: { state: 'DELETED', isActive: false, name: '—' },
    });
    await audit(
      tx,
      input.operator,
      'organization.delete.finish',
      { organizationId },
      { objectsDeleted },
    );
  });
  return { organizationId, objectsDeleted, objectsFailed, finished: true };
}
