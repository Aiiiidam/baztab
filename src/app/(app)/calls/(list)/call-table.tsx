import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CallDate } from '@/components/calls/CallDate';
import { CallStateBadge } from '@/components/calls/CallStateBadge';
import { OutcomeBadge } from '@/components/calls/OutcomeBadge';
import {
  Badge,
  Ltr,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/UiComponents';
import { t } from '@/lib/t';
import type { CallListRow } from '@/types/calls';

/** Rows of فهرست تماس‌ها. `backQuery` returns the detail page to this exact view. */
export function CallTable({ rows, backQuery }: { rows: CallListRow[]; backQuery: string }) {
  const back = backQuery ? `?back=${encodeURIComponent(backQuery)}` : '';
  return (
    <Table data-testid="call-table">
      <TableHeader>
        <TableRow>
          <TableHead>{t('calls.column.ref')}</TableHead>
          <TableHead>{t('calls.column.date')}</TableHead>
          <TableHead>{t('calls.column.issue')}</TableHead>
          <TableHead className="hidden md:table-cell">{t('calls.column.outcome')}</TableHead>
          <TableHead>{t('calls.column.state')}</TableHead>
          <TableHead className="hidden md:table-cell">{t('calls.column.review')}</TableHead>
          <TableHead>
            <span className="sr-only">{t('calls.openCall', { ref: '' })}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-call-id={row.id}>
            <TableCell className="font-mono text-xs">
              <Ltr>{row.ref}</Ltr>
            </TableCell>
            <TableCell>
              <CallDate date={row.effectiveDate} source={row.dateSource} />
            </TableCell>
            <TableCell className="max-w-36 sm:max-w-72">
              {row.issues.length > 0 ? (
                <span className="line-clamp-2">{row.issues.join('، ')}</span>
              ) : (
                <span
                  className="block truncate text-muted-foreground"
                  dir="auto"
                  title={row.originalFilename}
                >
                  {row.originalFilename}
                </span>
              )}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <span className="flex flex-wrap gap-1">
                {row.outcomes.map((outcome) => (
                  <OutcomeBadge key={outcome} outcome={outcome} />
                ))}
              </span>
            </TableCell>
            <TableCell>
              <CallStateBadge state={row.state} />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              {row.reviewed && (
                <Badge variant="outline" className="whitespace-nowrap text-2xs">
                  {t('review.status.reviewed')}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-end">
              <Link
                href={`/calls/${row.id}${back}`}
                className="inline-flex items-center gap-1 rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('calls.openCall', { ref: row.ref })}
              >
                <span className="hidden sm:inline">{t('callDetail.title')}</span>
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
