import { z } from 'zod';
import { t } from '@/lib/t';
import { passwordCharsetIssue, passwordIssueMessage } from '@/lib/validations/password';
import {
  isValidOrganizationNationalId,
  normalizeOrganizationNationalId,
} from '@/lib/validators/organization';
import { normalizeMobile } from '@/lib/validators/iran';

/**
 * Sign-in input (tech spec §4.4). Identifiers accept Persian or Latin digits
 * and come out normalized: an 11-digit national ID string (leading zeros kept)
 * and a `09…` mobile. The password is only checked for its character set here,
 * so a Persian keyboard gets its specific message; everything else is a
 * generic credentials failure decided by the service.
 */
export const loginSchema = z.object({
  nationalId: z
    .string()
    .trim()
    .min(1, t('auth.errors.nationalIdRequired'))
    .refine(isValidOrganizationNationalId, t('auth.errors.nationalIdInvalid'))
    .transform((value) => normalizeOrganizationNationalId(value) as string),
  mobile: z
    .string()
    .trim()
    .min(1, t('auth.errors.mobileRequired'))
    .refine((value) => normalizeMobile(value) !== null, t('auth.errors.mobileInvalid'))
    .transform((value) => normalizeMobile(value) as string),
  password: z
    .string()
    .min(1, t('validation.passwordRequired'))
    .superRefine((value, ctx) => {
      const issue = passwordCharsetIssue(value);
      if (issue) ctx.addIssue({ code: 'custom', message: passwordIssueMessage(issue) });
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;
