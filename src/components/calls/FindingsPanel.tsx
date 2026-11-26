import { CircleSlash, UserCheck } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/UiComponents';
import { t } from '@/lib/t';
import { toLocaleDigits } from '@/lib/persian';
import type { AnalysisView, SegmentRef } from '@/types/calls';
import { OutcomeBadge } from './OutcomeBadge';
import { SeekButton } from './Playback';

function EvidenceLinks({ refs }: { refs: SegmentRef[] }) {
  if (refs.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-xs text-muted-foreground">{t('findings.evidence')}:</span>
      {refs.map((ref) => (
        <SeekButton key={ref.segmentId} ms={ref.startMs} segmentId={ref.segmentId} />
      ))}
    </span>
  );
}

function HumanSet() {
  return (
    <Badge variant="outline" className="gap-1 text-2xs font-normal">
      <UserCheck className="h-3 w-3" aria-hidden="true" />
      {t('findings.humanSet')}
    </Badge>
  );
}

/** یافته‌های تماس: دلیل تماس, مشکل, نتیجه تماس per issue (design scope › Findings). */
export function FindingsPanel({ analysis, expired }: { analysis: AnalysisView; expired: boolean }) {
  return (
    <Card data-testid="findings-panel">
      <CardHeader>
        <CardTitle className="text-base">{t('findings.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('findings.reason')}</h3>
          {analysis.reason.text ? (
            <p className="text-sm leading-7">{analysis.reason.text}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('findings.expiredText')}</p>
          )}
          <EvidenceLinks refs={analysis.reason.evidence} />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('findings.issues')}</h3>
          {analysis.findings.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('findings.noIssues')}</p>
          )}
          <ol className="space-y-3">
            {analysis.findings.map((finding) => (
              <li
                key={finding.id}
                className="space-y-2 rounded-lg border p-3"
                data-testid="finding"
                data-eligible={finding.eligible}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {toLocaleDigits(finding.position + 1)}.
                  </span>
                  <span className="font-medium">
                    {finding.category?.label ?? t('findings.uncategorized')}
                  </span>
                  {finding.categoryHumanSet && <HumanSet />}
                </div>
                {finding.summary && (
                  <p className="text-sm leading-7 text-muted-foreground">{finding.summary}</p>
                )}
                {finding.evidence.length > 0 ? (
                  <EvidenceLinks refs={finding.evidence} />
                ) : (
                  !expired && (
                    <p className="text-xs text-muted-foreground">{t('findings.missingEvidence')}</p>
                  )
                )}

                <div className="space-y-1.5 border-t pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t('findings.outcome')}
                    </span>
                    <OutcomeBadge outcome={finding.outcome} />
                    {finding.outcomeHumanSet && <HumanSet />}
                  </div>
                  {finding.outcomeExplanation && (
                    <p className="text-sm leading-7">{finding.outcomeExplanation}</p>
                  )}
                  <EvidenceLinks refs={finding.outcomeEvidence} />
                </div>

                {!finding.eligible && (
                  <p
                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                    data-testid="not-in-report"
                  >
                    <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {t('findings.notInReport')}:{' '}
                      {finding.category
                        ? t('findings.notInReport.noEvidence')
                        : t('findings.notInReport.noCategory')}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      </CardContent>
    </Card>
  );
}
