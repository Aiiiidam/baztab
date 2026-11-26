import { beforeEach, describe, expect, it } from 'vitest';
import { processJob } from '@/services/analysis.service';
import { acceptUpload } from '@/services/call.service';
import { getCallSummary, listCalls } from '@/services/call-query.service';
import { createFakeEngine } from '@/services/inference/fake';
import type { InferenceEngine } from '@/services/inference/types';
import {
  claimNextJob,
  reclaimExpiredLeases,
  renewLease,
  type ClaimedJob,
} from '@/services/queue.service';
import { drillDownFilter, getIssueReport } from '@/services/report.service';
import { seedTaxonomy } from '@/services/taxonomy.service';
import type { AuthMember } from '@/types/auth';
import { prisma, resetDatabase } from './db';
import { makeMember, scratchCopy } from './fixtures';

beforeEach(resetDatabase);

const engine = createFakeEngine();
const signal = new AbortController().signal;
const RANGE = { from: '2020-01-01', to: '2030-12-31' };

async function member(nationalId = '10380284790'): Promise<AuthMember> {
  const m = await makeMember(nationalId, `سازمان ${nationalId}`);
  await prisma.$transaction((tx) => seedTaxonomy(tx, m.organizationId));
  return m;
}

async function upload(m: AuthMember, fixture: string) {
  const result = await acceptUpload(m, await scratchCopy(fixture));
  if (result.status !== 'accepted') throw new Error(`upload ${fixture}: ${JSON.stringify(result)}`);
  return result.callId;
}

/** Claim and process until the queue is empty (backoff skipped by moving runAfter). */
async function drain(e: InferenceEngine = engine, maxRounds = 10) {
  const outcomes = [];
  for (let round = 0; round < maxRounds; round++) {
    await prisma.processingJob.updateMany({
      where: { state: 'QUEUED' },
      data: { runAfter: new Date(0) },
    });
    const job = await claimNextJob();
    if (!job) break;
    outcomes.push(await processJob(job, e, signal));
  }
  return outcomes;
}

describe('queue claims and leases (tech spec §7)', () => {
  it('never gives the same job to two concurrent claimers', async () => {
    const m = await member();
    await upload(m, '20261019_093015_09121234567.mp3');
    await upload(m, '20261020-escalated.mp3');
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimNextJob()));
    const ids = claims.filter((job): job is ClaimedJob => job !== null).map((job) => job.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const states = await prisma.call.findMany({ select: { state: true } });
    expect(states.every((call) => call.state === 'PROCESSING')).toBe(true);
  });

  it('reclaims an expired lease and fences out the stale worker', async () => {
    const m = await member();
    const callId = await upload(m, '20261019_093015_09121234567.mp3');
    const stale = (await claimNextJob())!;

    // The worker "dies": its lease runs out and the job is reclaimed.
    const later = new Date(Date.now() + 10 * 60_000);
    expect(await reclaimExpiredLeases(later)).toEqual({ requeued: 1, failed: 0 });
    expect(await renewLease(stale)).toBe(false);

    const fresh = (await claimNextJob(later))!;
    expect(fresh.id).toBe(stale.id);
    expect(fresh.attempt).toBe(2);
    expect(fresh.leaseToken).not.toBe(stale.leaseToken);

    // The stale worker finishes late: nothing is published.
    expect((await processJob(stale, engine, signal)).status).toBe('stale');
    expect(await prisma.analysisRevision.count()).toBe(0);

    // The new owner publishes exactly once.
    expect((await processJob(fresh, engine, signal)).status).toBe('published');
    expect(await prisma.analysisRevision.count({ where: { callId } })).toBe(1);
  });
});

describe('analysis pipeline with the fake engine (P1-02, P1-03, P1-05)', () => {
  it('publishes transcript, findings, outcomes, scores and evidence atomically', async () => {
    const m = await member();
    const callId = await upload(m, '20261020-escalated.mp3');
    const [outcome] = await drain();
    expect(outcome.status).toBe('published');

    const call = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: {
        activeRevision: {
          include: {
            findings: { include: { category: true, evidence: true } },
            scores: true,
            transcript: { include: { segments: true } },
          },
        },
        jobs: true,
      },
    });
    expect(call.state).toBe('READY');
    expect(call.jobs[0].state).toBe('SUCCEEDED');
    const revision = call.activeRevision!;
    expect(revision).toMatchObject({
      version: 1,
      reason: 'INITIAL',
      status: 'PUBLISHED',
      taxonomyVersion: 'v0-draft',
    });
    expect(revision.transcript!.segments.length).toBeGreaterThan(3);
    expect(revision.findings).toHaveLength(1);
    expect(revision.findings[0]).toMatchObject({ outcome: 'UNRESOLVED', eligible: true });
    expect(revision.findings[0].category?.key).toBe('otp_not_received');
    expect(revision.findings[0].evidence.length).toBeGreaterThan(0);
    // Escalated, yet full marks for clear closure (outcome and score are independent).
    expect(revision.scores.map((s) => s.rating).sort()).toEqual(['MET', 'MET', 'MET']);
  });

  it('marks no_usable_speech as a permanent failure without retry', async () => {
    const m = await member();
    const callId = await upload(m, 'silence.mp3');
    const outcomes = await drain();
    expect(outcomes).toEqual([{ status: 'failed', code: 'no_usable_speech' }]);
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({
      state: 'FAILED',
      failureCode: 'no_usable_speech',
      failureRetryable: false,
    });
  });

  it('rejects invalid model output, retries within the budget, then fails retryably', async () => {
    const m = await member();
    const callId = await upload(m, 'invalid-output.mp3');
    const outcomes = await drain();
    expect(outcomes.map((o) => o.status)).toEqual(['requeued', 'requeued', 'failed']);
    expect(await prisma.analysisRevision.count()).toBe(0);
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({
      state: 'FAILED',
      failureCode: 'invalid_output',
      failureRetryable: true,
    });
  });

  it('recovers from a transient failure on the next attempt with the same call', async () => {
    const m = await member();
    const callId = await upload(m, 'transient-failure.mp3');
    const outcomes = await drain();
    expect(outcomes.map((o) => o.status)).toEqual(['requeued', 'published']);
    expect(await prisma.call.count()).toBe(1);
    expect((await prisma.call.findUniqueOrThrow({ where: { id: callId } })).state).toBe('READY');
  });

  it('reuses the transcript checkpoint when the analysis step is retried', async () => {
    const m = await member();
    await upload(m, 'invalid-output.mp3');
    await drain();
    expect(await prisma.transcript.count()).toBe(1);
  });

  it('downgrades agent criteria without agent evidence to insufficient evidence (ناقص)', async () => {
    const m = await member();
    const callId = await upload(m, '20261021 insufficient.mp3');
    await drain();
    const summary = await prisma.call.findUniqueOrThrow({
      where: { id: callId },
      include: { activeRevision: { include: { scores: true, findings: true } } },
    });
    expect(summary.activeRevision!.scores.every((s) => s.rating === 'INSUFFICIENT_EVIDENCE')).toBe(
      true,
    );
    expect(summary.activeRevision!.findings[0]).toMatchObject({
      eligible: false,
      outcome: 'UNKNOWN',
    });
  });

  it('keeps an unmapped finding but never makes it eligible', async () => {
    const m = await member();
    const callId = await upload(m, 'uncategorized.mp3');
    await drain();
    const finding = await prisma.issueFinding.findFirstOrThrow({ where: { callId } });
    expect(finding).toMatchObject({ categoryId: null, eligible: false });
  });

  it('refuses to publish when the recording expired during processing', async () => {
    const m = await member();
    const callId = await upload(m, '20261019_093015_09121234567.mp3');
    const job = (await claimNextJob())!;
    const slowEngine: InferenceEngine = {
      transcriber: engine.transcriber,
      analyzer: {
        modelVersion: engine.analyzer.modelVersion,
        promptVersion: engine.analyzer.promptVersion,
        analyze: async (input, context) => {
          await prisma.recording.updateMany({
            where: { callId },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          return engine.analyzer.analyze(input, context);
        },
      },
    };
    expect(await processJob(job, slowEngine, signal)).toEqual({
      status: 'failed',
      code: 'recording_expired',
    });
    expect(await prisma.analysisRevision.count()).toBe(0);
  });
});

describe('issue report and drill-down share one predicate (P1-04, tech spec §9)', () => {
  it('counts distinct calls per category and lists exactly those calls', async () => {
    const a = await member('10380284790');
    const b = await member('14006278561');
    await upload(a, '20261020-escalated.mp3'); // otp, unresolved
    await upload(a, 'تماس پشتیبانی بدون تاریخ.mp3'); // login ×2 (counts once) + signing
    await upload(a, '20261019_093015_09121234567.mp3'); // certificate
    await upload(a, 'uncategorized.mp3'); // analyzed, no reportable issue
    await upload(a, '20261021 insufficient.mp3'); // finding without evidence → not counted
    await upload(a, 'silence.mp3'); // no_usable_speech → not analyzed
    await upload(b, '20261020-escalated.mp3'); // another organization
    await drain();

    const report = await getIssueReport(a, RANGE);
    expect(report.analyzedCalls).toBe(5);
    expect(report.callsWithIssues).toBe(3);
    expect(Object.fromEntries(report.ranks.map((r) => [r.key, r.calls]))).toEqual({
      otp_not_received: 1,
      login_failed: 1,
      signing_failed: 1,
      certificate_issue: 1,
    });

    for (const rank of report.ranks) {
      const drill = await drillDownFilter(a, { issue: rank.categoryId, ...RANGE });
      const page = await listCalls(a, { where: drill!.where, limit: 100 });
      expect(page.items).toHaveLength(rank.calls);
    }

    // Another organization's category ID drills into nothing.
    const foreign = (await getIssueReport(b, RANGE)).ranks[0];
    const drill = await drillDownFilter(a, { issue: foreign.categoryId, ...RANGE });
    expect((await listCalls(a, { where: drill!.where })).items).toHaveLength(0);
  });

  it('applies inclusive date bounds on the call date', async () => {
    const a = await member();
    await upload(a, '20261019_093015_09121234567.mp3'); // filename date 2026-10-19
    await drain();
    expect((await getIssueReport(a, { from: '2026-10-19', to: '2026-10-19' })).analyzedCalls).toBe(
      1,
    );
    expect((await getIssueReport(a, { from: '2026-10-20', to: '2026-10-31' })).analyzedCalls).toBe(
      0,
    );
    expect((await getIssueReport(a, { from: '2026-10-01', to: '2026-10-18' })).analyzedCalls).toBe(
      0,
    );
  });

  it('shows ready calls with their issues and outcomes in the list, scoped to the member', async () => {
    const a = await member('10380284790');
    const b = await member('14006278561');
    const callId = await upload(a, '20261020-escalated.mp3');
    await drain();
    const summary = await getCallSummary(a, callId);
    expect(summary).toMatchObject({ state: 'READY', outcomes: ['UNRESOLVED'], reviewed: false });
    expect(summary!.issues).toEqual(['کد تأیید پیامکی نمی‌رسد']);
    expect(await getCallSummary(b, callId)).toBeNull();
  });
});
