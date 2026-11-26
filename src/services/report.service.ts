import type { Prisma } from '@prisma/client';
import { addDays, zonedDate } from '@/lib/call-date';
import { env } from '@/lib/env';
import { compare, formatCallDate } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { t } from '@/lib/t';
import type { AuthMember } from '@/types/auth';

/**
 * گزارش مشکلات (P1-04, tech spec §9). Report and drill-down share ONE
 * predicate — `eligibleFindingWhere` — with the same tenant scope and inclusive
 * date bounds, so a rank's count always equals the rows its drill-down lists.
 *
 * - Analyzed calls: READY calls with an active revision in the range,
 *   including those with no reportable issue. `no_usable_speech` calls are
 *   FAILED, so they are never counted.
 * - A rank counts distinct calls whose active revision has an eligible finding
 *   in that category. `eligible` was fixed at publish, so expiry never changes
 *   a count; every outcome counts, including نامشخص.
 */

export type DateRange = { from: string; to: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_RANGE_DAYS = 30;

const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** The most recent 30 days, ending today in the report time zone (plan A10). */
export function defaultRange(now = new Date()): DateRange {
  const to = zonedDate(now, env.REPORT_TIME_ZONE);
  return { from: addDays(to, -(DEFAULT_RANGE_DAYS - 1)), to };
}

/** Inclusive Gregorian bounds from query parameters, or null when they are absent or malformed. */
export function parseRange(from?: string | null, to?: string | null): DateRange | null {
  if (!from || !to || !DATE.test(from) || !DATE.test(to) || from > to) return null;
  if (Number.isNaN(asDate(from).getTime()) || Number.isNaN(asDate(to).getTime())) return null;
  return { from, to };
}

/** Calls that count as analyzed in the range. */
export function reportableCallWhere(
  organizationId: string,
  range: DateRange,
): Prisma.CallWhereInput {
  return {
    organizationId,
    state: 'READY',
    activeRevisionId: { not: null },
    effectiveDate: { gte: asDate(range.from), lte: asDate(range.to) },
  };
}

/** THE eligibility predicate: an eligible, categorized finding of a reportable call's active revision. */
export function eligibleFindingWhere(
  organizationId: string,
  range: DateRange,
  categoryId?: string,
): Prisma.IssueFindingWhereInput {
  return {
    organizationId,
    eligible: true,
    categoryId: categoryId ?? { not: null },
    revision: { activeForCall: { is: reportableCallWhere(organizationId, range) } },
  };
}

export type IssueRank = {
  categoryId: string;
  key: string;
  label: string;
  calls: number;
};

export type IssueReport = {
  range: DateRange;
  generatedAt: string;
  analyzedCalls: number;
  /** Analyzed calls with at least one reportable issue. */
  callsWithIssues: number;
  ranks: IssueRank[];
};

export async function getIssueReport(
  member: Pick<AuthMember, 'organizationId'>,
  range: DateRange,
  now = new Date(),
): Promise<IssueReport> {
  const { organizationId } = member;
  const [analyzedCalls, findings] = await Promise.all([
    prisma.call.count({ where: reportableCallWhere(organizationId, range) }),
    prisma.issueFinding.findMany({
      where: eligibleFindingWhere(organizationId, range),
      select: { callId: true, categoryId: true },
      distinct: ['callId', 'categoryId'],
    }),
  ]);

  const callsByCategory = new Map<string, number>();
  for (const finding of findings) {
    const id = finding.categoryId as string;
    callsByCategory.set(id, (callsByCategory.get(id) ?? 0) + 1);
  }
  const categories = await prisma.issueCategory.findMany({
    where: { organizationId, id: { in: [...callsByCategory.keys()] } },
    select: { id: true, key: true, label: true },
  });

  const ranks = categories
    .map((category) => ({
      categoryId: category.id,
      key: category.key,
      label: category.label,
      calls: callsByCategory.get(category.id) ?? 0,
    }))
    // Deterministic: most calls first, then label, then the stable key.
    .sort((a, b) => b.calls - a.calls || compare(a.label, b.label) || a.key.localeCompare(b.key));

  return {
    range,
    generatedAt: now.toISOString(),
    analyzedCalls,
    callsWithIssues: new Set(findings.map((finding) => finding.callId)).size,
    ranks,
  };
}

// ─── Drill-down into فهرست تماس‌ها ───────────────────────────────────────

export type DrillDown = {
  where: Prisma.CallWhereInput;
  category: { id: string; label: string } | null;
  range: DateRange | null;
};

/**
 * The call-list filter for `?issue=&from=&to=`. With an issue, it is exactly
 * the report's predicate for that rank. A date range alone filters call dates.
 * An issue ID from another organization matches nothing (generic, like a 404).
 */
export async function drillDownFilter(
  member: Pick<AuthMember, 'organizationId'>,
  params: { issue?: string | null; from?: string | null; to?: string | null },
  now = new Date(),
): Promise<DrillDown | null> {
  const { organizationId } = member;
  const range = parseRange(params.from, params.to);
  if (!params.issue) {
    if (!range) return null;
    return {
      where: { effectiveDate: { gte: asDate(range.from), lte: asDate(range.to) } },
      category: null,
      range,
    };
  }
  const category = await prisma.issueCategory.findFirst({
    where: { id: params.issue, organizationId },
    select: { id: true, label: true },
  });
  const effective = range ?? defaultRange(now);
  if (!category) return { where: { id: { in: [] } }, category: null, range: effective };
  return {
    where: { findings: { some: eligibleFindingWhere(organizationId, effective, category.id) } },
    category,
    range: effective,
  };
}

/** Removable chips for the active drill-down (design scope: issue filter stays visible). */
export function describeDrillDown(drill: DrillDown): { param: string[]; label: string }[] {
  const chips: { param: string[]; label: string }[] = [];
  if (drill.category) {
    chips.push({
      param: ['issue'],
      label: t('calls.filter.issue', { label: drill.category.label }),
    });
  }
  if (drill.range) {
    chips.push({
      param: ['from', 'to'],
      label: t('calls.filter.range', {
        from: formatCallDate(drill.range.from),
        to: formatCallDate(drill.range.to),
      }),
    });
  }
  return chips;
}
