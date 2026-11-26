import { requireAuth } from '@/lib/auth';
import { t } from '@/lib/t';

/** گزارش مشکلات — filled in by M4-T3. */
export default async function IssueReportPage() {
  await requireAuth();

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('report.title')}</h1>
    </div>
  );
}
