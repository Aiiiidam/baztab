import Link from 'next/link';
import type { CallState } from '@prisma/client';
import { PhoneCall, SearchX } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/UiComponents';
import { requireAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { t } from '@/lib/t';
import { listCalls } from '@/services/call-query.service';
import { drillDownFilter, describeDrillDown } from '@/services/report.service';
import { CallTable } from './call-table';
import { CallsToolbar } from './calls-toolbar';
import { UploadPanel } from './upload-panel';

const STATES: CallState[] = ['QUEUED', 'PROCESSING', 'READY', 'FAILED'];

type SearchParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** فهرست تماس‌ها (design scope, tech spec §9 GET /api/calls). */
export default async function CallsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const member = await requireAuth();
  const params = await searchParams;
  const q = one(params.q) ?? '';
  const stateParam = one(params.state);
  const state = STATES.find((value) => value === stateParam) ?? null;
  const cursor = one(params.cursor) ?? null;
  const drill = await drillDownFilter(member, {
    issue: one(params.issue),
    from: one(params.from),
    to: one(params.to),
  });

  const page = await listCalls(member, { search: q, state, cursor, where: drill?.where });
  const chips = drill ? describeDrillDown(drill) : [];
  const filtered = Boolean(q || state || drill);

  // The list's own query (without the cursor) goes to the detail page so "back" restores it.
  const backParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = one(value);
    if (v && key !== 'cursor') backParams.set(key, v);
  }
  const backQuery = backParams.toString();
  const nextHref = page.nextCursor
    ? `/calls?${new URLSearchParams({ ...Object.fromEntries(backParams), cursor: page.nextCursor })}`
    : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('calls.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('calls.subtitle')}</p>
        </div>
        <UploadPanel
          maxFiles={env.UPLOAD_MAX_FILES}
          maxBytes={env.UPLOAD_MAX_BYTES}
          concurrency={env.UPLOAD_CONCURRENCY}
        />
      </div>

      <CallsToolbar chips={chips} />

      {page.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            {filtered ? (
              <>
                <SearchX className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <h2 className="font-semibold">{t('calls.noMatch.title')}</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t('calls.noMatch.description')}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/calls">{t('calls.filter.clear')}</Link>
                </Button>
              </>
            ) : (
              <>
                <PhoneCall className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <h2 className="font-semibold">{t('calls.empty.title')}</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t('calls.empty.description')}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <CallTable rows={page.items} backQuery={backQuery} />
          </CardContent>
        </Card>
      )}

      {(nextHref || cursor) && (
        <div className="flex flex-wrap justify-center gap-3">
          {cursor && (
            <Button asChild variant="ghost" size="sm">
              <Link href={backQuery ? `/calls?${backQuery}` : '/calls'}>
                {t('calls.backToFirst')}
              </Link>
            </Button>
          )}
          {nextHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={nextHref}>{t('calls.loadMore')}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
