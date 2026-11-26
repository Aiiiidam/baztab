import { toLocaleDigits } from '@/lib/persian';

/** Milliseconds → `m:ss` (or `h:mm:ss`) in the profile's digits, for timestamps and durations. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const text =
    hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  return toLocaleDigits(text);
}
