import type { IssueOutcome, Prisma, ScoreCriterion, ScoreRating } from '@prisma/client';
import { ServiceError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { t } from '@/lib/t';
import type { AuthMember } from '@/types/auth';

/**
 * Optional review (P1-06, tech spec §5, §9, plan M5-T3).
 *
 * - Confirming marks the active revision reviewed; it changes no finding.
 * - A correction never edits a published revision: it creates a child revision
 *   (reason CORRECTION) that copies everything, applies the edits, flags them
 *   human-set and becomes active — all in one transaction with an audit row per
 *   changed field (structured values only).
 * - Optimistic concurrency: the caller names the active revision it saw. The
 *   first statement is a guarded UPDATE on the call row, which also serializes
 *   concurrent editors; a stale revision is a conflict, never a silent overwrite.
 * - Works after expiry: eligibility uses the finding's stored `hasEvidence`.
 * - The report reflects the new active revision as soon as this commits.
 */

export type FindingEdit = { findingId: string; categoryId: string | null; outcome: IssueOutcome };
export type ScoreEdit = { criterion: ScoreCriterion; rating: ScoreRating };

function stale(): ServiceError {
  return new ServiceError(t('review.stale'), 'STALE_REVISION');
}

/** Lock the call row and confirm the caller saw the current active revision. */
async function claimActiveRevision(
  tx: Prisma.TransactionClient,
  member: Pick<AuthMember, 'organizationId'>,
  callId: string,
  revisionId: string,
) {
  const { count } = await tx.call.updateMany({
    where: {
      id: callId,
      organizationId: member.organizationId,
      state: 'READY',
      activeRevisionId: revisionId,
    },
    data: { rowVersion: { increment: 1 } },
  });
  if (count !== 1) {
    const exists = await tx.call.count({
      where: { id: callId, organizationId: member.organizationId },
    });
    if (!exists) throw new ServiceError(t('errors.notFound'), 'NOT_FOUND');
    throw stale();
  }
}

export async function confirmReview(
  member: Pick<AuthMember, 'organizationId' | 'membershipId'>,
  input: { callId: string; revisionId: string },
  now = new Date(),
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await claimActiveRevision(tx, member, input.callId, input.revisionId);
    await tx.analysisRevision.update({
      where: { id: input.revisionId },
      data: { reviewedAt: now, reviewedByMembershipId: member.membershipId },
    });
    await tx.correctionAudit.create({
      data: {
        organizationId: member.organizationId,
        callId: input.callId,
        sourceRevisionId: input.revisionId,
        resultRevisionId: input.revisionId,
        actorMembershipId: member.membershipId,
        field: 'review.confirmed',
        previousValue: null,
        newValue: 'confirmed',
        createdAt: now,
      },
    });
  });
}

export async function saveCorrections(
  member: Pick<AuthMember, 'organizationId' | 'membershipId'>,
  input: { callId: string; revisionId: string; findings: FindingEdit[]; scores: ScoreEdit[] },
  now = new Date(),
): Promise<{ revisionId: string }> {
  const { organizationId } = member;
  return prisma.$transaction(async (tx) => {
    await claimActiveRevision(tx, member, input.callId, input.revisionId);

    const source = await tx.analysisRevision.findFirstOrThrow({
      where: { id: input.revisionId, organizationId },
      include: {
        findings: {
          orderBy: { position: 'asc' },
          include: { evidence: true, category: { select: { key: true } } },
        },
        scores: { include: { evidence: true } },
        evidence: { where: { target: 'REASON' } },
      },
    });

    const categoryIds = input.findings
      .map((edit) => edit.categoryId)
      .filter((id): id is string => Boolean(id));
    const categories = await tx.issueCategory.findMany({
      where: { organizationId, id: { in: categoryIds } },
      select: { id: true, key: true },
    });
    const keyOf = new Map(categories.map((category) => [category.id, category.key]));
    if (keyOf.size !== new Set(categoryIds).size) {
      throw new ServiceError(t('validation.invalid'), 'INVALID_CATEGORY');
    }

    type Audit = { field: string; previousValue: string | null; newValue: string | null };
    const audits: Audit[] = [];
    const findingEdits = new Map(input.findings.map((edit) => [edit.findingId, edit]));
    for (const id of findingEdits.keys()) {
      if (!source.findings.some((finding) => finding.id === id)) {
        throw new ServiceError(t('validation.invalid'), 'INVALID_FINDING');
      }
    }
    const scoreEdits = new Map(input.scores.map((edit) => [edit.criterion, edit]));

    const plannedFindings = source.findings.map((finding) => {
      const edit = findingEdits.get(finding.id);
      const categoryId = edit ? edit.categoryId : finding.categoryId;
      const outcome = edit ? edit.outcome : finding.outcome;
      const categoryChanged = categoryId !== finding.categoryId;
      const outcomeChanged = outcome !== finding.outcome;
      if (categoryChanged) {
        audits.push({
          field: `finding[${finding.position}].category`,
          previousValue: finding.category?.key ?? null,
          newValue: categoryId ? (keyOf.get(categoryId) ?? null) : null,
        });
      }
      if (outcomeChanged) {
        audits.push({
          field: `finding[${finding.position}].outcome`,
          previousValue: finding.outcome,
          newValue: outcome,
        });
      }
      return { finding, categoryId, outcome, categoryChanged, outcomeChanged };
    });

    const plannedScores = source.scores.map((score) => {
      const edit = scoreEdits.get(score.criterion);
      const rating = edit ? edit.rating : score.rating;
      const changed = rating !== score.rating;
      if (changed)
        audits.push({
          field: `score.${score.criterion}`,
          previousValue: score.rating,
          newValue: rating,
        });
      return { score, rating, changed };
    });

    if (audits.length === 0) throw new ServiceError(t('review.noChanges'), 'NO_CHANGES');

    const last = await tx.analysisRevision.findFirstOrThrow({
      where: { callId: input.callId, organizationId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const revision = await tx.analysisRevision.create({
      data: {
        organizationId,
        callId: input.callId,
        version: last.version + 1,
        reason: 'CORRECTION',
        status: 'PUBLISHED',
        parentRevisionId: source.id,
        transcriptId: source.transcriptId,
        outputSchemaVersion: source.outputSchemaVersion,
        transcriberModel: source.transcriberModel,
        analyzerModel: source.analyzerModel,
        promptVersion: source.promptVersion,
        rubricVersion: source.rubricVersion,
        taxonomyVersion: source.taxonomyVersion,
        callReason: source.callReason,
        callReasonHumanSet: source.callReasonHumanSet,
        createdByMembershipId: member.membershipId,
      },
    });

    const evidence: Prisma.EvidenceCreateManyInput[] = source.evidence.map((row) => ({
      organizationId,
      revisionId: revision.id,
      target: row.target,
      segmentId: row.segmentId,
    }));

    for (const plan of plannedFindings) {
      const { finding } = plan;
      const created = await tx.issueFinding.create({
        data: {
          organizationId,
          revisionId: revision.id,
          callId: input.callId,
          position: finding.position,
          categoryId: plan.categoryId,
          summary: finding.summary,
          outcome: plan.outcome,
          outcomeExplanation: plan.outcomeChanged ? null : finding.outcomeExplanation,
          eligible: plan.categoryChanged
            ? finding.hasEvidence && plan.categoryId !== null
            : finding.eligible,
          hasEvidence: finding.hasEvidence,
          categoryHumanSet: finding.categoryHumanSet || plan.categoryChanged,
          outcomeHumanSet: finding.outcomeHumanSet || plan.outcomeChanged,
        },
      });
      for (const row of finding.evidence) {
        evidence.push({
          organizationId,
          revisionId: revision.id,
          target: row.target,
          findingId: created.id,
          segmentId: row.segmentId,
        });
      }
    }

    for (const plan of plannedScores) {
      const created = await tx.score.create({
        data: {
          organizationId,
          revisionId: revision.id,
          criterion: plan.score.criterion,
          rating: plan.rating,
          // A human-set rating no longer matches the model's explanation and evidence.
          explanation: plan.changed ? null : plan.score.explanation,
          humanSet: plan.score.humanSet || plan.changed,
        },
      });
      if (!plan.changed) {
        for (const row of plan.score.evidence) {
          evidence.push({
            organizationId,
            revisionId: revision.id,
            target: 'SCORE',
            scoreId: created.id,
            segmentId: row.segmentId,
          });
        }
      }
    }
    if (evidence.length > 0) await tx.evidence.createMany({ data: evidence });

    await tx.call.update({ where: { id: input.callId }, data: { activeRevisionId: revision.id } });
    await tx.correctionAudit.createMany({
      data: audits.map((audit) => ({
        organizationId,
        callId: input.callId,
        sourceRevisionId: source.id,
        resultRevisionId: revision.id,
        actorMembershipId: member.membershipId,
        createdAt: now,
        ...audit,
      })),
    });
    return { revisionId: revision.id };
  });
}
