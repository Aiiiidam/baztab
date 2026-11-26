'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSessionForPasswordChange } from '@/lib/auth';
import { env } from '@/lib/env';
import { ServiceError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { clientAddress } from '@/lib/origin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';
import { t } from '@/lib/t';
import { loginSchema } from '@/lib/validations/auth';
import { changePasswordSchema } from '@/lib/validations/password';
import { changeInitialPassword, revokeSession, signIn } from '@/services/auth.service';

/** Landing page after sign-in (design scope: گزارش مشکلات). */
const HOME = '/reports/issues';

export type FormState = {
  /** Message for the alert near the submit button. */
  error?: string;
  /** Stable code so the UI can pick a state (expired initial password, throttled …). */
  code?: string;
  fieldErrors?: Record<string, string>;
  /** Identifiers echoed back so the form keeps them after React resets it. Never the password. */
  values?: Record<string, string>;
} | null;

function firstFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/** Bound to `useActionState` in the sign-in form (tech spec §4.4, §9). */
export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    nationalId: String(formData.get('nationalId') ?? ''),
    mobile: String(formData.get('mobile') ?? ''),
    password: String(formData.get('password') ?? ''),
  };
  const values = { nationalId: raw.nationalId, mobile: raw.mobile };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: firstFieldErrors(parsed.error.issues), values };
  }

  let result;
  try {
    const source = clientAddress(await headers(), env.TRUSTED_PROXY_COUNT);
    result = await signIn({ ...parsed.data, source });
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message, code: error.code, values };
    logger.error({ err: error }, 'Sign-in failed unexpectedly');
    return { error: t('auth.errors.accessFailure'), code: 'ACCESS_FAILURE', values };
  }

  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  redirect(result.mustChangePassword ? '/change-password' : HOME);
}

/** Replace the operator-issued initial password (tech spec §4.3). */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireSessionForPasswordChange();
  const parsed = changePasswordSchema.safeParse({
    newPassword: String(formData.get('newPassword') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: firstFieldErrors(parsed.error.issues) };

  try {
    await changeInitialPassword(member, parsed.data.newPassword);
  } catch (error) {
    if (error instanceof ServiceError) {
      return error.code === 'PASSWORD_REJECTED'
        ? { fieldErrors: { newPassword: error.message }, code: error.code }
        : { error: error.message, code: error.code };
    }
    logger.error({ err: error }, 'Password change failed unexpectedly');
    return { error: t('auth.errors.accessFailure'), code: 'ACCESS_FAILURE' };
  }
  redirect(HOME);
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}
