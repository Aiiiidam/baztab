import { execFile } from 'node:child_process';
import { env } from '@/lib/env';

/**
 * Media validation with a controlled ffprobe invocation (tech spec §6): no
 * shell, a hard timeout and a bounded output buffer. ffprobe reads only the
 * container header and stream info, so memory stays small; container limits
 * cap it further in the images. The file's bytes are never modified.
 */

export type MediaErrorCode = 'empty_file' | 'invalid_media' | 'unsupported_type' | 'probe_failed';

export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode) {
    super(code);
    this.name = 'MediaError';
  }
}

export type MediaInfo = {
  durationMs: number;
  bitRate: number | null;
  /** ID3 comment; synthetic fixtures carry `baztab-fake:<scenario>` for the fake adapter. */
  comment: string | null;
};

type ProbeOutput = {
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  streams?: { codec_type?: string; codec_name?: string }[];
};

function runProbe(filePath: string): Promise<ProbeOutput> {
  return new Promise((resolve, reject) => {
    execFile(
      env.FFPROBE_PATH,
      [
        '-v',
        'error',
        '-show_entries',
        'format=format_name,duration,bit_rate:format_tags=comment:stream=codec_type,codec_name',
        '-of',
        'json',
        filePath,
      ],
      { timeout: env.MEDIA_PROBE_TIMEOUT_MS, maxBuffer: 256 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) {
          // A non-zero exit means ffprobe could not read the file as media.
          if (typeof (error as { code?: unknown }).code === 'number') {
            reject(new MediaError('invalid_media'));
          } else {
            reject(new MediaError('probe_failed'));
          }
          return;
        }
        try {
          resolve(JSON.parse(stdout) as ProbeOutput);
        } catch {
          reject(new MediaError('invalid_media'));
        }
      },
    );
  });
}

/** Require an MP3 container with an MP3 audio stream and a positive duration. */
export async function probeMp3(filePath: string, bytes: number): Promise<MediaInfo> {
  if (bytes === 0) throw new MediaError('empty_file');
  const output = await runProbe(filePath);
  const format = output.format ?? {};
  const formats = (format.format_name ?? '').split(',');
  const audio = (output.streams ?? []).find((stream) => stream.codec_type === 'audio');
  if (!formats.includes('mp3') || audio?.codec_name !== 'mp3') {
    throw new MediaError('invalid_media');
  }
  const seconds = Number(format.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new MediaError('invalid_media');
  const bitRate = Number(format.bit_rate);
  const tags = format.tags ?? {};
  return {
    durationMs: Math.round(seconds * 1000),
    bitRate: Number.isFinite(bitRate) ? bitRate : null,
    comment: tags.comment ?? tags.COMMENT ?? null,
  };
}
