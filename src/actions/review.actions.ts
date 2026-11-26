'use server';

import { revalidatePath } from 'next/cache';
import { fromError, fromZodError, ok, type ActionResult } from '@/lib/action-result';
import { requireAuth } from '@/lib/auth';
import { ServiceError } from '@/lib/errors';
import { confirmReviewSchema, correctionSchema } from '@/lib/validations/review';
import { confirmReview, saveCorrections } from '@/services/review.service';

/** Result for the UI: `stale` asks the member to reload instead of retrying blindly. */
export type ReviewResult = ActionResult<{ stale?: boolean }>;

function refresh(callId: string) {
  revalidatePath(`/calls/${callId}`);
  revalidatePath('/calls');
  revalidatePath('/reports/issues');
}

function staleOrError(error: unknown): ReviewResult {
  if (error instanceof ServiceError && error.code === 'STALE_REVISION') {
    return { ok: false, error: error.message, fieldErrors: { _stale: ['1'] } };
  }
  return fromError(error);
}

/** تأیید بازبینی (P1-06). */
export async function confirmReviewAction(input: unknown): Promise<ReviewResult> {
  const member = await requireAuth();
  const parsed = confirmReviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await confirmReview(member, parsed.data);
    refresh(parsed.data.callId);
    return ok({});
  } catch (error) {
    return staleOrError(error);
  }
}

/** ویرایش یافته‌ها و امتیازها (P1-06): saves a child revision and updates the report. */
export async function saveCorrectionsAction(input: unknown): Promise<ReviewResult> {
  const member = await requireAuth();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await saveCorrections(member, parsed.data);
    refresh(parsed.data.callId);
    return ok({});
  } catch (error) {
    return staleOrError(error);
  }
}
