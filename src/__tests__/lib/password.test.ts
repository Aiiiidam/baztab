import { describe, expect, it } from 'vitest';
import { t } from '@/lib/t';
import { loginSchema } from '@/lib/validations/auth';
import {
  changePasswordSchema,
  checkPasswordPolicy,
  detectPersianKeyboard,
  passwordIssueMessage,
  type PasswordIssue,
} from '@/lib/validations/password';

const context = { nationalId: '10380284790', mobile: '09123456789' };

describe('checkPasswordPolicy', () => {
  it('accepts printable ASCII of 10–128 characters, including spaces and symbols', () => {
    expect(checkPasswordPolicy('Correct-Horse 42!', context)).toBeNull();
    expect(checkPasswordPolicy('a'.repeat(9) + 'Z', context)).toBeNull();
    expect(checkPasswordPolicy('x'.repeat(128), context)).toBeNull();
  });

  it.each<[string, string, PasswordIssue]>([
    ['too short', 'Short-1!', 'tooShort'],
    ['too long', 'x'.repeat(129), 'tooLong'],
    ['Persian letters', 'رمزعبورامن۱۲', 'persianLetters'],
    ['Persian letters mixed with Latin', 'Secret-passرمز', 'persianLetters'],
    ['Persian digits', 'Password-۱۲۳۴', 'persianDigits'],
    ['Arabic-Indic digits', 'Password-١٢٣٤', 'persianDigits'],
    ['other non-ASCII', 'Pässwörter-1234', 'nonAscii'],
    ['emoji', 'Password-12🙂', 'nonAscii'],
    ['ZWNJ from the Persian layout', 'Password‌1234', 'persianLetters'],
    ['the national ID', '10380284790', 'matchesIdentifier'],
    ['the mobile', '09123456789', 'matchesIdentifier'],
    ['the mobile in +98 form', '+989123456789', 'matchesIdentifier'],
    ['a common password', 'Password123', 'common'],
    ['a common keyboard walk', '1q2w3e4r5t', 'common'],
  ])('rejects %s', (_label, password, issue) => {
    expect(checkPasswordPolicy(password, context)).toBe(issue);
  });

  it('gives each rejection class its own message', () => {
    const issues: PasswordIssue[] = [
      'tooShort',
      'tooLong',
      'persianLetters',
      'persianDigits',
      'nonAscii',
      'matchesIdentifier',
      'common',
    ];
    const messages = new Set(issues.map(passwordIssueMessage));
    expect(messages.size).toBe(issues.length);
  });
});

describe('detectPersianKeyboard', () => {
  it('reports letters before digits and null for Latin input', () => {
    expect(detectPersianKeyboard('سلام۱۲')).toBe('letters');
    expect(detectPersianKeyboard('abc۱۲')).toBe('digits');
    expect(detectPersianKeyboard('abc-12!')).toBeNull();
    expect(detectPersianKeyboard('')).toBeNull();
  });
});

describe('changePasswordSchema', () => {
  it('accepts matching valid passwords', () => {
    const value = { newPassword: 'Orbit-Lamp-73', confirmPassword: 'Orbit-Lamp-73' };
    expect(changePasswordSchema.safeParse(value).success).toBe(true);
  });

  it('reports a mismatch on the confirmation field', () => {
    const result = changePasswordSchema.safeParse({
      newPassword: 'Orbit-Lamp-73',
      confirmPassword: 'Orbit-Lamp-74',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['confirmPassword'],
      message: t('password.errors.mismatch'),
    });
  });

  it('reports a Persian password on the new-password field', () => {
    const result = changePasswordSchema.safeParse({
      newPassword: 'رمزعبورجدید',
      confirmPassword: 'رمزعبورجدید',
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['newPassword'],
      message: t('password.errors.persianLetters'),
    });
  });
});

describe('loginSchema', () => {
  it('normalizes Persian digits in both identifiers', () => {
    const parsed = loginSchema.parse({
      nationalId: '۱۰۳۸۰۲۸۴۷۹۰',
      mobile: '۰۹۱۲ ۳۴۵ ۶۷۸۹',
      password: 'anything',
    });
    expect(parsed).toEqual({
      nationalId: '10380284790',
      mobile: '09123456789',
      password: 'anything',
    });
  });

  it('accepts +98 mobiles', () => {
    expect(
      loginSchema.parse({ nationalId: '10380284790', mobile: '+989123456789', password: 'x' })
        .mobile,
    ).toBe('09123456789');
  });

  it.each([
    [{ nationalId: '0013542419' }, t('auth.errors.nationalIdInvalid')],
    [{ nationalId: '' }, t('auth.errors.nationalIdRequired')],
    [{ mobile: '0212345678' }, t('auth.errors.mobileInvalid')],
    [{ password: 'رمز' }, t('password.errors.persianLetters')],
    [{ password: '' }, t('validation.passwordRequired')],
  ])('rejects %o', (override, message) => {
    const result = loginSchema.safeParse({
      nationalId: '10380284790',
      mobile: '09123456789',
      password: 'whatever-1',
      ...override,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});
