'use client';

import { formatDuration } from '@/lib/duration';
import { t } from '@/lib/t';
import { cn } from '@/lib/utils';
import type { TranscriptSegmentView } from '@/types/calls';
import { usePlayback } from './Playback';

const SPEAKER_STYLE = {
  AGENT: 'text-primary',
  CUSTOMER: 'text-info',
  UNKNOWN: 'text-muted-foreground',
} as const;

/**
 * Persian transcript with timestamps and speaker labels (نامشخص when unsure).
 * A timestamp seeks the audio; the segment chosen from any evidence link is
 * highlighted. Original wording is shown as is, with `dir="auto"`.
 */
export function TranscriptPanel({ segments }: { segments: TranscriptSegmentView[] }) {
  const { activeSegmentId, seek } = usePlayback();
  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('transcript.empty')}</p>;
  }
  return (
    <ol className="max-h-[28rem] space-y-1 overflow-y-auto pe-1" data-testid="transcript">
      {segments.map((segment) => {
        const active = segment.id === activeSegmentId;
        return (
          <li
            key={segment.id}
            id={`segment-${segment.id}`}
            aria-current={active ? 'true' : undefined}
            aria-label={t('transcript.segment', { index: segment.index + 1 })}
            data-active={active}
            className={cn(
              'flex gap-3 rounded-md px-2 py-2 transition-colors',
              active ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/40',
            )}
          >
            <button
              type="button"
              onClick={() => seek(segment.startMs, segment.id)}
              className="h-fit shrink-0 rounded px-1 text-xs font-medium text-primary tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('audio.seekTo', { time: formatDuration(segment.startMs) })}
            >
              <bdi dir="ltr">{formatDuration(segment.startMs)}</bdi>
            </button>
            <div className="min-w-0 space-y-0.5">
              <span className={cn('text-xs font-semibold', SPEAKER_STYLE[segment.speaker])}>
                {t(`transcript.speaker.${segment.speaker}`)}
              </span>
              <p dir="auto" className="text-sm leading-7">
                {segment.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
