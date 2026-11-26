import { Gauge, UserCheck } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/UiComponents';
import { RATING_POINTS } from '@/lib/validations/analysis';
import { t } from '@/lib/t';
import { toLocaleDigits } from '@/lib/persian';
import type { AnalysisView } from '@/types/calls';
import { SeekButton } from './Playback';

const RATING_STYLE = {
  MET: 'success',
  PARTLY_MET: 'warning',
  NOT_MET: 'error',
  INSUFFICIENT_EVIDENCE: 'outline',
} as const;

/**
 * امتیاز تماس با هوش مصنوعی (design scope › Agent score). Each criterion shows
 * its rating, explanation and timestamped evidence; the total out of ۶ appears
 * only when all three were assessed, otherwise ناقص. Scores sit in their own
 * panel, apart from the outcome, and say that they are independent of it.
 */
export function ScorePanel({ analysis }: { analysis: AnalysisView }) {
  return (
    <Card data-testid="score-panel">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('score.title')}
          </CardTitle>
          {analysis.total === null ? (
            <Badge variant="outline" data-testid="score-total" title={t('score.incompleteHint')}>
              {t('score.incomplete')}
            </Badge>
          ) : (
            <Badge variant="brand" className="text-sm tabular-nums" data-testid="score-total">
              {t('score.total', { total: analysis.total })}
            </Badge>
          )}
        </div>
        <CardDescription>{t('score.independentHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {analysis.scores.map((score) => {
            const points = RATING_POINTS[score.rating];
            return (
              <li
                key={score.criterion}
                className="space-y-1.5 rounded-lg border p-3"
                data-testid="score"
                data-criterion={score.criterion}
                data-rating={score.rating}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t(`score.criterion.${score.criterion}`)}</span>
                  <span className="flex items-center gap-1.5">
                    {score.humanSet && (
                      <Badge variant="outline" className="gap-1 text-2xs font-normal">
                        <UserCheck className="h-3 w-3" aria-hidden="true" />
                        {t('findings.humanSet')}
                      </Badge>
                    )}
                    <Badge variant={RATING_STYLE[score.rating]}>
                      {t(`score.rating.${score.rating}`)}
                      {points !== null && (
                        <span className="ms-1 tabular-nums">({toLocaleDigits(points)})</span>
                      )}
                    </Badge>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`score.criterionHint.${score.criterion}`)}
                </p>
                {score.explanation && <p className="text-sm leading-7">{score.explanation}</p>}
                {score.evidence.length > 0 && (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted-foreground">{t('findings.evidence')}:</span>
                    {score.evidence.map((ref) => (
                      <SeekButton key={ref.segmentId} ms={ref.startMs} segmentId={ref.segmentId} />
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
