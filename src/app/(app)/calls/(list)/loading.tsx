import { Card, CardContent, Skeleton } from '@/components/UiComponents';
import { t } from '@/lib/t';

export default function CallsLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6" aria-busy="true" aria-label={t('ui.loading')}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Card>
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
