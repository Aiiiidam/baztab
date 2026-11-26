import { CircleCheck, CircleX, Clock, LoaderCircle } from 'lucide-react';
import type { CallState } from '@prisma/client';
import { Badge } from '@/components/UiComponents';
import { t } from '@/lib/t';

const STYLE: Record<
  CallState,
  { variant: 'info' | 'warning' | 'success' | 'error'; Icon: typeof Clock }
> = {
  UPLOADING: { variant: 'info', Icon: LoaderCircle },
  QUEUED: { variant: 'info', Icon: Clock },
  PROCESSING: { variant: 'warning', Icon: LoaderCircle },
  READY: { variant: 'success', Icon: CircleCheck },
  FAILED: { variant: 'error', Icon: CircleX },
};

/** Processing state as text plus icon, never colour alone (design scope accessibility). */
export function CallStateBadge({ state }: { state: CallState }) {
  const { variant, Icon } = STYLE[state];
  return (
    <Badge variant={variant} className="gap-1 whitespace-nowrap" data-state={state}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`callState.${state}`)}
    </Badge>
  );
}
