'use client';

import { useRouter } from 'next/navigation';
import { DateRangePicker, type DateRange } from '@/components/UiComponents';
import { t } from '@/lib/t';

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fromIso = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Jalali range picker for the report. The picked calendar days become
 * inclusive Gregorian `YYYY-MM-DD` bounds in the URL, which the report and
 * its drill-down share.
 */
export function ReportRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const value: DateRange = { from: fromIso(from), to: fromIso(to) };

  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground" id="report-range-label">
        {t('report.range')}
      </span>
      <div aria-labelledby="report-range-label">
        <DateRangePicker
          value={value}
          onChange={(range) => {
            if (!range?.from || !range.to) return;
            router.push(`/reports/issues?from=${toIso(range.from)}&to=${toIso(range.to)}`);
          }}
        />
      </div>
    </div>
  );
}
