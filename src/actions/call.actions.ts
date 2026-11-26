'use server';

import { revalidatePath } from 'next/cache';
import { fail, fromError, fromZodError, ok, type ActionResult } from '@/lib/action-result';
import { requireAuth } from '@/lib/auth';
import { t } from '@/lib/t';
import { callIdSchema } from '@/lib/validations/review';
import { requestRetry } from '@/services/call.service';

/** تلاش دوباره for a recoverable failure (tech spec §9 "Retry call"). */
export async function retryCallAction(input: unknown): Promise<ActionResult<{ created: boolean }>> {
  const member = await requireAuth();
  const parsed = callIdSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const result = await requestRetry(member, parsed.data.callId);
    revalidatePath(`/calls/${parsed.data.callId}`);
    revalidatePath('/calls');
    return ok({ created: result.created });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'RETRY_NOT_ALLOWED') {
      return fail(t('failure.retryNotAllowed'));
    }
    return fromError(error);
  }
}
