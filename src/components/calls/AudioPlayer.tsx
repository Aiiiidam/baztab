'use client';

import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { t } from '@/lib/t';
import { usePlayback } from './Playback';

/**
 * Native audio player over the authorized same-origin Range endpoint. Seeking
 * relies on 206 responses from /api/calls/:id/audio; no storage URL is exposed.
 */
export function AudioPlayer({ callId }: { callId: string }) {
  const { audioRef } = usePlayback();
  const [failed, setFailed] = useState(false);

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={`/api/calls/${callId}/audio`}
        aria-label={t('audio.label')}
        className="w-full"
        data-testid="call-audio"
        onError={() => setFailed(true)}
      />
      {failed && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-error">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          {t('audio.loadError')}
        </p>
      )}
    </div>
  );
}
