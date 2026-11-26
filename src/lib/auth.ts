import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { isAllowedOrigin } from '@/lib/origin';
import { SESSION_COOKIE } from '@/lib/session-cookie';
import { resolveSession } from '@/services/auth.service';
import type { AuthMember } from '@/types/auth';

/**
 * Next.js-side session helpers for layouts, pages, actions and route handlers.
 * Business logic (password checks, token hashing, session rows) lives in
 * `services/auth.service.ts`; this file only knows about cookies, redirects
 * and HTTP responses. Phase 1 has no roles (decision 009): every member can do
 * every task, and the organization in the returned member scopes all data.
 */

/** Stand-in member for SKIP_AUTH=true (UI work without a database; refused in production). */
const MOCK_MEMBER: AuthMember = {
  sessionId: 'mock-session',
  membershipId: 'mock-membership',
  organizationId: 'mock-organization',
  organizationName: 'سازمان نمونه',
  mobile: '09120000000',
  mustChangePassword: false,
};

/** Current member for this request, or null. Deduplicated per request via React cache(). */
export const getSession = cache(async (): Promise<AuthMember | null> => {
  if (env.SKIP_AUTH) return MOCK_MEMBER;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return resolveSession(token);
});

/**
 * For layouts, pages and actions that need a signed-in member. Redirects to
 * /login without a session, and to /change-password while the operator-issued
 * initial password is still in use: that member can reach nothing else.
 */
export async function requireAuth(): Promise<AuthMember> {
  const member = await getSession();
  if (!member) redirect('/login');
  if (member.mustChangePassword) redirect('/change-password');
  return member;
}

/** The change-password step: any valid session, including one that must change its password. */
export async function requireSessionForPasswordChange(): Promise<AuthMember> {
  const member = await getSession();
  if (!member) redirect('/login');
  return member;
}

function json(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * Route handlers authenticate themselves: `src/proxy.ts` does not run for
 * /api/*. Returns the member, or the 401/403 response to send. Unsafe methods
 * must come from APP_ORIGIN.
 */
export async function authenticateRoute(request: Request): Promise<AuthMember | Response> {
  if (!isAllowedOrigin(request.method, request.headers, env.APP_ORIGIN)) {
    return json(403, 'forbidden_origin');
  }
  const member = await getSession();
  if (!member) return json(401, 'unauthenticated');
  if (member.mustChangePassword) return json(403, 'password_change_required');
  return member;
}
