import { randomUUID } from 'node:crypto';
import { Prisma, type JobTrigger, type ProcessingJob } from '@prisma/client';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { utc } from '@/services/sql';

/**
 * Durable PostgreSQL job queue (tech spec §7, decision 010).
 *
 * - claim: one short transaction, `FOR UPDATE SKIP LOCKED`, so concurrent
 *   workers never take the same job; the claim writes a fresh lease token.
 * - lease: renewed while the job runs; an expired lease is reclaimed.
 * - fence: every final write names the job ID *and* the lease token, so a
 *   stale worker (lease lost, job reclaimed) cannot publish or fail the job.
 * - backoff: transient failures retry with bounded exponential delay until
 *   the attempt budget is used; permanent failures stop at once.
 * - a partial unique index keeps one QUEUED/RUNNING job per call.
 */

export type ClaimedJob = Pick<
  ProcessingJob,
  'id' | 'organizationId' | 'callId' | 'trigger' | 'attempt' | 'maxAttempts'
> & { leaseToken: string };

export class StaleLeaseError extends Error {
  constructor() {
    super('lease lost: another worker owns this job');
    this.name = 'StaleLeaseError';
  }
}

const BACKOFF_MAX_MS = 30 * 60_000;

export function backoffMs(attempt: number): number {
  const base = env.WORKER_BACKOFF_BASE_SECONDS * 1000;
  return Math.min(BACKOFF_MAX_MS, base * 4 ** Math.max(0, attempt - 1));
}

const leaseUntil = (now: Date) => new Date(now.getTime() + env.WORKER_LEASE_SECONDS * 1000);

/** Insert the analysis job for a call inside the caller's transaction. */
export function enqueueAnalysis(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; callId: string; trigger: JobTrigger; now: Date },
) {
  return tx.processingJob.create({
    data: {
      organizationId: input.organizationId,
      callId: input.callId,
      operation: 'ANALYZE',
      trigger: input.trigger,
      state: 'QUEUED',
      maxAttempts: env.WORKER_MAX_ATTEMPTS,
      runAfter: input.now,
      enqueuedAt: input.now,
    },
  });
}

/** Claim the next runnable job of an active organization, or null. */
export async function claimNextJob(now = new Date()): Promise<ClaimedJob | null> {
  const token = randomUUID();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedJob[]>`
      WITH next AS (
        SELECT j.id
        FROM processing_jobs j
        JOIN organizations o ON o.id = j."organizationId"
        WHERE j.state = 'QUEUED' AND j."runAfter" <= ${utc(now)} AND o."isActive"
        ORDER BY j."runAfter", j."enqueuedAt"
        LIMIT 1
        FOR UPDATE OF j SKIP LOCKED
      )
      UPDATE processing_jobs AS p
      SET state = 'RUNNING',
          attempt = p.attempt + 1,
          "leaseToken" = ${token},
          "leaseExpiresAt" = ${utc(leaseUntil(now))},
          "startedAt" = COALESCE(p."startedAt", ${utc(now)}),
          stage = NULL
      FROM next
      WHERE p.id = next.id
      RETURNING p.id, p."organizationId", p."callId", p.trigger, p.attempt, p."maxAttempts", p."leaseToken"`;
    const job = rows[0];
    if (!job) return null;
    await tx.call.updateMany({
      where: {
        id: job.callId,
        organizationId: job.organizationId,
        state: { in: ['QUEUED', 'FAILED'] },
      },
      data: { state: 'PROCESSING', rowVersion: { increment: 1 } },
    });
    return job;
  });
}

/** Extend the lease. False means the lease was lost and the worker must stop. */
export async function renewLease(job: ClaimedJob, now = new Date()): Promise<boolean> {
  const { count } = await prisma.processingJob.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, state: 'RUNNING' },
    data: { leaseExpiresAt: leaseUntil(now) },
  });
  return count === 1;
}

export async function setStage(job: ClaimedJob, stage: string): Promise<void> {
  await prisma.processingJob.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, state: 'RUNNING' },
    data: { stage },
  });
}

/**
 * Fenced completion, called inside the publish transaction. Throws
 * StaleLeaseError (rolling the transaction back) when this worker no longer
 * owns the job.
 */
export async function completeJob(
  tx: Prisma.TransactionClient,
  job: ClaimedJob,
  now: Date,
): Promise<void> {
  const { count } = await tx.processingJob.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, state: 'RUNNING' },
    data: {
      state: 'SUCCEEDED',
      completedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      stage: null,
    },
  });
  if (count !== 1) throw new StaleLeaseError();
}

export type FailureKind = 'transient' | 'permanent';

/**
 * Record a failure, fenced by the lease. A transient failure with attempts
 * left goes back to the queue after a backoff; otherwise the job and the call
 * fail with a stable code. `retryable` controls whether تلاش دوباره is offered.
 */
export async function failJob(
  job: ClaimedJob,
  input: { code: string; kind: FailureKind; retryable: boolean },
  now = new Date(),
): Promise<'requeued' | 'failed' | 'stale'> {
  return prisma.$transaction(async (tx) => {
    const requeue = input.kind === 'transient' && job.attempt < job.maxAttempts;
    const { count } = await tx.processingJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken, state: 'RUNNING' },
      data: requeue
        ? {
            state: 'QUEUED',
            runAfter: new Date(now.getTime() + backoffMs(job.attempt)),
            leaseToken: null,
            leaseExpiresAt: null,
            stage: null,
            errorCode: input.code,
          }
        : {
            state: 'FAILED',
            completedAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
            stage: null,
            errorCode: input.code,
          },
    });
    if (count !== 1) return 'stale';
    await tx.call.updateMany({
      where: { id: job.callId, organizationId: job.organizationId, state: 'PROCESSING' },
      data: requeue
        ? { state: 'QUEUED', rowVersion: { increment: 1 } }
        : {
            state: 'FAILED',
            failureCode: input.code,
            failureRetryable: input.retryable,
            rowVersion: { increment: 1 },
          },
    });
    return requeue ? 'requeued' : 'failed';
  });
}

/**
 * Reclaim jobs whose lease expired (a worker crashed or was killed). Jobs with
 * attempts left are queued again at once; exhausted ones fail as transient.
 */
export async function reclaimExpiredLeases(
  now = new Date(),
): Promise<{ requeued: number; failed: number }> {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.$queryRaw<
      { id: string; organizationId: string; callId: string; exhausted: boolean }[]
    >`
      SELECT id, "organizationId", "callId", attempt >= "maxAttempts" AS exhausted
      FROM processing_jobs
      WHERE state = 'RUNNING' AND "leaseExpiresAt" < ${utc(now)}
      FOR UPDATE SKIP LOCKED`;
    let requeued = 0;
    let failed = 0;
    for (const job of expired) {
      if (job.exhausted) {
        await tx.processingJob.update({
          where: { id: job.id },
          data: {
            state: 'FAILED',
            completedAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
            errorCode: 'transient_failure',
          },
        });
        await tx.call.updateMany({
          where: { id: job.callId, organizationId: job.organizationId, state: 'PROCESSING' },
          data: {
            state: 'FAILED',
            failureCode: 'transient_failure',
            failureRetryable: true,
            rowVersion: { increment: 1 },
          },
        });
        failed += 1;
      } else {
        await tx.processingJob.update({
          where: { id: job.id },
          data: {
            state: 'QUEUED',
            runAfter: now,
            leaseToken: null,
            leaseExpiresAt: null,
            stage: null,
          },
        });
        await tx.call.updateMany({
          where: { id: job.callId, organizationId: job.organizationId, state: 'PROCESSING' },
          data: { state: 'QUEUED', rowVersion: { increment: 1 } },
        });
        requeued += 1;
      }
    }
    return { requeued, failed };
  });
}

/**
 * Queue a retry (or an operator reprocess). Concurrent requests converge on
 * one active job: the partial unique index rejects a second one, and the
 * existing job is returned instead.
 */
export async function enqueueOrGetActive(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; callId: string; trigger: JobTrigger; now: Date },
): Promise<{ jobId: string; created: boolean }> {
  const active = await tx.processingJob.findFirst({
    where: {
      organizationId: input.organizationId,
      callId: input.callId,
      operation: 'ANALYZE',
      state: { in: ['QUEUED', 'RUNNING'] },
    },
    select: { id: true },
  });
  if (active) return { jobId: active.id, created: false };
  const job = await enqueueAnalysis(tx, input);
  return { jobId: job.id, created: true };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Queue depth and oldest due job, for operations signals (tech spec §11). */
export async function queueStats(now = new Date()) {
  const [queued, running, oldest] = await Promise.all([
    prisma.processingJob.count({ where: { state: 'QUEUED' } }),
    prisma.processingJob.count({ where: { state: 'RUNNING' } }),
    prisma.processingJob.findFirst({
      where: { state: 'QUEUED' },
      orderBy: { enqueuedAt: 'asc' },
      select: { enqueuedAt: true },
    }),
  ]);
  return {
    queued,
    running,
    oldestQueuedAgeSeconds: oldest
      ? Math.round((now.getTime() - oldest.enqueuedAt.getTime()) / 1000)
      : 0,
  };
}
