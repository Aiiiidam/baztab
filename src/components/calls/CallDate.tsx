import type { DateSource } from '@prisma/client';
import { Badge } from '@/components/UiComponents';
import { formatCallDate } from '@/lib/format';
import { t } from '@/lib/t';

/** Jalali call date; an upload-date fallback is labeled تاریخ بارگذاری (design scope). */
export function CallDate({ date, source }: { date: string; source: DateSource }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <span className="tabular-nums">{formatCallDate(date)}</span>
      {source === 'UPLOAD' && (
        <Badge variant="outline" className="text-2xs font-normal text-muted-foreground">
          {t('calls.uploadDateLabel')}
        </Badge>
      )}
    </span>
  );
}
