import { requireAuth } from '@/lib/auth';
import { t } from '@/lib/t';

/** فهرست تماس‌ها — filled in by M2-T7. */
export default async function CallsPage() {
  await requireAuth();

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('calls.title')}</h1>
    </div>
  );
}
