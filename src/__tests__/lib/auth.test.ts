import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';

vi.mock('@/services/auth.service', () => ({
  resolveSession: vi.fn(),
}));

import { resolveSession } from '@/services/auth.service';
import {
  authenticateRoute,
  getSession,
  requireAuth,
  requireSessionForPasswordChange,
} from '@/lib/auth';
import type { AuthMember } from '@/types/auth';

const member: AuthMember = {
  sessionId: 's1',
  membershipId: 'm1',
  organizationId: 'org-a',
  organizationName: 'سازمان الف',
  mobile: '09120000001',
  mustChangePassword: false,
};
const mustChange: AuthMember = { ...member, mustChangePassword: true };
const cookieStore = { get: vi.fn() };

function request(method: string, origin?: string) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  return new Request('http://localhost:3000/api/calls/uploads', { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue(cookieStore as never);
});

describe('getSession', () => {
  it('returns null without a cookie and never hits the service', async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it('resolves the cookie token through the service', async () => {
    cookieStore.get.mockReturnValue({ value: 'tok' });
    vi.mocked(resolveSession).mockResolvedValue(member);
    expect(await getSession()).toEqual(member);
    expect(resolveSession).toHaveBeenCalledWith('tok');
  });
});

describe('requireAuth', () => {
  it('redirects anonymous requests to /login', async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(requireAuth()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('sends a member who still holds the initial password to the change step', async () => {
    cookieStore.get.mockReturnValue({ value: 'tok' });
    vi.mocked(resolveSession).mockResolvedValue(mustChange);
    await expect(requireAuth()).rejects.toThrow('NEXT_REDIRECT:/change-password');
  });

  it('returns the member with its organization scope', async () => {
    cookieStore.get.mockReturnValue({ value: 'tok' });
    vi.mocked(resolveSession).mockResolvedValue(member);
    expect(await requireAuth()).toEqual(member);
  });

  it('lets the change-password step through for a must-change session', async () => {
    cookieStore.get.mockReturnValue({ value: 'tok' });
    vi.mocked(resolveSession).mockResolvedValue(mustChange);
    expect(await requireSessionForPasswordChange()).toEqual(mustChange);
  });
});

describe('authenticateRoute', () => {
  it('answers 401 without a session', async () => {
    cookieStore.get.mockReturnValue(undefined);
    const result = await authenticateRoute(request('GET'));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect((result as Response).headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects an unsafe method from another origin before touching the session', async () => {
    const result = await authenticateRoute(request('POST', 'https://evil.example'));
    expect((result as Response).status).toBe(403);
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it('rejects an unsafe method without an Origin header', async () => {
    const result = await authenticateRoute(request('POST'));
    expect((result as Response).status).toBe(403);
  });

  it('blocks a must-change session from the API', async () => {
    cookieStore.get.mockReturnValue({ value: 'tok' });
    vi.mocked(resolveSession).mockResolvedValue(mustChange);
    expect(((await authenticateRoute(request('GET'))) as Response).status).toBe(403);
  });

  it('returns the member for a same-origin POST', async () => {
    cookieStore.get.mockReturnValue({ value: 'tok' });
    vi.mocked(resolveSession).mockResolvedValue(member);
    expect(await authenticateRoute(request('POST', 'http://localhost:3000'))).toEqual(member);
  });
});
