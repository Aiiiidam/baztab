import { describe, expect, it } from 'vitest';
import { isNavItemActive, NAV_ITEMS, pageTitleFor } from '@/lib/navigation';
import { sessionCookieOptions } from '@/lib/session-cookie';
import { t } from '@/lib/t';

describe('navigation', () => {
  it('lists the report and the call list, in that order, for every member', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual(['/reports/issues', '/calls']);
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([t('nav.reports'), t('nav.calls')]);
  });

  it('matches a nav item on its own path and below it, not on look-alikes', () => {
    expect(isNavItemActive('/calls', '/calls')).toBe(true);
    expect(isNavItemActive('/calls', '/calls/abc')).toBe(true);
    expect(isNavItemActive('/calls', '/callsign')).toBe(false);
    expect(isNavItemActive('/', '/calls')).toBe(false);
  });

  it('derives the header title from explicit routes, then nav items', () => {
    expect(pageTitleFor('/reports/issues')).toBe(t('nav.reports'));
    expect(pageTitleFor('/calls')).toBe(t('nav.calls'));
    expect(pageTitleFor('/calls/ckabc123')).toBe(t('callDetail.title'));
    expect(pageTitleFor('/nothing-here')).toBe('');
  });
});

describe('sessionCookieOptions', () => {
  it('is http-only, lax and scoped to the whole site', () => {
    const expires = new Date();
    expect(sessionCookieOptions(expires)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires,
    });
  });
});
