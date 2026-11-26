import { CircleCheck, CircleDot, CircleHelp } from 'lucide-react';
import type { IssueOutcome } from '@prisma/client';
import { Badge } from '@/components/UiComponents';
import { t } from '@/lib/t';

const STYLE: Record<
  IssueOutcome,
  { variant: 'success' | 'warning' | 'outline'; Icon: typeof CircleCheck }
> = {
  RESOLVED: { variant: 'success', Icon: CircleCheck },
  UNRESOLVED: { variant: 'warning', Icon: CircleDot },
  UNKNOWN: { variant: 'outline', Icon: CircleHelp },
};

/** نتیجه تماس per issue: حل‌شده / حل‌نشده / نامشخص, as text plus icon. */
export function OutcomeBadge({ outcome }: { outcome: IssueOutcome }) {
  const { variant, Icon } = STYLE[outcome];
  return (
    <Badge variant={variant} className="gap-1 whitespace-nowrap" data-outcome={outcome}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`outcome.${outcome}`)}
    </Badge>
  );
}
