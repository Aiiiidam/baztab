import type { ComponentType } from 'react';
import { ChartNoAxesColumn, PhoneCall } from 'lucide-react';
import { t } from '@/lib/t';

/**
 * Single source of truth for the app's navigation. The Sidebar renders it and
 * the Header derives page titles from it. Phase 1 has no roles, so every
 * member sees the same items (design scope: گزارش مشکلات, فهرست تماس‌ها, خروج;
 * خروج is rendered by the Sidebar itself).
 */
export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: NavItem[] = [
  { label: t('nav.reports'), href: '/reports/issues', icon: ChartNoAxesColumn },
  { label: t('nav.calls'), href: '/calls', icon: PhoneCall },
];

/** Titles for routes that are not nav items themselves. */
const ROUTE_TITLES: { pattern: RegExp; title: string }[] = [
  { pattern: /^\/calls\/[^/]+$/, title: t('callDetail.title') },
];

export function isNavItemActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Title for the header: an explicit route title, else the longest matching nav item, else ''. */
export function pageTitleFor(pathname: string): string {
  const explicit = ROUTE_TITLES.find((route) => route.pattern.test(pathname));
  if (explicit) return explicit.title;
  const match = NAV_ITEMS.filter((item) => isNavItemActive(item.href, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? '';
}
