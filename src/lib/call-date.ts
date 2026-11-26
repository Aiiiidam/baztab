/**
 * Call dates and the expected ready time (tech spec §6, §7). Pure functions:
 * the web upload route, the worker and the UI share them.
 *
 * - A call date is a Gregorian calendar date `YYYY-MM-DD` (stored as DATE).
 * - The filename gives it only through a strict leading `YYYYMMDD` that is not
 *   followed by another digit, is a real Gregorian date, is not after the
 *   accepted date in the report time zone and not before the configured
 *   minimum. Nothing else in the name is searched. The filename never decides
 *   whether an upload is accepted; it only changes the date source.
 * - Otherwise the accepted date in the report time zone is used (تاریخ بارگذاری).
 * - The operational reporting day is the accepted date in the report time zone;
 *   results are due at 09:00 on the following day.
 */

export type DateSourceValue = 'FILENAME' | 'UPLOAD';

const LEADING_DATE = /^(\d{4})(\d{2})(\d{2})(?!\d)/;

/** Calendar date of an instant in a time zone, as `YYYY-MM-DD`. */
export function zonedDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** `YYYY-MM-DD` plus `days`, in the Gregorian calendar. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The base name without any client-supplied directory part. */
export function baseFilename(filename: string): string {
  return filename.split(/[\\/]/).pop() ?? filename;
}

/** The leading filename date, or null when the name has none that passes every rule. */
export function parseFilenameDate(
  filename: string,
  acceptedDate: string,
  minDate: string,
): string | null {
  const match = LEADING_DATE.exec(baseFilename(filename));
  if (!match) return null;
  const [y, m, d] = match.slice(1, 4).map(Number);
  if (!isRealDate(y, m, d)) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (date > acceptedDate || date < minDate) return null;
  return date;
}

export type ResolvedCallDate = {
  filenameDate: string | null;
  effectiveDate: string;
  dateSource: DateSourceValue;
  /** The operational reporting day (accepted date in the report time zone). */
  reportingDay: string;
};

export function resolveCallDate(
  filename: string,
  acceptedAt: Date,
  options: { timeZone: string; minDate: string },
): ResolvedCallDate {
  const reportingDay = zonedDate(acceptedAt, options.timeZone);
  const filenameDate = parseFilenameDate(filename, reportingDay, options.minDate);
  return {
    filenameDate,
    effectiveDate: filenameDate ?? reportingDay,
    dateSource: filenameDate ? 'FILENAME' : 'UPLOAD',
    reportingDay,
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant of a wall-clock time on a date in a time zone. */
export function zonedTimeToInstant(date: string, hour: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, hour);
  // Two passes settle the offset even across a DST change.
  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

export const READY_HOUR = 9;

/** 09:00 in the report time zone on the day after the call's operational reporting day. */
export function expectedReadyAt(acceptedAt: Date, timeZone: string): Date {
  return zonedTimeToInstant(addDays(zonedDate(acceptedAt, timeZone), 1), READY_HOUR, timeZone);
}
