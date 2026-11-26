import { z } from 'zod';
import { COMMON_PASSWORDS } from '@/lib/data/common-passwords';
import { t } from '@/lib/t';

/**
 * Password policy (tech spec §4.4, decision 008): 10–128 printable ASCII
 * characters, not equal to the organization national ID or the mobile, not on
 * the bundled common-password list. Persian letters and Persian digits get
 * their own message because the usual cause is a keyboard left on Persian.
 *
 * Pure and browser-safe: the change-password form runs the same checks live.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export type PasswordIssue =
  | 'tooShort'
  | 'tooLong'
  | 'persianLetters'
  | 'persianDigits'
  | 'nonAscii'
  | 'matchesIdentifier'
  | 'common';

const PERSIAN_DIGITS = /[۰-۹٠-٩]/;
// Arabic script block minus its digits, presentation forms, and ZWNJ (typed by the Persian layout).
const PERSIAN_LETTERS = /[؀-ٟ٪-ۯۺ-ۿﭐ-﷿ﹰ-﻿‌]/;
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

/**
 * What a Persian keyboard layout left in the text, for the live warning on
 * password fields. Letters win over digits when both are present.
 */
export function detectPersianKeyboard(text: string): 'letters' | 'digits' | null {
  if (PERSIAN_LETTERS.test(text)) return 'letters';
  if (PERSIAN_DIGITS.test(text)) return 'digits';
  return null;
}

/** Character-set issue only (used on the sign-in field, where length is not re-checked). */
export function passwordCharsetIssue(password: string): PasswordIssue | null {
  const keyboard = detectPersianKeyboard(password);
  if (keyboard === 'letters') return 'persianLetters';
  if (keyboard === 'digits') return 'persianDigits';
  if (!PRINTABLE_ASCII.test(password)) return 'nonAscii';
  return null;
}

export type PasswordContext = {
  /** Normalized 11-digit organization national ID. */
  nationalId?: string;
  /** Normalized `09…` mobile. */
  mobile?: string;
};

/** First policy violation for a new password, or null when it is acceptable. */
export function checkPasswordPolicy(
  password: string,
  context: PasswordContext = {},
): PasswordIssue | null {
  const charset = passwordCharsetIssue(password);
  if (charset) return charset;
  if (password.length < PASSWORD_MIN) return 'tooShort';
  if (password.length > PASSWORD_MAX) return 'tooLong';
  if (matchesIdentifier(password, context)) return 'matchesIdentifier';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'common';
  return null;
}

function matchesIdentifier(password: string, { nationalId, mobile }: PasswordContext): boolean {
  const candidates = new Set<string>();
  if (nationalId) candidates.add(nationalId);
  if (mobile) {
    candidates.add(mobile);
    candidates.add(mobile.replace(/^0/, '98'));
    candidates.add(mobile.replace(/^0/, '+98'));
    candidates.add(mobile.replace(/^0/, ''));
  }
  return candidates.has(password.trim());
}

export function passwordIssueMessage(issue: PasswordIssue): string {
  switch (issue) {
    case 'tooShort':
      return t('password.errors.tooShort', { min: PASSWORD_MIN });
    case 'tooLong':
      return t('password.errors.tooLong', { max: PASSWORD_MAX });
    case 'persianLetters':
      return t('password.errors.persianLetters');
    case 'persianDigits':
      return t('password.errors.persianDigits');
    case 'nonAscii':
      return t('password.errors.nonAscii');
    case 'matchesIdentifier':
      return t('password.errors.matchesIdentifier');
    case 'common':
      return t('password.errors.common');
  }
}

/** The change-password form. The identifier comparison runs in the service, which knows them. */
export const changePasswordSchema = z
  .object({
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    const issue = checkPasswordPolicy(value.newPassword);
    if (issue) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: passwordIssueMessage(issue) });
      return;
    }
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: t('password.errors.mismatch'),
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
