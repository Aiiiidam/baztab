import { z } from 'zod';

/**
 * Structured analysis output contract (tech spec §8), version 1. The analysis
 * model must return exactly this shape; anything else is rejected before
 * publishing. Evidence is a list of transcript segment references ("s0",
 * "s1", …) into the transcript the model was given — never a copied quote.
 */
export const ANALYSIS_SCHEMA_VERSION = '1';
export const RUBRIC_VERSION = 'rubric-v1';

const segmentRef = z.string().regex(/^s\d+$/);
const evidence = z.array(segmentRef).max(20).default([]);
const text = z.string().trim().min(1).max(600);

export const OUTCOMES = ['RESOLVED', 'UNRESOLVED', 'UNKNOWN'] as const;
export const RATINGS = ['MET', 'PARTLY_MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE'] as const;
export const CRITERIA = ['UNDERSTANDING', 'CORRECT_ACTION', 'CLEAR_CLOSURE'] as const;

const score = z
  .object({
    rating: z.enum(RATINGS),
    explanation: text.nullable().default(null),
    evidence,
  })
  .strict();

export const analysisOutputSchema = z
  .object({
    schemaVersion: z.literal(ANALYSIS_SCHEMA_VERSION),
    reason: z.object({ text, evidence }).strict(),
    issues: z
      .array(
        z
          .object({
            summary: text,
            /** A taxonomy key, or null when no category fits. */
            categoryKey: z.string().max(64).nullable(),
            outcome: z.enum(OUTCOMES),
            outcomeExplanation: text.nullable().default(null),
            evidence,
            outcomeEvidence: evidence,
          })
          .strict(),
      )
      .max(10),
    scores: z
      .object({ UNDERSTANDING: score, CORRECT_ACTION: score, CLEAR_CLOSURE: score })
      .strict(),
  })
  .strict();

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

/** Points per rating; insufficient evidence has none (pilot scale, product spec). */
export const RATING_POINTS = {
  MET: 2,
  PARTLY_MET: 1,
  NOT_MET: 0,
  INSUFFICIENT_EVIDENCE: null,
} as const;

/** Total out of six only when all three criteria were assessed; otherwise null (ناقص). */
export function scoreTotal(ratings: (keyof typeof RATING_POINTS)[]): number | null {
  if (ratings.length !== 3) return null;
  let total = 0;
  for (const rating of ratings) {
    const points = RATING_POINTS[rating];
    if (points === null) return null;
    total += points;
  }
  return total;
}
