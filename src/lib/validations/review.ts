import { z } from 'zod';
import { t } from '@/lib/t';

/** Inputs of the optional review actions (P1-06). Shared by server and client. */
const id = z.string().regex(/^[a-z0-9]{10,40}$/, t('validation.invalid'));

export const callIdSchema = z.object({ callId: id });

export const confirmReviewSchema = z.object({ callId: id, revisionId: id });

export const correctionSchema = z.object({
  callId: id,
  revisionId: id,
  findings: z
    .array(
      z.object({
        findingId: id,
        categoryId: id.nullable(),
        outcome: z.enum(['RESOLVED', 'UNRESOLVED', 'UNKNOWN']),
      }),
    )
    .max(10),
  scores: z
    .array(
      z.object({
        criterion: z.enum(['UNDERSTANDING', 'CORRECT_ACTION', 'CLEAR_CLOSURE']),
        rating: z.enum(['MET', 'PARTLY_MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE']),
      }),
    )
    .max(3),
});

export type CorrectionInput = z.infer<typeof correctionSchema>;
