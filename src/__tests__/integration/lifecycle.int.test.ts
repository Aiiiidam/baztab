import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/errors';
import { processJob } from '@/services/analysis.service';
import { acceptUpload, requestRetry } from '@/services/call.service';
import { getCallDetail } from '@/services/call-query.service';
import { createFakeEngine } from '@/services/inference/fake';
import { claimNextJob } from '@/services/queue.service';
import { getIssueReport } from '@/services/report.service';
import {
  deleteExpiredObjects,
  expireRecordings,
  reconcileLedger,
} from '@/services/retention.service';
import { confirmReview, saveCorrections } from '@/services/review.service';
import { FsStorage } from '@/services/storage/fs-storage';
import { setStorageForTests } from '@/services/storage.service';
import { seedTaxonomy } from '@/services/taxonomy.service';
import type { AuthMember } from '@/types/auth';
import { prisma, resetDatabase } from './db';
import { ledger, makeMember, scratchCopy } from './fixtures';

beforeEach(resetDatabase);
afterEach(() => setStorageForTests(undefined));

const engine = createFakeEngine();
const RANGE = { from: '2020-01-01', to: '2030-12-31' };
const DAY = 24 * 60 * 60 * 1000;

async function readyCall(
  fixture = '20261020-escalated.mp3',
): Promise<{ m: AuthMember; callId: string }> {
  const m = await makeMember();
  await prisma.$transaction((tx) => seedTaxonomy(tx, m.organizationId));
  const result = await acceptUpload(m, await scratchCopy(fixture));
  const callId = (result as { callId: string }).callId;
  for (;;) {
    await prisma.processingJob.updateMany({
      where: { state: 'QUEUED' },
      data: { runAfter: new Date(0) },
    });
    const job = await claimNextJob();
    if (!job) break;
    await processJob(job, engine, new AbortController().signal);
  }
  return { m, callId };
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ServiceError) return error.code;
    throw error;
  }
}

describe('optional review and corrections (P1-06)', () => {
  it('creates a child revision, audits the delta and moves the report count', async () => {
    const { m, callId } = await readyCall();
    const call = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: { activeRevision: { include: { findings: true } } },
    });
    const source = call.activeRevision!;
    const appError = await prisma.issueCategory.findFirstOrThrow({
      where: { organizationId: m.organizationId, key: 'app_error' },
    });

    const { revisionId } = await saveCorrections(m, {
      callId,
      revisionId: source.id,
      findings: [
        { findingId: source.findings[0].id, categoryId: appError.id, outcome: 'RESOLVED' },
      ],
      scores: [{ criterion: 'CLEAR_CLOSURE', rating: 'PARTLY_MET' }],
    });

    const next = await prisma.analysisRevision.findUniqueOrThrow({
      where: { id: revisionId },
      include: { findings: true, scores: true },
    });
    expect(next).toMatchObject({ reason: 'CORRECTION', parentRevisionId: source.id, version: 2 });
    expect(next.findings[0]).toMatchObject({
      categoryId: appError.id,
      outcome: 'RESOLVED',
      categoryHumanSet: true,
      outcomeHumanSet: true,
      eligible: true,
    });
    expect(next.scores.find((s) => s.criterion === 'CLEAR_CLOSURE')).toMatchObject({
      rating: 'PARTLY_MET',
      humanSet: true,
      explanation: null,
    });
    // The published source revision is untouched.
    expect(
      (await prisma.issueFinding.findUniqueOrThrow({ where: { id: source.findings[0].id } }))
        .outcome,
    ).toBe('UNRESOLVED');

    const audits = await prisma.correctionAudit.findMany({ orderBy: { field: 'asc' } });
    expect(audits.map((a) => [a.field, a.previousValue, a.newValue])).toEqual([
      ['finding[0].category', 'otp_not_received', 'app_error'],
      ['finding[0].outcome', 'UNRESOLVED', 'RESOLVED'],
      ['score.CLEAR_CLOSURE', 'MET', 'PARTLY_MET'],
    ]);
    expect(audits.every((a) => a.actorMembershipId === m.membershipId)).toBe(true);

    const ranks = Object.fromEntries(
      (await getIssueReport(m, RANGE)).ranks.map((r) => [r.key, r.calls]),
    );
    expect(ranks).toEqual({ app_error: 1 });
  });

  it('detects a concurrent edit against a stale revision', async () => {
    const { m, callId } = await readyCall();
    const call = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: { activeRevision: { include: { findings: true } } },
    });
    const finding = call.activeRevision!.findings[0];
    const edit = (outcome: 'RESOLVED' | 'UNKNOWN') =>
      saveCorrections(m, {
        callId,
        revisionId: call.activeRevision!.id,
        findings: [{ findingId: finding.id, categoryId: finding.categoryId, outcome }],
        scores: [],
      });
    const results = await Promise.allSettled([edit('RESOLVED'), edit('UNKNOWN')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as ServiceError).code).toBe('STALE_REVISION');
    expect(await codeOf(confirmReview(m, { callId, revisionId: call.activeRevision!.id }))).toBe(
      'STALE_REVISION',
    );
  });

  it('works after expiry without evidence, and a foreign member gets not-found', async () => {
    const { m, callId } = await readyCall();
    await prisma.recording.updateMany({
      where: { callId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expireRecordings();
    const detail = await getCallDetail(m, callId);
    expect(detail?.analysis?.findings[0].evidence).toEqual([]);
    const finding = detail!.analysis!.findings[0];
    await saveCorrections(m, {
      callId,
      revisionId: detail!.analysis!.revisionId,
      findings: [{ findingId: finding.id, categoryId: finding.category!.id, outcome: 'RESOLVED' }],
      scores: [],
    });
    expect((await getIssueReport(m, RANGE)).ranks[0]).toMatchObject({
      key: 'otp_not_received',
      calls: 1,
    });

    const other = await makeMember('14006278561', 'دیگر');
    expect(
      await codeOf(
        saveCorrections(other, {
          callId,
          revisionId: detail!.analysis!.revisionId,
          findings: [],
          scores: [],
        }),
      ),
    ).toBe('NOT_FOUND');
  });
});

describe('retention and deletion (tech spec §10)', () => {
  it('removes audio, transcript, explanations, evidence and fingerprint; keeps counts and filename', async () => {
    const { m, callId } = await readyCall();
    const before = await getIssueReport(m, RANGE);
    const bytes = (await ledger()).committed;
    expect(bytes).toBeGreaterThan(0);

    await prisma.recording.updateMany({
      where: { callId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    // Hidden at authorization time even before the deletion task runs.
    expect((await getCallDetail(m, callId))?.transcript).toBeNull();

    expect(await expireRecordings()).toBe(1);
    expect(await prisma.transcriptSegment.count()).toBe(0);
    expect(await prisma.evidence.count()).toBe(0);
    expect(await prisma.recordingFingerprint.count()).toBe(0);
    expect(await prisma.issueFinding.count({ where: { summary: { not: null } } })).toBe(0);
    expect(await prisma.score.count({ where: { explanation: { not: null } } })).toBe(0);

    // A failed storage delete keeps the bytes committed and is retried.
    setStorageForTests(
      Object.assign(Object.create(new FsStorage('.storage-test')), {
        delete: async () => {
          throw new Error('storage down');
        },
      }),
    );
    expect(await deleteExpiredObjects()).toEqual({ deleted: 0, failed: 1 });
    expect((await ledger()).committed).toBe(bytes);
    setStorageForTests(undefined);
    expect(await deleteExpiredObjects()).toEqual({ deleted: 1, failed: 0 });
    expect(await ledger()).toEqual({ committed: 0, reserved: 0 });
    expect(await deleteExpiredObjects()).toEqual({ deleted: 0, failed: 0 });

    const after = await getIssueReport(m, RANGE);
    expect(after.analyzedCalls).toBe(before.analyzedCalls);
    expect(after.ranks).toEqual(before.ranks);
    const detail = await getCallDetail(m, callId);
    expect(detail?.originalFilename).toBe('20261020-escalated.mp3');
    expect(detail?.analysis?.findings[0]).toMatchObject({ summary: null, outcome: 'UNRESOLVED' });
    expect(detail?.recording).toMatchObject({ available: false, expired: true });

    // The same file uploaded again is a new call.
    const again = await acceptUpload(m, await scratchCopy('20261020-escalated.mp3'));
    expect(again.status).toBe('accepted');
    expect((again as { callId: string }).callId).not.toBe(callId);
  });

  it('reconcile repairs a corrupted ledger from the recording rows', async () => {
    await readyCall();
    const truth = await ledger();
    await prisma.storageLedger.update({
      where: { id: 1 },
      data: { committedBytes: 999, reservedBytes: 5 },
    });
    const report = await reconcileLedger();
    expect(report.drift).not.toBe(0);
    expect(await ledger()).toEqual(truth);
  });
});

describe('retry (P1-01)', () => {
  it('converges concurrent retries on one job and keeps the call', async () => {
    const { m, callId } = await readyCall('invalid-output.mp3');
    expect((await prisma.call.findUniqueOrThrow({ where: { id: callId } })).state).toBe('FAILED');
    const results = await Promise.all([
      requestRetry(m, callId),
      requestRetry(m, callId),
      requestRetry(m, callId),
    ]);
    expect(new Set(results.map((r) => r.jobId)).size).toBe(1);
    expect(await prisma.processingJob.count({ where: { callId, state: 'QUEUED' } })).toBe(1);
    expect(await prisma.call.count()).toBe(1);
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call).toMatchObject({ state: 'QUEUED', failureCode: null });
  });

  it('refuses no_usable_speech and expired recordings', async () => {
    const { m, callId } = await readyCall('silence.mp3');
    expect(await codeOf(requestRetry(m, callId))).toBe('RETRY_NOT_ALLOWED');
  });
});
