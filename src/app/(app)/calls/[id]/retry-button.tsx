'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { retryCallAction } from '@/actions/call.actions';
import { Button, toast } from '@/components/UiComponents';
import { t } from '@/lib/t';

/** تلاش دوباره — keeps the same call record; a double click still creates one job. */
export function RetryButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryCallAction({ callId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            toast.success(t('failure.retryQueued'));
            router.refresh();
          })
        }
      >
        <RotateCcw className="h-4 w-4" />
        {pending ? t('failure.retrying') : t('failure.retry')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
