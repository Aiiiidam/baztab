import type { IssueOutcome, ScoreCriterion, ScoreRating, Speaker } from '@prisma/client';
import { analysisOutputSchema, CRITERIA } from '@/lib/validations/analysis';
import type { TranscribedSegment } from './types';

/**
 * Validate a model's structured output against the transcript it was given
 * (tech spec §8) before anything is published:
 *
 * - schema and enum values (strict: unknown fields are rejected);
 * - every evidence reference must name a segment of this transcript — an
 *   invented reference rejects the whole output (never publish made-up evidence);
 * - transcript timing must be ordered and within the recording;
 * - a score criterion (all three judge the agent) that cites no AGENT segment is
 *   rated insufficient evidence;
 * - an unknown category key becomes "uncategorized": kept, but not eligible.
 */

export class InvalidOutputError extends Error {
  constructor(readonly reason: string) {
    super(`invalid analysis output: ${reason}`);
    this.name = 'InvalidOutputError';
  }
}

export type ValidatedFinding = {
  position: number;
  summary: string;
  categoryKey: string | null;
  outcome: IssueOutcome;
  outcomeExplanation: string | null;
  /** Segment indexes, deduplicated. */
  evidence: number[];
  outcomeEvidence: number[];
  /** ≥ 1 validated evidence segment and a mapped category (tech spec §9). */
  eligible: boolean;
};

export type ValidatedScore = {
  criterion: ScoreCriterion;
  rating: ScoreRating;
  explanation: string | null;
  evidence: number[];
};

export type ValidatedAnalysis = {
  reason: { text: string; evidence: number[] };
  findings: ValidatedFinding[];
  scores: ValidatedScore[];
};

/** Check the transcript itself: positive, ordered segments inside the recording. */
export function validateTranscript(segments: TranscribedSegment[], durationMs: number): void {
  let previousStart = -1;
  for (const [index, segment] of segments.entries()) {
    if (!segment.text.trim()) throw new InvalidOutputError(`segment ${index} is empty`);
    if (segment.startMs < 0 || segment.endMs <= segment.startMs) {
      throw new InvalidOutputError(`segment ${index} has invalid timing`);
    }
    // Allow a little decoder slack past the probed duration.
    if (segment.endMs > durationMs + 1_000) {
      throw new InvalidOutputError(`segment ${index} ends after the recording`);
    }
    if (segment.startMs < previousStart)
      throw new InvalidOutputError(`segment ${index} is out of order`);
    previousStart = segment.startMs;
  }
}

export function validateAnalysis(
  raw: unknown,
  segments: { speaker: Speaker }[],
  categoryKeys: ReadonlySet<string>,
): ValidatedAnalysis {
  const parsed = analysisOutputSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidOutputError(parsed.error.issues[0]?.message ?? 'schema');
  const output = parsed.data;

  const resolve = (refs: string[]): number[] => {
    const indexes = new Set<number>();
    for (const ref of refs) {
      const index = Number(ref.slice(1));
      if (!Number.isInteger(index) || index < 0 || index >= segments.length) {
        throw new InvalidOutputError(`evidence ${ref} is not a segment of this transcript`);
      }
      indexes.add(index);
    }
    return [...indexes].sort((a, b) => a - b);
  };

  const findings = output.issues.map((issue, position): ValidatedFinding => {
    const evidence = resolve(issue.evidence);
    const outcomeEvidence = resolve(issue.outcomeEvidence);
    const categoryKey =
      issue.categoryKey && categoryKeys.has(issue.categoryKey) ? issue.categoryKey : null;
    return {
      position,
      summary: issue.summary,
      categoryKey,
      outcome: issue.outcome,
      outcomeExplanation: issue.outcomeExplanation,
      evidence,
      outcomeEvidence,
      eligible: evidence.length > 0 && categoryKey !== null,
    };
  });

  const scores = CRITERIA.map((criterion): ValidatedScore => {
    const score = output.scores[criterion];
    const evidence = resolve(score.evidence);
    const agentCited = evidence.some((index) => segments[index].speaker === 'AGENT');
    if (score.rating !== 'INSUFFICIENT_EVIDENCE' && !agentCited) {
      return { criterion, rating: 'INSUFFICIENT_EVIDENCE', explanation: null, evidence: [] };
    }
    return { criterion, rating: score.rating, explanation: score.explanation, evidence };
  });

  return {
    reason: { text: output.reason.text, evidence: resolve(output.reason.evidence) },
    findings,
    scores,
  };
}
