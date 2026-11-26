/**
 * Single-range `Range: bytes=…` parsing for audio playback (tech spec §6).
 * Multi-range requests are answered with the whole object, which RFC 9110
 * allows; browsers never send them for media.
 */
export type RangeRequest =
  { kind: 'none' } | { kind: 'range'; start: number; end: number } | { kind: 'unsatisfiable' };

export function parseRange(header: string | null, totalBytes: number): RangeRequest {
  if (!header) return { kind: 'none' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || header.includes(',')) return { kind: 'none' };
  const [, first, last] = match;
  if (first === '' && last === '') return { kind: 'unsatisfiable' };
  if (totalBytes === 0) return { kind: 'unsatisfiable' };

  if (first === '') {
    // Suffix range: the last N bytes.
    const length = Number(last);
    if (length === 0) return { kind: 'unsatisfiable' };
    return { kind: 'range', start: Math.max(0, totalBytes - length), end: totalBytes - 1 };
  }
  const start = Number(first);
  if (start >= totalBytes) return { kind: 'unsatisfiable' };
  const end = last === '' ? totalBytes - 1 : Math.min(Number(last), totalBytes - 1);
  if (end < start) return { kind: 'unsatisfiable' };
  return { kind: 'range', start, end };
}
