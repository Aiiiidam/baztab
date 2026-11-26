'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Play } from 'lucide-react';
import { formatDuration } from '@/lib/duration';
import { t } from '@/lib/t';
import { cn } from '@/lib/utils';

/**
 * Shared playback state for one call detail page: the audio element and the
 * highlighted transcript segment. Timestamp links in findings, scores and the
 * transcript call `seek()`, which highlights the segment, scrolls it into view
 * and moves the player there when audio is available (design scope).
 */
type PlaybackContextValue = {
  audioRef: RefObject<HTMLAudioElement | null>;
  activeSegmentId: string | null;
  audioAvailable: boolean;
  seek: (ms: number, segmentId?: string) => void;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function PlaybackProvider({
  audioAvailable,
  children,
}: {
  audioAvailable: boolean;
  children: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  const seek = useCallback((ms: number, segmentId?: string) => {
    if (segmentId) {
      setActiveSegmentId(segmentId);
      document
        .getElementById(`segment-${segmentId}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = ms / 1000;
      void audio.play().catch(() => {
        // Autoplay can be refused; the position is still set.
      });
    }
  }, []);

  const value = useMemo(
    () => ({ audioRef, activeSegmentId, audioAvailable, seek }),
    [activeSegmentId, audioAvailable, seek],
  );
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackContextValue {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error('usePlayback must be used inside PlaybackProvider');
  return context;
}

/** A timestamp that seeks the player and highlights its transcript segment. */
export function SeekButton({
  ms,
  segmentId,
  className,
}: {
  ms: number;
  segmentId?: string;
  className?: string;
}) {
  const { seek } = usePlayback();
  const time = formatDuration(ms);
  return (
    <button
      type="button"
      onClick={() => seek(ms, segmentId)}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary tabular-nums hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      aria-label={t('audio.seekTo', { time })}
      data-testid="seek-button"
    >
      <Play className="h-3 w-3" aria-hidden="true" />
      <bdi dir="ltr">{time}</bdi>
    </button>
  );
}
