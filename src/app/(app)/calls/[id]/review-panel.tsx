'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, History, Pencil } from 'lucide-react';
import type { IssueOutcome, ScoreCriterion, ScoreRating } from '@prisma/client';
import {
  confirmReviewAction,
  saveCorrectionsAction,
  type ReviewResult,
} from '@/actions/review.actions';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/components/UiComponents';
import { formatDateTime } from '@/lib/format';
import { toLocaleDigits } from '@/lib/persian';
import { t } from '@/lib/t';
import type { AnalysisView, HistoryEntry } from '@/types/calls';

const OUTCOMES: IssueOutcome[] = ['RESOLVED', 'UNRESOLVED', 'UNKNOWN'];
const RATINGS: ScoreRating[] = ['MET', 'PARTLY_MET', 'NOT_MET', 'INSUFFICIENT_EVIDENCE'];
const NONE = 'none';

type Props = {
  callId: string;
  analysis: AnalysisView;
  categories: { id: string; key: string; label: string }[];
  history: HistoryEntry[];
};

/**
 * Optional review (design scope: تأیید بازبینی, ویرایش یافته‌ها و امتیازها).
 * Kept apart from processing state; a ready call never requires it. A stale
 * revision (someone else saved first) shows a conflict and offers a reload.
 */
export function ReviewPanel({ callId, analysis, categories, history }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [findings, setFindings] = useState(() =>
    analysis.findings.map((f) => ({
      findingId: f.id,
      categoryId: f.category?.id ?? null,
      outcome: f.outcome,
    })),
  );
  const [scores, setScores] = useState(() =>
    analysis.scores.map((s) => ({ criterion: s.criterion, rating: s.rating })),
  );

  const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));
  const labelByKey = new Map(categories.map((c) => [c.key, c.label]));
  const categoryKeyLabel = (value: string | null) =>
    value ? (labelByKey.get(value) ?? value) : t('review.value.none');

  function handle(result: ReviewResult, success: string) {
    if (result.ok) {
      setError(null);
      setEditing(false);
      toast.success(success);
      router.refresh();
      return;
    }
    setError({ message: result.error, stale: Boolean(result.fieldErrors?._stale) });
  }

  function describe(entry: HistoryEntry): string {
    const who = t('review.memberLabel', { mobile: toLocaleDigits(entry.actor) });
    const date = formatDateTime(entry.createdAt);
    if (entry.field === 'review.confirmed') return t('review.historyConfirm', { who, date });
    const finding = /^finding\[(\d+)\]\.(category|outcome)$/.exec(entry.field);
    const score = /^score\.(\w+)$/.exec(entry.field);
    let field = entry.field;
    let from = entry.previousValue ?? '';
    let to = entry.newValue ?? '';
    if (finding) {
      const index = toLocaleDigits(Number(finding[1]) + 1);
      if (finding[2] === 'category') {
        field = t('review.field.category', { index });
        from = categoryKeyLabel(entry.previousValue);
        to = categoryKeyLabel(entry.newValue);
      } else {
        field = t('review.field.outcome', { index });
        from = t(`outcome.${entry.previousValue as IssueOutcome}`);
        to = t(`outcome.${entry.newValue as IssueOutcome}`);
      }
    } else if (score) {
      field = t('review.field.score', {
        criterion: t(`score.criterion.${score[1] as ScoreCriterion}`),
      });
      from = t(`score.rating.${entry.previousValue as ScoreRating}`);
      to = t(`score.rating.${entry.newValue as ScoreRating}`);
    }
    return t('review.historyEntry', { who, date, field, from, to });
  }

  return (
    <Card data-testid="review-panel">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {analysis.reviewedAt ? (
            <Badge variant="success" className="gap-1">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t('review.status.reviewed')}
            </Badge>
          ) : (
            <Badge variant="outline">{t('review.status.notReviewed')}</Badge>
          )}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={pending && !editing}
            onClick={() =>
              startTransition(async () =>
                handle(
                  await confirmReviewAction({ callId, revisionId: analysis.revisionId }),
                  t('review.confirmedToast'),
                ),
              )
            }
          >
            <CircleCheck className="h-4 w-4" />
            {t('review.confirm')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            {t('review.edit')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {analysis.reviewedAt && analysis.reviewedBy && (
          <p className="text-sm text-muted-foreground">
            {t('review.confirmed', {
              date: formatDateTime(analysis.reviewedAt),
              who: t('review.memberLabel', { mobile: toLocaleDigits(analysis.reviewedBy) }),
            })}
          </p>
        )}
        {error && !editing && <ConflictAlert error={error} onReload={() => router.refresh()} />}

        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4" aria-hidden="true" />
            {t('review.history')}
          </summary>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('review.historyEmpty')}</p>
          ) : (
            <ul
              className="mt-2 space-y-1 text-sm text-muted-foreground"
              data-testid="review-history"
            >
              {history.map((entry) => (
                <li key={entry.id}>{describe(entry)}</li>
              ))}
            </ul>
          )}
        </details>
      </CardContent>

      <Dialog open={editing} onOpenChange={(open) => !pending && setEditing(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('review.editTitle')}</DialogTitle>
            <DialogDescription>{t('review.editDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {analysis.findings.map((finding, index) => (
              <fieldset key={finding.id} className="space-y-2 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">
                  {t('findings.issues')} {toLocaleDigits(index + 1)}
                </legend>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  <span>{t('review.categoryLabel')}</span>
                  <Select
                    value={findings[index].categoryId ?? NONE}
                    onValueChange={(value) =>
                      setFindings((current) =>
                        current.map((f, i) =>
                          i === index ? { ...f, categoryId: value === NONE ? null : value } : f,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label={`${t('review.categoryLabel')} ${toLocaleDigits(index + 1)}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('review.value.none')}</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  <span>{t('review.outcomeLabel')}</span>
                  <Select
                    value={findings[index].outcome}
                    onValueChange={(value) =>
                      setFindings((current) =>
                        current.map((f, i) =>
                          i === index ? { ...f, outcome: value as IssueOutcome } : f,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label={`${t('review.outcomeLabel')} ${toLocaleDigits(index + 1)}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTCOMES.map((outcome) => (
                        <SelectItem key={outcome} value={outcome}>
                          {t(`outcome.${outcome}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {finding.category && !categoryLabel.has(finding.category.id) && (
                  <p className="text-xs text-muted-foreground">{finding.category.label}</p>
                )}
              </fieldset>
            ))}

            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">{t('score.title')}</legend>
              {scores.map((score, index) => (
                <label
                  key={score.criterion}
                  className="block space-y-1 text-xs text-muted-foreground"
                >
                  <span>{t(`score.criterion.${score.criterion}`)}</span>
                  <Select
                    value={score.rating}
                    onValueChange={(value) =>
                      setScores((current) =>
                        current.map((s, i) =>
                          i === index ? { ...s, rating: value as ScoreRating } : s,
                        ),
                      )
                    }
                  >
                    <SelectTrigger aria-label={t(`score.criterion.${score.criterion}`)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RATINGS.map((rating) => (
                        <SelectItem key={rating} value={rating}>
                          {t(`score.rating.${rating}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </fieldset>

            {error && <ConflictAlert error={error} onReload={() => router.refresh()} />}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              {t('review.cancel')}
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () =>
                  handle(
                    await saveCorrectionsAction({
                      callId,
                      revisionId: analysis.revisionId,
                      findings,
                      scores,
                    }),
                    t('review.saved'),
                  ),
                )
              }
            >
              {pending ? t('review.saving') : t('review.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ConflictAlert({
  error,
  onReload,
}: {
  error: { message: string; stale: boolean };
  onReload: () => void;
}) {
  return (
    <Alert variant="destructive" data-testid="review-error">
      <AlertDescription className="space-y-2">
        <p>{error.message}</p>
        {error.stale && (
          <Button size="sm" variant="outline" onClick={onReload}>
            {t('review.reload')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
