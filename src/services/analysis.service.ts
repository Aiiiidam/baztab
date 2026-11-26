import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Prisma, RevisionReason } from '@prisma/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ANALYSIS_SCHEMA_VERSION, RUBRIC_VERSION } from '@/lib/validations/analysis';
import {
  TransientInferenceError,
  type InferenceEngine,
  type JobContext,
  type TranscribedSegment,
} from '@/services/inference/types';
import {
  InvalidOutputError,
  validateAnalysis,
  validateTranscript,
  type ValidatedAnalysis,
} from '@/services/inference/validate';
import {
  completeJob,
  failJob,
  setStage,
  StaleLeaseError,
  type ClaimedJob,
} from '@/services/queue.service';
import { recordEgress } from '@/services/egress.service';
import { getStorage } from '@/services/storage.service';
import {
  ensureCategories,
  mapCategory,
  TAXONOMY_VERSION,
  type CategoryRef,
} from '@/services/taxonomy.service';

/**
 * Process one analysis job (tech spec §7, §8, plan M3-T6).
 *
 *   fetch audio once → transcribe (or reuse the checkpoint for the same model)
 *   → analyze → validate → publish revision + findings + scores + evidence +
 *     job completion in ONE transaction fenced by the lease token.
 *
 * Reports read either the previous active revision or the complete new one.
 * Logs carry job and call IDs and stable codes only — never call content.
 */

export type ProcessOutcome =
  | { status: 'published'; revisionId: string; candidate: boolean }
  | { status: 'requeued' | 'failed' | 'stale'; code: string };

class PermanentFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

const REASON_BY_TRIGGER: Record<ClaimedJob['trigger'], RevisionReason> = {
  INITIAL: 'INITIAL',
  RETRY: 'RETRY',
  REPROCESS: 'REPROCESS',
};

async function loadSource(job: ClaimedJob, now: Date) {
  const call = await prisma.call.findFirst({
    where: { id: job.callId, organizationId: job.organizationId },
    select: {
      id: true,
      organization: { select: { isActive: true } },
      recording: {
        select: { objectKey: true, bytes: true, durationMs: true, expiresAt: true, state: true },
      },
    },
  });
  if (!call || !call.organization.isActive) throw new PermanentFailure('inactive_access', false);
  const recording = call.recording;
  if (!recording) throw new PermanentFailure('recording_missing', false);
  if (recording.state !== 'STORED' || recording.expiresAt <= now) {
    throw new PermanentFailure('recording_expired', false);
  }
  return recording;
}

async function transcriptFor(
  job: ClaimedJob,
  engine: InferenceEngine,
  audioPath: string,
  durationMs: number,
  context: JobContext,
): Promise<{ transcriptId: string; segments: (TranscribedSegment & { id: string })[] }> {
  // Checkpoint: a retry reuses an unexpired transcript from the same model version.
  const existing = await prisma.transcript.findFirst({
    where: {
      callId: job.callId,
      organizationId: job.organizationId,
      modelVersion: engine.transcriber.modelVersion,
      expiredAt: null,
    },
    orderBy: { createdAt: 'desc' },
    include: { segments: { orderBy: { index: 'asc' } } },
  });
  if (existing && existing.segments.length > 0) {
    return { transcriptId: existing.id, segments: existing.segments };
  }

  const result = await engine.transcriber.transcribe(audioPath, context);
  if (!result.usableSpeech || result.segments.length === 0) {
    throw new PermanentFailure('no_usable_speech', false);
  }
  validateTranscript(result.segments, durationMs);

  const transcript = await prisma.transcript.create({
    data: {
      organizationId: job.organizationId,
      callId: job.callId,
      modelVersion: engine.transcriber.modelVersion,
      segments: {
        // organizationId comes from the parent through the composite relation.
        create: result.segments.map((segment, index) => ({
          index,
          startMs: segment.startMs,
          endMs: segment.endMs,
          speaker: segment.speaker,
          text: segment.text,
        })),
      },
    },
    include: { segments: { orderBy: { index: 'asc' } } },
  });
  return { transcriptId: transcript.id, segments: transcript.segments };
}

async function publish(
  job: ClaimedJob,
  engine: InferenceEngine,
  transcript: { transcriptId: string; segments: { id: string }[] },
  analysis: ValidatedAnalysis,
  categories: CategoryRef[],
  now: Date,
): Promise<{ revisionId: string; candidate: boolean }> {
  return prisma.$transaction(async (tx) => {
    // Fence first: a stale worker rolls back here and writes nothing.
    await completeJob(tx, job, now);

    // The recording or the organization may have changed while we worked.
    const call = await tx.call.findFirst({
      where: { id: job.callId, organizationId: job.organizationId },
      select: {
        activeRevisionId: true,
        organization: { select: { isActive: true } },
        recording: { select: { state: true, expiresAt: true } },
        activeRevision: {
          select: {
            callReasonHumanSet: true,
            findings: { select: { categoryHumanSet: true, outcomeHumanSet: true } },
            scores: { select: { humanSet: true } },
          },
        },
      },
    });
    if (!call?.organization.isActive) throw new PermanentFailure('inactive_access', false);
    if (!call.recording || call.recording.state !== 'STORED' || call.recording.expiresAt <= now) {
      throw new PermanentFailure('recording_expired', false);
    }

    const active = call.activeRevision;
    const hasHumanEdits = Boolean(
      active &&
      (active.callReasonHumanSet ||
        active.findings.some((f) => f.categoryHumanSet || f.outcomeHumanSet) ||
        active.scores.some((s) => s.humanSet)),
    );
    // Reprocessing never overrides human-set fields without the audited operator command.
    const candidate = job.trigger === 'REPROCESS' && hasHumanEdits;

    const last = await tx.analysisRevision.findFirst({
      where: { callId: job.callId, organizationId: job.organizationId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const segmentIds = transcript.segments.map((segment) => segment.id);

    const revision = await tx.analysisRevision.create({
      data: {
        organizationId: job.organizationId,
        callId: job.callId,
        version: (last?.version ?? 0) + 1,
        reason: REASON_BY_TRIGGER[job.trigger],
        status: candidate ? 'CANDIDATE' : 'PUBLISHED',
        parentRevisionId: call.activeRevisionId,
        transcriptId: transcript.transcriptId,
        outputSchemaVersion: ANALYSIS_SCHEMA_VERSION,
        transcriberModel: engine.transcriber.modelVersion,
        analyzerModel: engine.analyzer.modelVersion,
        promptVersion: engine.analyzer.promptVersion,
        rubricVersion: RUBRIC_VERSION,
        taxonomyVersion: TAXONOMY_VERSION,
        callReason: analysis.reason.text,
      },
    });

    const evidenceRows: Prisma.EvidenceCreateManyInput[] = analysis.reason.evidence.map(
      (index) => ({
        organizationId: job.organizationId,
        revisionId: revision.id,
        target: 'REASON',
        segmentId: segmentIds[index],
      }),
    );

    for (const finding of analysis.findings) {
      const category = mapCategory(categories, finding.categoryKey);
      const created = await tx.issueFinding.create({
        data: {
          organizationId: job.organizationId,
          revisionId: revision.id,
          callId: job.callId,
          position: finding.position,
          categoryId: category?.id ?? null,
          summary: finding.summary,
          outcome: finding.outcome,
          outcomeExplanation: finding.outcomeExplanation,
          // Stored now and never recomputed (tech spec §9).
          eligible: finding.eligible && category !== null,
          hasEvidence: finding.evidence.length > 0,
        },
      });
      for (const index of finding.evidence) {
        evidenceRows.push({
          organizationId: job.organizationId,
          revisionId: revision.id,
          target: 'ISSUE',
          findingId: created.id,
          segmentId: segmentIds[index],
        });
      }
      for (const index of finding.outcomeEvidence) {
        evidenceRows.push({
          organizationId: job.organizationId,
          revisionId: revision.id,
          target: 'OUTCOME',
          findingId: created.id,
          segmentId: segmentIds[index],
        });
      }
    }

    for (const score of analysis.scores) {
      const created = await tx.score.create({
        data: {
          organizationId: job.organizationId,
          revisionId: revision.id,
          criterion: score.criterion,
          rating: score.rating,
          explanation: score.explanation,
        },
      });
      for (const index of score.evidence) {
        evidenceRows.push({
          organizationId: job.organizationId,
          revisionId: revision.id,
          target: 'SCORE',
          scoreId: created.id,
          segmentId: segmentIds[index],
        });
      }
    }
    if (evidenceRows.length > 0) await tx.evidence.createMany({ data: evidenceRows });

    await tx.call.update({
      where: { id: job.callId },
      data: candidate
        ? { state: 'READY', rowVersion: { increment: 1 } }
        : {
            state: 'READY',
            activeRevisionId: revision.id,
            failureCode: null,
            failureRetryable: false,
            rowVersion: { increment: 1 },
          },
    });
    return { revisionId: revision.id, candidate };
  });
}

/** Run one claimed job to a terminal or requeued state. Never throws for expected failures. */
export async function processJob(
  job: ClaimedJob,
  engine: InferenceEngine,
  signal: AbortSignal,
): Promise<ProcessOutcome> {
  const context: JobContext = { attempt: job.attempt, signal };
  const log = logger.child({ jobId: job.id, callId: job.callId, attempt: job.attempt });
  const scratch = await mkdtemp(path.join(env.WORKER_SCRATCH_DIR ?? tmpdir(), 'baztab-job-'));

  try {
    const now = new Date();
    const recording = await loadSource(job, now);
    const audioPath = path.join(scratch, 'audio.mp3');
    // One fetch per job; the scratch copy serves every stage of this attempt.
    if (!(await getStorage().download(recording.objectKey, audioPath))) {
      throw new PermanentFailure('recording_missing', false);
    }
    await recordEgress(recording.bytes);

    await setStage(job, 'transcribing');
    const transcript = await transcriptFor(job, engine, audioPath, recording.durationMs, context);
    if (signal.aborted) throw new StaleLeaseError();

    await setStage(job, 'analyzing');
    const categories = await ensureCategories(job.organizationId);
    const raw = await engine.analyzer.analyze(
      {
        segments: transcript.segments.map((segment, index) => ({
          ref: `s${index}`,
          startMs: segment.startMs,
          endMs: segment.endMs,
          speaker: segment.speaker,
          text: segment.text,
        })),
        categories: categories.map(({ key, label }) => ({ key, label })),
        rubricVersion: RUBRIC_VERSION,
      },
      context,
    );
    const analysis = validateAnalysis(
      raw,
      transcript.segments,
      new Set(categories.map((c) => c.key)),
    );
    if (signal.aborted) throw new StaleLeaseError();

    const published = await publish(job, engine, transcript, analysis, categories, new Date());
    log.info(
      { revisionId: published.revisionId, candidate: published.candidate },
      'Analysis published',
    );
    return { status: 'published', ...published };
  } catch (error) {
    if (error instanceof StaleLeaseError) {
      log.warn('Lease lost; result discarded');
      return { status: 'stale', code: 'stale_lease' };
    }
    let failure: { code: string; kind: 'transient' | 'permanent'; retryable: boolean };
    if (error instanceof PermanentFailure) {
      failure = { code: error.code, kind: 'permanent', retryable: error.retryable };
    } else if (error instanceof InvalidOutputError) {
      // Invalid model output is retried within the attempt budget, then fails retryably.
      failure = { code: 'invalid_output', kind: 'transient', retryable: true };
      log.warn({ reason: error.reason }, 'Analysis output rejected');
    } else if (error instanceof TransientInferenceError) {
      failure = { code: 'transient_failure', kind: 'transient', retryable: true };
    } else {
      log.error({ err: error }, 'Analysis failed unexpectedly');
      failure = { code: 'transient_failure', kind: 'transient', retryable: true };
    }
    const result = await failJob(job, failure);
    log.info({ code: failure.code, result }, 'Analysis did not publish');
    return { status: result, code: failure.code };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
