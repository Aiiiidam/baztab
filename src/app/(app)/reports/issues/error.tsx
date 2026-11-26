'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/UiComponents';
import { t } from '@/lib/t';

/** "Report unavailable" state of گزارش مشکلات (design scope). */
export default function ReportError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <TriangleAlert className="h-10 w-10 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-lg font-bold">{t('report.unavailable.title')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('report.unavailable.description')}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        <RotateCcw className="h-4 w-4" />
        {t('error.retry')}
      </Button>
    </div>
  );
}
