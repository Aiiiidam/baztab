import { Prisma, type CallState, type DateSource } from '@prisma/client';
import { baseFilename, expectedReadyAt, resolveCallDate } from '@/lib/call-date';
import { env } from '@/lib/env';
import { ServiceError } from '@/lib/errors';
import { t } from '@/lib/t';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { AuthMember } from '@/types/auth';
import { MediaError, probeMp3 } from '@/services/media.service';
import { enqueueAnalysis, enqueueOrGetActive, isUniqueViolation } from '@/services/queue.service';
import { utc } from '@/services/sql';
import { getStorage, objectKeyFor } from '@/services/storage.service';

/**
 * Upload orchestration and the call record (tech spec §5, §6, plan M2-T5).
 *
 *   probe → reserve (fingerprint + quota bytes, one transaction)
 *         → store object → finalize (QUEUED + first job + bytes committed, one transaction)
 *
 * The quota check is a single conditional UPDATE on the one-row ledger, so two
 * concurrent uploads can never overshoot the budget. A reservation whose
 * object never got committed is cleaned up by `reconcileReservations`. Scope
 * always comes from the member; filenames are never logged.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const MP3_CONTENT_TYPE = 'audio/mpeg';

export type UploadErrorCode =
  | 'too_large'
  | 'empty_file'
  | 'unsupported_type'
  | 'invalid_media'
  | 'storage_limit'
  | 'inactive_access'
  | 'transient_failure';

export type UploadResult =
  | {
      status: 'accepted' | 'duplicate';
      callId: string;
      effectiveDate: string;
      dateSource: DateSource;
      state: CallState;
      readyAt: string;
    }
  | { status: 'in_progress'; callId: string }
  | { status: 'rejected'; errorCode: UploadErrorCode };

export type UploadInput = {
  filename: string;
  /** Scratch copy of the original bytes. */
  filePath: string;
  bytes: number;
  sha256: string;
  acceptedAt?: Date;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function reserveBytes(tx: Prisma.TransactionClient, bytes: number, now: Date) {
  return tx.$executeRaw`
    UPDATE storage_ledger
    SET "reservedBytes" = "reservedBytes" + ${bytes}, "updatedAt" = ${utc(now)}
    WHERE id = 1 AND "committedBytes" + "reservedBytes" + ${bytes} <= ${env.STORAGE_BUDGET_BYTES}`;
}

function releaseReserved(tx: Prisma.TransactionClient | typeof prisma, bytes: number, now: Date) {
  return tx.$executeRaw`
    UPDATE storage_ledger
    SET "reservedBytes" = GREATEST("reservedBytes" - ${bytes}, 0), "updatedAt" = ${utc(now)}
    WHERE id = 1`;
}

function commitReserved(tx: Prisma.TransactionClient, bytes: number, now: Date) {
  return tx.$executeRaw`
    UPDATE storage_ledger
    SET "reservedBytes" = GREATEST("reservedBytes" - ${bytes}, 0),
        "committedBytes" = "committedBytes" + ${bytes},
        "updatedAt" = ${utc(now)}
    WHERE id = 1`;
}

/** Bytes released after a confirmed object deletion (retention, organization deletion). */
export function releaseCommitted(
  tx: Prisma.TransactionClient | typeof prisma,
  bytes: number,
  now: Date,
) {
  return tx.$executeRaw`
    UPDATE storage_ledger
    SET "committedBytes" = GREATEST("committedBytes" - ${bytes}, 0), "updatedAt" = ${utc(now)}
    WHERE id = 1`;
}

type ExistingCall = {
  id: string;
  state: CallState;
  effectiveDate: Date;
  dateSource: DateSource;
  acceptedAt: Date;
};

function existingResult(call: ExistingCall): UploadResult {
  if (call.state === 'UPLOADING') return { status: 'in_progress', callId: call.id };
  return {
    status: 'duplicate',
    callId: call.id,
    effectiveDate: isoDate(call.effectiveDate),
    dateSource: call.dateSource,
    state: call.state,
    readyAt: expectedReadyAt(call.acceptedAt, env.REPORT_TIME_ZONE).toISOString(),
  };
}

const EXISTING_SELECT = {
  id: true,
  state: true,
  effectiveDate: true,
  dateSource: true,
  acceptedAt: true,
} as const;

async function findByFingerprint(organizationId: string, sha256: string) {
  const fingerprint = await prisma.recordingFingerprint.findUnique({
    where: { organizationId_sha256: { organizationId, sha256 } },
    include: { call: { select: EXISTING_SELECT } },
  });
  return fingerprint?.call ?? null;
}

class StorageLimit extends Error {}
class Existing extends Error {
  constructor(readonly call: ExistingCall) {
    super('existing');
  }
}

/**
 * Accept one uploaded MP3 for the member's organization. Never throws for an
 * expected outcome: every result is a status the route turns into a response.
 */
export async function acceptUpload(member: AuthMember, input: UploadInput): Promise<UploadResult> {
  const now = input.acceptedAt ?? new Date();
  const { organizationId } = member;

  if (input.bytes === 0) return { status: 'rejected', errorCode: 'empty_file' };
  if (input.bytes > env.UPLOAD_MAX_BYTES) return { status: 'rejected', errorCode: 'too_large' };
  if (!baseFilename(input.filename).toLowerCase().endsWith('.mp3')) {
    return { status: 'rejected', errorCode: 'unsupported_type' };
  }

  // Cheap duplicate check first: an exact re-upload needs no probe.
  const known = await findByFingerprint(organizationId, input.sha256);
  if (known) return existingResult(known);

  let media;
  try {
    media = await probeMp3(input.filePath, input.bytes);
  } catch (error) {
    if (error instanceof MediaError) {
      if (error.code === 'probe_failed') {
        logger.error({ code: error.code }, 'Media probe could not run');
        return { status: 'rejected', errorCode: 'transient_failure' };
      }
      return {
        status: 'rejected',
        errorCode: error.code === 'empty_file' ? 'empty_file' : 'invalid_media',
      };
    }
    throw error;
  }

  const dates = resolveCallDate(input.filename, now, {
    timeZone: env.REPORT_TIME_ZONE,
    minDate: env.FILENAME_DATE_MIN,
  });

  // ── Reserve ────────────────────────────────────────────────────────────
  let reservation: { callId: string; objectKey: string };
  try {
    reservation = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { isActive: true, retentionDays: true },
      });
      if (!organization?.isActive) throw new Error('inactive');

      const existing = await tx.recordingFingerprint.findUnique({
        where: { organizationId_sha256: { organizationId, sha256: input.sha256 } },
        include: { call: { select: EXISTING_SELECT } },
      });
      if (existing) throw new Existing(existing.call);

      if ((await reserveBytes(tx, input.bytes, now)) === 0) throw new StorageLimit();

      const call = await tx.call.create({
        data: {
          organizationId,
          acceptedAt: now,
          filenameDate: dates.filenameDate ? new Date(`${dates.filenameDate}T00:00:00Z`) : null,
          effectiveDate: new Date(`${dates.effectiveDate}T00:00:00Z`),
          dateSource: dates.dateSource,
          originalFilename: baseFilename(input.filename),
          state: 'UPLOADING',
        },
        select: { id: true },
      });
      const objectKey = objectKeyFor(organizationId, call.id);
      await tx.recording.create({
        data: {
          organizationId,
          callId: call.id,
          objectKey,
          bytes: input.bytes,
          durationMs: media.durationMs,
          contentType: MP3_CONTENT_TYPE,
          expiresAt: new Date(now.getTime() + organization.retentionDays * DAY_MS),
          state: 'PENDING',
        },
      });
      await tx.recordingFingerprint.create({
        data: { organizationId, sha256: input.sha256, callId: call.id },
      });
      return { callId: call.id, objectKey };
    });
  } catch (error) {
    if (error instanceof Existing) return existingResult(error.call);
    if (error instanceof StorageLimit) return { status: 'rejected', errorCode: 'storage_limit' };
    if (error instanceof Error && error.message === 'inactive') {
      return { status: 'rejected', errorCode: 'inactive_access' };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Lost the race to an identical upload: report what the winner created.
      const winner = await findByFingerprint(organizationId, input.sha256);
      if (winner) return existingResult(winner);
    }
    throw error;
  }

  // ── Store ──────────────────────────────────────────────────────────────
  try {
    await getStorage().put(reservation.objectKey, input.filePath, input.bytes, MP3_CONTENT_TYPE);
  } catch (error) {
    logger.error({ err: error, callId: reservation.callId }, 'Storing a recording failed');
    await abandonReservation(organizationId, reservation.callId, input.bytes, now).catch(
      (cleanupError: unknown) =>
        // Left for reconcileReservations, which checks the stored object first.
        logger.error(
          { err: cleanupError, callId: reservation.callId },
          'Releasing a failed reservation failed',
        ),
    );
    return { status: 'rejected', errorCode: 'transient_failure' };
  }

  // ── Finalize ───────────────────────────────────────────────────────────
  try {
    await finalizeReservation(organizationId, reservation.callId, input.bytes, now);
  } catch (error) {
    // The object is stored; reconcileReservations will finalize it after checking its size.
    logger.error({ err: error, callId: reservation.callId }, 'Finalizing an upload failed');
    return { status: 'in_progress', callId: reservation.callId };
  }

  return {
    status: 'accepted',
    callId: reservation.callId,
    effectiveDate: dates.effectiveDate,
    dateSource: dates.dateSource,
    state: 'QUEUED',
    readyAt: expectedReadyAt(now, env.REPORT_TIME_ZONE).toISOString(),
  };
}

/** Mark the call queued, commit its bytes and insert the first job, atomically. */
async function finalizeReservation(
  organizationId: string,
  callId: string,
  bytes: number,
  now: Date,
) {
  await prisma.$transaction(async (tx) => {
    const moved = await tx.call.updateMany({
      where: { id: callId, organizationId, state: 'UPLOADING' },
      data: { state: 'QUEUED', rowVersion: { increment: 1 } },
    });
    if (moved.count !== 1) throw new Error('Reservation is no longer pending');
    await tx.recording.update({
      where: { organizationId_callId: { organizationId, callId } },
      data: { state: 'STORED', storedAt: now },
    });
    await commitReserved(tx, bytes, now);
    await enqueueAnalysis(tx, { organizationId, callId, trigger: 'INITIAL', now });
  });
}

/** Drop a reservation whose object was never committed and release its bytes. */
async function abandonReservation(
  organizationId: string,
  callId: string,
  bytes: number,
  now: Date,
) {
  await prisma.$transaction(async (tx) => {
    const removed = await tx.call.deleteMany({
      where: { id: callId, organizationId, state: 'UPLOADING' },
    });
    if (removed.count === 1) await releaseReserved(tx, bytes, now);
  });
}

/**
 * Maintenance (worker): resolve reservations older than the TTL. When the
 * stored object exists with exactly the reserved size, the upload is finalized;
 * otherwise any partial object is deleted and the reservation released.
 */
export async function reconcileReservations(
  now = new Date(),
): Promise<{ finalized: number; released: number }> {
  const cutoff = new Date(now.getTime() - env.UPLOAD_RESERVATION_TTL_MINUTES * 60_000);
  const stale = await prisma.call.findMany({
    where: { state: 'UPLOADING', createdAt: { lt: cutoff } },
    select: {
      id: true,
      organizationId: true,
      recording: { select: { objectKey: true, bytes: true } },
    },
    take: 100,
  });
  let finalized = 0;
  let released = 0;
  const storage = getStorage();
  for (const call of stale) {
    if (!call.recording) continue;
    const stored = await storage.head(call.recording.objectKey);
    if (stored && stored.bytes === call.recording.bytes) {
      await finalizeReservation(call.organizationId, call.id, call.recording.bytes, now);
      finalized += 1;
    } else {
      if (stored) await storage.delete(call.recording.objectKey);
      await abandonReservation(call.organizationId, call.id, call.recording.bytes, now);
      released += 1;
    }
  }
  return { finalized, released };
}

/**
 * تلاش دوباره (P1-01, tech spec §7, plan M5-T2): queue a recoverable failure
 * again while its recording is retained. The call ID, recording, fingerprint
 * and accepted time stay the same. Concurrent requests converge on one job.
 */
export async function requestRetry(
  member: Pick<AuthMember, 'organizationId'>,
  callId: string,
  now = new Date(),
): Promise<{ jobId: string; created: boolean }> {
  const { organizationId } = member;
  try {
    return await prisma.$transaction(async (tx) => {
      const call = await tx.call.findFirst({
        where: { id: callId, organizationId, state: { not: 'UPLOADING' } },
        select: {
          state: true,
          failureRetryable: true,
          recording: { select: { state: true, expiresAt: true } },
        },
      });
      if (!call) throw new ServiceError(t('errors.notFound'), 'NOT_FOUND');
      if (call.state === 'QUEUED' || call.state === 'PROCESSING') {
        const active = await enqueueOrGetActive(tx, {
          organizationId,
          callId,
          trigger: 'RETRY',
          now,
        });
        return active;
      }
      const retained = call.recording?.state === 'STORED' && call.recording.expiresAt > now;
      if (call.state !== 'FAILED' || !call.failureRetryable || !retained) {
        throw new ServiceError(t('failure.retryNotAllowed'), 'RETRY_NOT_ALLOWED');
      }
      const result = await enqueueOrGetActive(tx, {
        organizationId,
        callId,
        trigger: 'RETRY',
        now,
      });
      await tx.call.updateMany({
        where: { id: callId, organizationId, state: 'FAILED' },
        data: {
          state: 'QUEUED',
          failureCode: null,
          failureRetryable: false,
          rowVersion: { increment: 1 },
        },
      });
      return result;
    });
  } catch (error) {
    // A concurrent retry inserted the job first: return that job.
    if (isUniqueViolation(error)) {
      const active = await prisma.processingJob.findFirst({
        where: { organizationId, callId, state: { in: ['QUEUED', 'RUNNING'] } },
        select: { id: true },
      });
      if (active) return { jobId: active.id, created: false };
    }
    throw error;
  }
}
