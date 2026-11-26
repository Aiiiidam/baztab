import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { ServiceError } from '@/lib/errors';
import { t } from '@/lib/t';

vi.mock('@/services/auth.service', () => ({
  signIn: vi.fn(),
  changeInitialPassword: vi.fn(),
  revokeSession: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireSessionForPasswordChange: vi.fn() }));

import { changeInitialPassword, revokeSession, signIn } from '@/services/auth.service';
import { requireSessionForPasswordChange } from '@/lib/auth';
import { changePasswordAction, logoutAction, signInAction } from '@/actions/auth.actions';

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const cookieStore = { get: vi.fn(), has: vi.fn(), set: vi.fn(), delete: vi.fn() };
const valid = { nationalId: '۱۰۳۸۰۲۸۴۷۹۰', mobile: '09120000001', password: 'Orbit-Lamp-73' };
const member = {
  sessionId: 's1',
  membershipId: 'm1',
  organizationId: 'org-a',
  organizationName: 'الف',
  mobile: '09120000001',
  mustChangePassword: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue(cookieStore as never);
});

describe('signInAction', () => {
  it('returns field errors and keeps the identifiers when the format is wrong', async () => {
    const result = await signInAction(
      null,
      formData({ nationalId: '0013542419', mobile: '123', password: '' }),
    );
    expect(result).toEqual({
      fieldErrors: {
        nationalId: t('auth.errors.nationalIdInvalid'),
        mobile: t('auth.errors.mobileInvalid'),
        password: t('validation.passwordRequired'),
      },
      values: { nationalId: '0013542419', mobile: '123' },
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('flags a Persian-keyboard password without calling the service', async () => {
    const result = await signInAction(null, formData({ ...valid, password: 'رمزعبور' }));
    expect(result?.fieldErrors?.password).toBe(t('password.errors.persianLetters'));
    expect(signIn).not.toHaveBeenCalled();
  });

  it('passes normalized identifiers and the client address to the service', async () => {
    vi.mocked(signIn).mockResolvedValue({
      token: 'tok',
      expiresAt: new Date('2026-12-03T00:00:00Z'),
      mustChangePassword: false,
    });
    await expect(signInAction(null, formData(valid))).rejects.toThrow(
      'NEXT_REDIRECT:/reports/issues',
    );
    expect(signIn).toHaveBeenCalledWith({
      nationalId: '10380284790',
      mobile: '09120000001',
      password: 'Orbit-Lamp-73',
      source: '203.0.113.7',
    });
    expect(cookieStore.set).toHaveBeenCalledWith(
      'session',
      'tok',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('sends a member with an initial password to the change step', async () => {
    vi.mocked(signIn).mockResolvedValue({
      token: 'tok',
      expiresAt: new Date(),
      mustChangePassword: true,
    });
    await expect(signInAction(null, formData(valid))).rejects.toThrow(
      'NEXT_REDIRECT:/change-password',
    );
  });

  it('surfaces service errors with their code and never echoes the password', async () => {
    vi.mocked(signIn).mockRejectedValue(
      new ServiceError(t('auth.errors.invalidCredentials'), 'INVALID_CREDENTIALS'),
    );
    const result = await signInAction(null, formData(valid));
    expect(result).toEqual({
      error: t('auth.errors.invalidCredentials'),
      code: 'INVALID_CREDENTIALS',
      values: { nationalId: valid.nationalId, mobile: valid.mobile },
    });
    expect(JSON.stringify(result)).not.toContain(valid.password);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('replaces unexpected errors with the access-failure message', async () => {
    vi.mocked(signIn).mockRejectedValue(new Error('db down'));
    const result = await signInAction(null, formData(valid));
    expect(result?.error).toBe(t('auth.errors.accessFailure'));
  });
});

describe('changePasswordAction', () => {
  beforeEach(() => {
    vi.mocked(requireSessionForPasswordChange).mockResolvedValue(member);
  });

  it('reports a mismatch without calling the service', async () => {
    const result = await changePasswordAction(
      null,
      formData({ newPassword: 'Orbit-Lamp-73', confirmPassword: 'Orbit-Lamp-74' }),
    );
    expect(result?.fieldErrors?.confirmPassword).toBe(t('password.errors.mismatch'));
    expect(changeInitialPassword).not.toHaveBeenCalled();
  });

  it('shows a rejected password next to the new-password field', async () => {
    vi.mocked(changeInitialPassword).mockRejectedValueOnce(
      new ServiceError(t('password.errors.matchesIdentifier'), 'PASSWORD_REJECTED'),
    );
    const result = await changePasswordAction(
      null,
      formData({ newPassword: '09120000001x', confirmPassword: '09120000001x' }),
    );
    expect(result).toEqual({
      fieldErrors: { newPassword: t('password.errors.matchesIdentifier') },
      code: 'PASSWORD_REJECTED',
    });
  });

  it('changes the password for the session member and lands on the report', async () => {
    await expect(
      changePasswordAction(
        null,
        formData({ newPassword: 'Orbit-Lamp-73', confirmPassword: 'Orbit-Lamp-73' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/reports/issues');
    expect(changeInitialPassword).toHaveBeenCalledWith(member, 'Orbit-Lamp-73');
  });
});

describe('logoutAction', () => {
  it('revokes the session, clears the cookie and goes to /login', async () => {
    cookieStore.get.mockReturnValue({ value: 'tok' });
    await expect(logoutAction()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(revokeSession).toHaveBeenCalledWith('tok');
    expect(cookieStore.delete).toHaveBeenCalledWith('session');
  });
});
