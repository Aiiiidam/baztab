import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  CalendarClock,
  Clock,
  FileAudio,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import { AudioPlayer } from '@/components/calls/AudioPlayer';
import { CallDate } from '@/components/calls/CallDate';
import { CallStateBadge } from '@/components/calls/CallStateBadge';
import { FindingsPanel } from '@/components/calls/FindingsPanel';
import { PlaybackProvider } from '@/components/calls/Playback';
import { ScorePanel } from '@/components/calls/ScorePanel';
import { TranscriptPanel } from '@/components/calls/TranscriptPanel';
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Ltr,
} from '@/components/UiComponents';
import { requireAuth } from '@/lib/auth';
import { formatDuration } from '@/lib/duration';
import { formatCallDate, formatDateTime } from '@/lib/format';
import { toLocaleDigits } from '@/lib/persian';
import { readyTimeMessage } from '@/lib/ready-time';
import { t } from '@/lib/t';
import { getCallDetail, recordAccess } from '@/services/call-query.service';
import { zonedDate } from '@/lib/call-date';
import { locale } from '@/lib/locale';
import { RetryButton } from './retry-button';
import { ReviewPanel } from './review-panel';

const FAILURE_TEXT: Record<string, () => string> = {
  no_usable_speech: () => t('failure.no_usable_speech'),
  invalid_output: () => t('failure.invalid_output'),
  transient_failure: () => t('failure.transient_failure'),
  recording_missing: () => t('failure.recording_missing'),
  recording_expired: () => t('failure.recording_expired'),
};

/** جزئیات تماس (design scope, tech spec §9 GET /api/calls/:id). Foreign or missing IDs are a generic 404. */
export default async function CallDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const member = await requireAuth();
  const [{ id }, { back }] = await Promise.all([params, searchParams]);
  const call = await getCallDetail(member, id);
  if (!call) notFound();

  if (call.transcript) await recordAccess(member, call.id, 'TRANSCRIPT_VIEW');

  // Only a list query string is accepted as the way back (no open redirects).
  const backHref =
    back && !back.includes('://') && !back.startsWith('/') ? `/calls?${back}` : '/calls';
  const expired = Boolean(call.recording?.expired);
  const audioAvailable = Boolean(call.recording?.available);
  const failureText =
    (call.failureCode && FAILURE_TEXT[call.failureCode]?.()) || t('failure.unknown');
  const removalDate = call.recording
    ? formatCallDate(zonedDate(new Date(call.recording.expiresAt), locale.timeZone))
    : null;

  return (
    <PlaybackProvider audioAvailable={audioAvailable}>
      <div className="space-y-6 p-4 md:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowRight className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
          {t('callDetail.back')}
        </Link>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {t('callDetail.ref', { ref: '' })}
              <Ltr className="font-mono">{call.ref}</Ltr>
            </h1>
            <CallStateBadge state={call.state} />
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t('callDetail.date')}</dt>
              <dd>
                <CallDate date={call.effectiveDate} source={call.dateSource} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">{t('callDetail.filename')}</dt>
              <dd className="truncate" dir="auto" title={call.originalFilename}>
                {call.originalFilename}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('callDetail.acceptedAt')}</dt>
              <dd>{formatDateTime(call.acceptedAt)}</dd>
            </div>
            {call.recording && (
              <div>
                <dt className="text-muted-foreground">{t('callDetail.duration')}</dt>
                <dd>
                  <bdi dir="ltr">{formatDuration(call.recording.durationMs)}</bdi>
                </dd>
              </div>
            )}
          </dl>
        </header>

        {(call.state === 'QUEUED' || call.state === 'PROCESSING') && (
          <Alert data-testid="call-pending">
            {call.state === 'QUEUED' ? (
              <Clock className="h-4 w-4" aria-hidden="true" />
            ) : (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            <AlertDescription className="space-y-1">
              <p>
                {call.state === 'QUEUED'
                  ? t('callState.queuedDescription')
                  : t('callState.processingDescription')}
                {call.stage === 'transcribing' && ` ${t('callState.stage.transcribing')}.`}
                {call.stage === 'analyzing' && ` ${t('callState.stage.analyzing')}.`}
              </p>
              {call.readyAt && <p className="font-medium">{readyTimeMessage(call.readyAt)}</p>}
            </AlertDescription>
          </Alert>
        )}

        {call.state === 'FAILED' && (
          <Alert variant="destructive" data-testid="call-failed" data-code={call.failureCode}>
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="space-y-3">
              <p>{failureText}</p>
              {call.failureRetryable && audioAvailable && <RetryButton callId={call.id} />}
            </AlertDescription>
          </Alert>
        )}

        {expired ? (
          <Alert data-testid="call-expired">
            <FileAudio className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              {t('callDetail.expired', { days: toLocaleDigits(call.retentionDays) })}
            </AlertDescription>
          </Alert>
        ) : (
          removalDate && (
            <p
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
              data-testid="removal-date"
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              {t('callDetail.removalDate', { date: removalDate })}
            </p>
          )
        )}

        {call.analysis ? (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FindingsPanel analysis={call.analysis} expired={expired} />
              <ScorePanel analysis={call.analysis} />
            </div>
            {call.state === 'READY' && (
              <ReviewPanel
                callId={call.id}
                analysis={call.analysis}
                categories={call.categories}
                history={call.history}
              />
            )}
          </>
        ) : (
          call.state !== 'FAILED' && (
            <p className="text-sm text-muted-foreground">{t('findings.pending')}</p>
          )
        )}

        {!expired && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('transcript.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {audioAvailable ? (
                <AudioPlayer callId={call.id} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('audio.unavailable')}</p>
              )}
              {call.transcript ? (
                <TranscriptPanel segments={call.transcript} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('transcript.pending')}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PlaybackProvider>
  );
}
