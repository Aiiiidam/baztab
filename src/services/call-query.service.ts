import type { AccessAction, CallState, IssueOutcome, Prisma } from '@prisma/client';
import { expectedReadyAt } from '@/lib/call-date';
import { callRef, refSearchSuffix } from '@/lib/call-ref';
import { env } from '@/lib/env';
import { normalizePersianChars } from '@/lib/persian';
import { prisma } from '@/lib/prisma';
import type { AuthMember } from '@/types/auth';
import type {
  AnalysisView,
  CallDetail,
  CallListRow,
  RecordingAvailability,
  SegmentRef,
} from '@/types/calls';
import { CRITERIA, scoreTotal } from '@/lib/validations/analysis';

const CRITERIA_ORDER = CRITERIA;
import type { ByteRange, ObjectRead } from '@/services/storage.service';
import { getStorage } from '@/services/storage.service';

/**
 * Reads of the call record for pages and the thin API handlers (tech spec §9).
 * Every query carries the member's organization; a foreign call ID behaves
 * exactly like a missing one.
 */

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const PENDING_STATES: CallState[] = ['UPLOADING', 'QUEUED', 'PROCESSING'];

export type { CallDetail, CallListRow, RecordingAvailability } from '@/types/calls';
export type CallSummary = CallListRow;

const SUMMARY_SELECT = {
  id: true,
  originalFilename: true,
  acceptedAt: true,
  effectiveDate: true,
  dateSource: true,
  state: true,
  failureCode: true,
  failureRetryable: true,
  rowVersion: true,
  recording: { select: { state: true, durationMs: true, expiresAt: true } },
  jobs: {
    where: { state: { in: ['QUEUED', 'RUNNING'] } },
    select: { stage: true },
    take: 1,
  },
  activeRevision: {
    select: {
      id: true,
      reason: true,
      reviewedAt: true,
      findings: {
        orderBy: { position: 'asc' },
        select: { outcome: true, summary: true, category: { select: { label: true } } },
      },
    },
  },
} satisfies Prisma.CallSelect;

type SummaryRow = Prisma.CallGetPayload<{ select: typeof SUMMARY_SELECT }>;

export function recordingAvailability(
  recording: { state: string; durationMs: number; expiresAt: Date } | null,
  now: Date,
): RecordingAvailability | null {
  if (!recording) return null;
  const expired =
    recording.expiresAt <= now || recording.state === 'EXPIRED' || recording.state === 'DELETED';
  return {
    available: recording.state === 'STORED' && !expired,
    durationMs: recording.durationMs,
    expiresAt: recording.expiresAt.toISOString(),
    expired,
  };
}

function revisionSummary(revision: SummaryRow['activeRevision']) {
  const findings = revision?.findings ?? [];
  const issues = [
    ...new Set(
      findings
        .map((finding) => finding.category?.label ?? finding.summary)
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  const outcomes = [...new Set(findings.map((finding) => finding.outcome))] as IssueOutcome[];
  return {
    issues,
    outcomes,
    reviewed: Boolean(revision && (revision.reviewedAt || revision.reason === 'CORRECTION')),
    activeRevisionId: revision?.id ?? null,
  };
}

function toSummary(row: SummaryRow, now: Date): CallSummary {
  return {
    id: row.id,
    ref: callRef(row.id),
    originalFilename: row.originalFilename,
    acceptedAt: row.acceptedAt.toISOString(),
    effectiveDate: isoDate(row.effectiveDate),
    dateSource: row.dateSource,
    state: row.state,
    failureCode: row.failureCode,
    failureRetryable: row.failureRetryable,
    readyAt: PENDING_STATES.includes(row.state)
      ? expectedReadyAt(row.acceptedAt, env.REPORT_TIME_ZONE).toISOString()
      : null,
    stage: row.jobs[0]?.stage ?? null,
    recording: recordingAvailability(row.recording, now),
    rowVersion: row.rowVersion,
    ...revisionSummary(row.activeRevision),
  };
}

/** One call of the member's organization, or null for a missing or foreign ID. */
export async function getCallSummary(
  member: Pick<AuthMember, 'organizationId'>,
  callId: string,
  now = new Date(),
): Promise<CallSummary | null> {
  const row = await prisma.call.findFirst({
    where: { id: callId, organizationId: member.organizationId, state: { not: 'UPLOADING' } },
    select: SUMMARY_SELECT,
  });
  return row ? toSummary(row, now) : null;
}

// ─── List ────────────────────────────────────────────────────────────────

export type CallListQuery = {
  cursor?: string | null;
  limit?: number;
  search?: string | null;
  state?: CallState | null;
  /** Extra predicate from the report drill-down (see report.service). */
  where?: Prisma.CallWhereInput;
};

export type CallListPage = { items: CallSummary[]; nextCursor: string | null };

export function encodeCursor(row: { effectiveDate: string; id: string }): string {
  return Buffer.from(`${row.effectiveDate}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { effectiveDate: Date; id: string } | null {
  const [date, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!date || !id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z0-9]+$/.test(id)) return null;
  return { effectiveDate: new Date(`${date}T00:00:00Z`), id };
}

export function searchWhere(search: string): Prisma.CallWhereInput {
  const term = normalizePersianChars(search).trim();
  const or: Prisma.CallWhereInput[] = [
    { originalFilename: { contains: term, mode: 'insensitive' } },
  ];
  const suffix = refSearchSuffix(term);
  if (suffix) or.push({ id: { endsWith: suffix } });
  return { OR: or };
}

/** Stable order: newest call date first, then call ID (tech spec §9). */
export async function listCalls(
  member: Pick<AuthMember, 'organizationId'>,
  query: CallListQuery = {},
  now = new Date(),
): Promise<CallListPage> {
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const and: Prisma.CallWhereInput[] = [
    { organizationId: member.organizationId, state: { not: 'UPLOADING' } },
  ];
  if (query.state) and.push({ state: query.state });
  if (query.search?.trim()) and.push(searchWhere(query.search));
  if (query.where) and.push(query.where);
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    and.push({
      OR: [
        { effectiveDate: { lt: cursor.effectiveDate } },
        { effectiveDate: cursor.effectiveDate, id: { lt: cursor.id } },
      ],
    });
  }

  const rows = await prisma.call.findMany({
    where: { AND: and },
    orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: SUMMARY_SELECT,
  });
  const items = rows.slice(0, limit).map((row) => toSummary(row, now));
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

// ─── Audio and access log ────────────────────────────────────────────────

export type AudioResult =
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | {
      status: 'ok';
      totalBytes: number;
      contentType: string;
      open: (range?: ByteRange) => Promise<ObjectRead | null>;
    };

/** Authorize playback for this request: the member's organization and the expiry are checked every time. */
export async function getAudio(
  member: Pick<AuthMember, 'organizationId'>,
  callId: string,
  now = new Date(),
): Promise<AudioResult> {
  const recording = await prisma.recording.findFirst({
    where: { callId, organizationId: member.organizationId, call: { state: { not: 'UPLOADING' } } },
    select: { objectKey: true, bytes: true, contentType: true, state: true, expiresAt: true },
  });
  if (!recording) return { status: 'not_found' };
  if (recording.state !== 'STORED' || recording.expiresAt <= now) return { status: 'unavailable' };
  return {
    status: 'ok',
    totalBytes: recording.bytes,
    contentType: recording.contentType,
    open: (range) => getStorage().read(recording.objectKey, range),
  };
}

/** One access-log row (tech spec §4): playback sessions and transcript views. */
export async function recordAccess(
  member: Pick<AuthMember, 'organizationId' | 'membershipId'>,
  callId: string,
  action: AccessAction,
): Promise<void> {
  await prisma.accessLog.create({
    data: {
      organizationId: member.organizationId,
      membershipId: member.membershipId,
      callId,
      action,
    },
  });
}

// ─── Detail (جزئیات تماس) ────────────────────────────────────────────────

/**
 * Everything the call detail page shows. After expiry (by time, even before
 * the deletion pass runs) explanations, evidence, the reason text and the
 * transcript are withheld; categories, outcomes and ratings stay.
 */
export async function getCallDetail(
  member: Pick<AuthMember, 'organizationId'>,
  callId: string,
  now = new Date(),
): Promise<CallDetail | null> {
  const summary = await getCallSummary(member, callId, now);
  if (!summary) return null;
  const { organizationId } = member;
  const retained = Boolean(summary.recording && !summary.recording.expired);

  const [organization, revision, categories, audits] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { retentionDays: true },
    }),
    summary.activeRevisionId
      ? prisma.analysisRevision.findFirst({
          where: { id: summary.activeRevisionId, organizationId },
          include: {
            findings: {
              orderBy: { position: 'asc' },
              include: {
                category: { select: { id: true, label: true } },
                evidence: { include: { segment: { select: { id: true, startMs: true } } } },
              },
            },
            scores: {
              include: {
                evidence: { include: { segment: { select: { id: true, startMs: true } } } },
              },
            },
            evidence: {
              where: { target: 'REASON' },
              include: { segment: { select: { id: true, startMs: true } } },
            },
            transcript: { include: { segments: { orderBy: { index: 'asc' } } } },
          },
        })
      : null,
    prisma.issueCategory.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, label: true },
    }),
    prisma.correctionAudit.findMany({
      where: { organizationId, callId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const actorIds = [
    ...new Set([
      ...audits.map((audit) => audit.actorMembershipId),
      ...(revision?.reviewedByMembershipId ? [revision.reviewedByMembershipId] : []),
    ]),
  ];
  const actors = new Map(
    (
      await prisma.membership.findMany({
        where: { organizationId, id: { in: actorIds } },
        select: { id: true, mobile: true },
      })
    ).map((m) => [m.id, m.mobile]),
  );

  const refs = (rows: { segment: { id: string; startMs: number } }[]): SegmentRef[] =>
    retained
      ? rows
          .map((row) => ({ segmentId: row.segment.id, startMs: row.segment.startMs }))
          .sort((a, b) => a.startMs - b.startMs)
      : [];
  const keep = <T>(value: T): T | null => (retained ? value : null);

  const analysis: AnalysisView | null = revision
    ? {
        revisionId: revision.id,
        version: revision.version,
        reason: { text: keep(revision.callReason), evidence: refs(revision.evidence) },
        findings: revision.findings.map((finding) => ({
          id: finding.id,
          position: finding.position,
          category: finding.category,
          summary: keep(finding.summary),
          outcome: finding.outcome,
          outcomeExplanation: keep(finding.outcomeExplanation),
          eligible: finding.eligible,
          categoryHumanSet: finding.categoryHumanSet,
          outcomeHumanSet: finding.outcomeHumanSet,
          evidence: refs(finding.evidence.filter((e) => e.target === 'ISSUE')),
          outcomeEvidence: refs(finding.evidence.filter((e) => e.target === 'OUTCOME')),
        })),
        scores: CRITERIA_ORDER.map((criterion) =>
          revision.scores.find((s) => s.criterion === criterion),
        )
          .filter((score): score is NonNullable<typeof score> => Boolean(score))
          .map((score) => ({
            criterion: score.criterion,
            rating: score.rating,
            explanation: keep(score.explanation),
            humanSet: score.humanSet,
            evidence: refs(score.evidence),
          })),
        total: scoreTotal(revision.scores.map((score) => score.rating)),
        reviewedAt: revision.reviewedAt?.toISOString() ?? null,
        reviewedBy: revision.reviewedByMembershipId
          ? (actors.get(revision.reviewedByMembershipId) ?? null)
          : null,
      }
    : null;

  const segments = retained ? (revision?.transcript?.segments ?? []) : [];
  return {
    ...summary,
    retentionDays: organization.retentionDays,
    analysis,
    transcript:
      retained && revision?.transcript
        ? segments.map(({ id, index, startMs, endMs, speaker, text }) => ({
            id,
            index,
            startMs,
            endMs,
            speaker,
            text,
          }))
        : null,
    categories,
    history: audits.map((audit) => ({
      id: audit.id,
      field: audit.field,
      previousValue: audit.previousValue,
      newValue: audit.newValue,
      actor: actors.get(audit.actorMembershipId) ?? '',
      createdAt: audit.createdAt.toISOString(),
    })),
  };
}
