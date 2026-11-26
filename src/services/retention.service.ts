import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { releaseCommitted } from '@/services/call.service';
import { getStorage } from '@/services/storage.service';

/**
 * Retention (tech spec §10, plan M5-T4). Days count from the accepted upload
 * time (no Jalali/Gregorian month differences).
 *
 * 1. Authorization already hides audio, transcript and evidence the moment
 *    `expiresAt` passes (call-query.service, audio route).
 * 2. `expireRecordings` then, in one transaction per call, marks the recording
 *    EXPIRED and deletes the fingerprint, transcript segments (evidence goes
 *    with them) and every model-written explanation. Categories, outcomes,
 *    ratings, stored eligibility, the filename and the access log remain.
 * 3. `deleteExpiredObjects` removes the storage object; a missing object counts
 *    as deleted; budget bytes are released only after a confirmed deletion.
 *    Failures are retried on the next pass. Both steps are idempotent.
 */

const BATCH = 50;

export async function expireRecordings(now = new Date()): Promise<number> {
  const due = await prisma.recording.findMany({
    where: { state: 'STORED', expiresAt: { lte: now } },
    select: { organizationId: true, callId: true },
    take: BATCH,
  });
  for (const { organizationId, callId } of due) {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.recording.updateMany({
        where: { organizationId, callId, state: 'STORED' },
        data: { state: 'EXPIRED' },
      });
      if (moved.count !== 1) return;
      await tx.recordingFingerprint.deleteMany({ where: { organizationId, callId } });
      const transcripts = await tx.transcript.findMany({
        where: { organizationId, callId },
        select: { id: true },
      });
      const transcriptIds = transcripts.map((transcript) => transcript.id);
      // Evidence rows reference segments and cascade with them.
      await tx.transcriptSegment.deleteMany({
        where: { organizationId, transcriptId: { in: transcriptIds } },
      });
      await tx.transcript.updateMany({
        where: { id: { in: transcriptIds } },
        data: { expiredAt: now },
      });
      await tx.evidence.deleteMany({ where: { organizationId, revision: { callId } } });
      await tx.analysisRevision.updateMany({
        where: { organizationId, callId },
        data: { callReason: null },
      });
      await tx.issueFinding.updateMany({
        where: { organizationId, callId },
        data: { summary: null, outcomeExplanation: null },
      });
      await tx.score.updateMany({
        where: { organizationId, revision: { callId } },
        data: { explanation: null },
      });
      // Pending work on an expired recording can never succeed.
      await tx.processingJob.updateMany({
        where: { organizationId, callId, state: 'QUEUED' },
        data: { state: 'CANCELLED', completedAt: now, errorCode: 'recording_expired' },
      });
      await tx.call.updateMany({
        where: { organizationId, id: callId, state: 'FAILED' },
        data: { failureRetryable: false },
      });
      await tx.call.updateMany({
        where: { organizationId, id: callId, state: 'QUEUED' },
        data: { state: 'FAILED', failureCode: 'recording_expired', failureRetryable: false },
      });
    });
  }
  return due.length;
}

export async function deleteExpiredObjects(
  now = new Date(),
): Promise<{ deleted: number; failed: number }> {
  const expired = await prisma.recording.findMany({
    where: { state: 'EXPIRED' },
    select: { id: true, objectKey: true, bytes: true, callId: true },
    take: BATCH,
  });
  let deleted = 0;
  let failed = 0;
  const storage = getStorage();
  for (const recording of expired) {
    try {
      await storage.delete(recording.objectKey);
    } catch (err) {
      failed += 1;
      logger.error(
        { err, callId: recording.callId },
        'Deleting an expired recording failed; will retry',
      );
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const moved = await tx.recording.updateMany({
        where: { id: recording.id, state: 'EXPIRED' },
        data: { state: 'DELETED', deletedAt: now },
      });
      if (moved.count === 1) await releaseCommitted(tx, recording.bytes, now);
    });
    deleted += 1;
  }
  return { deleted, failed };
}

export type LedgerReport = {
  committedBytes: number;
  reservedBytes: number;
  drift: number;
  usageRatio: number;
  providerBytes: number | null;
};

/**
 * Recompute the shared ledger from the recording rows (plan M5-T5) and compare
 * with provider usage. Logs the 70 % budget alert and any provider mismatch,
 * without customer data.
 */
export async function reconcileLedger(now = new Date()): Promise<LedgerReport> {
  const [committed, reserved] = await Promise.all([
    prisma.recording.aggregate({
      _sum: { bytes: true },
      where: { state: { in: ['STORED', 'EXPIRED'] } },
    }),
    prisma.recording.aggregate({ _sum: { bytes: true }, where: { state: 'PENDING' } }),
  ]);
  const committedBytes = committed._sum.bytes ?? 0;
  const reservedBytes = reserved._sum.bytes ?? 0;
  const before = await prisma.storageLedger.findUniqueOrThrow({ where: { id: 1 } });
  const drift =
    Number(before.committedBytes) - committedBytes + (Number(before.reservedBytes) - reservedBytes);
  if (drift !== 0) {
    await prisma.storageLedger.update({
      where: { id: 1 },
      data: {
        committedBytes: BigInt(committedBytes),
        reservedBytes: BigInt(reservedBytes),
        updatedAt: now,
      },
    });
    logger.warn({ drift }, 'Storage ledger repaired from recording rows');
  }

  let providerBytes: number | null = null;
  try {
    providerBytes = (await getStorage().usage()).bytes;
    if (Math.abs(providerBytes - committedBytes) > env.UPLOAD_MAX_BYTES) {
      logger.warn({ providerBytes, committedBytes }, 'storage_provider_mismatch');
    }
  } catch (err) {
    logger.error({ err }, 'Reading provider storage usage failed');
  }

  const usageRatio = (committedBytes + reservedBytes) / env.STORAGE_BUDGET_BYTES;
  if (usageRatio >= env.STORAGE_ALERT_RATIO) {
    logger.warn({ usageRatio: Number(usageRatio.toFixed(3)) }, 'storage_budget_alert');
  }
  return { committedBytes, reservedBytes, drift, usageRatio, providerBytes };
}
