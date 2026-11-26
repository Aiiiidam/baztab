import Link from 'next/link';
import { ChartNoAxesColumn, ChevronRight, Inbox, SearchX } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/UiComponents';
import { requireAuth } from '@/lib/auth';
import { formatCallDate, formatDateTime, formatNumber, formatPercent } from '@/lib/format';
import { t, tp } from '@/lib/t';
import { defaultRange, getIssueReport, parseRange } from '@/services/report.service';
import { ReportRange } from './report-range';

type SearchParams = Promise<{ from?: string; to?: string }>;

/** گزارش مشکلات — landing page (P1-04, design scope, tech spec §9). */
export default async function IssueReportPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireAuth();
  const { from, to } = await searchParams;
  const range = parseRange(from, to) ?? defaultRange();
  const report = await getIssueReport(member, range);
  const top = report.ranks[0]?.calls ?? 1;
  const rangeQuery = `from=${range.from}&to=${range.to}`;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('report.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('report.subtitle')}</p>
        </div>
        <ReportRange from={range.from} to={range.to} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('report.analyzedCalls')}</CardDescription>
            <CardTitle className="text-3xl tabular-nums" data-testid="kpi-analyzed">
              {formatNumber(report.analyzedCalls)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('report.rangeLabel', {
              from: formatCallDate(range.from),
              to: formatCallDate(range.to),
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('report.issueGroups')}</CardDescription>
            <CardTitle className="text-3xl tabular-nums" data-testid="kpi-groups">
              {formatNumber(report.ranks.length)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('report.callsWithIssues', { count: report.callsWithIssues })}
          </CardContent>
        </Card>
      </div>

      {report.analyzedCalls === 0 ? (
        <Card>
          <CardContent
            className="flex flex-col items-center gap-3 py-12 text-center"
            data-testid="report-empty"
          >
            <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-semibold">{t('report.empty.noCalls.title')}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t('report.empty.noCalls.description')}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/calls">{t('report.goToCalls')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : report.ranks.length === 0 ? (
        <Card>
          <CardContent
            className="flex flex-col items-center gap-3 py-12 text-center"
            data-testid="report-no-issues"
          >
            <SearchX className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-semibold">{t('report.empty.noIssues.title')}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t('report.empty.noIssues.description')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ChartNoAxesColumn className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('report.ranking')}
            </CardTitle>
            <CardDescription>{t('report.countNote')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2" data-testid="issue-ranks">
              {report.ranks.map((rank, index) => (
                <li key={rank.categoryId}>
                  <Link
                    href={`/calls?issue=${rank.categoryId}&${rangeQuery}`}
                    className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('report.openCalls', { label: rank.label })}
                    data-testid="issue-rank"
                    data-calls={rank.calls}
                  >
                    <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted-foreground tabular-nums">
                      {formatNumber(index + 1)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{rank.label}</span>
                        <span className="text-sm tabular-nums">
                          <span className="font-semibold">
                            {tp('report.callCount', rank.calls)}
                          </span>
                          <span className="ms-2 text-xs text-muted-foreground">
                            {t('report.share', {
                              percent: formatPercent(rank.calls / report.analyzedCalls, {
                                maximumFractionDigits: 0,
                              }),
                            })}
                          </span>
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, (rank.calls / top) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground" data-testid="report-generated">
        {t('report.generatedAt', { time: formatDateTime(report.generatedAt) })}
      </p>
    </div>
  );
}
