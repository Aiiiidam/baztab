/**
 * Origin and client-address helpers for cookie-authenticated requests (tech
 * spec §4.5). Pure functions over headers so route handlers, actions and tests
 * share them.
 */

type HeaderSource = { get(name: string): string | null };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * An unsafe method (POST, PUT, PATCH, DELETE) must carry an Origin equal to the
 * canonical APP_ORIGIN. A missing Origin on an unsafe method is rejected:
 * every browser that can send our cookie also sends Origin on these requests.
 */
export function isAllowedOrigin(method: string, headers: HeaderSource, appOrigin: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const origin = headers.get('origin');
  return origin !== null && origin === new URL(appOrigin).origin;
}

/**
 * The client address as seen by the outermost trusted proxy: with N trusted
 * proxies, the Nth entry from the end of X-Forwarded-For. Spoofed entries a
 * client prepends are ignored. Falls back to 'unknown' (one shared bucket).
 */
export function clientAddress(headers: HeaderSource, trustedProxyCount: number): string {
  const forwarded = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded && trustedProxyCount > 0 && forwarded.length >= trustedProxyCount) {
    return forwarded[forwarded.length - trustedProxyCount];
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
