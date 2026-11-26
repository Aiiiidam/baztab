/**
 * Session cookie contract shared by the proxy (edge-safe, no server-only
 * imports) and the auth library. Keep this file free of Node/Prisma imports.
 *
 * HttpOnly, SameSite=Lax, and Secure outside development and tests (tech spec
 * §4.5). The cookie lives until the session's absolute expiry; the idle expiry
 * is enforced server-side on every request.
 */

export const SESSION_COOKIE = 'session';

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}
