import { describe, expect, it } from 'vitest';
import {
  addDays,
  expectedReadyAt,
  parseFilenameDate,
  resolveCallDate,
  zonedDate,
} from '@/lib/call-date';
import { formatCallDate } from '@/lib/format';

const TZ = 'Asia/Tehran';
const MIN = '2020-01-01';
const options = { timeZone: TZ, minDate: MIN };

describe('parseFilenameDate (tech spec §6)', () => {
  it.each([
    ['20261019.mp3', '2026-10-19'],
    ['20261019_093015_09121234567.mp3', '2026-10-19'],
    ['20261019-escalated.mp3', '2026-10-19'],
    ['20261019 تماس.mp3', '2026-10-19'],
    ['20200101x.mp3', '2020-01-01'],
    ['C:\\exports\\20261019.mp3', '2026-10-19'],
  ])('reads %s', (name, date) => {
    expect(parseFilenameDate(name, '2026-11-26', MIN)).toBe(date);
  });

  it.each([
    ['2026101912.mp3', 'followed by another digit'],
    ['202610191.mp3', 'nine digits'],
    ['20261301.mp3', 'month 13'],
    ['20260230.mp3', '30 February'],
    ['20230229.mp3', '29 February in a non-leap year'],
    ['20261127.mp3', 'after the accepted date'],
    ['20191231.mp3', 'before the minimum'],
    ['call_20261019.mp3', 'not leading'],
    ['تماس پشتیبانی.mp3', 'Persian name without a date'],
    ['۲۰۲۶۱۰۱۹.mp3', 'Persian digits (not a phone export)'],
    ['', 'empty'],
  ])('ignores %s (%s)', (name) => {
    expect(parseFilenameDate(name, '2026-11-26', MIN)).toBeNull();
  });

  it('accepts 29 February in a leap year and the accepted date itself', () => {
    expect(parseFilenameDate('20240229.mp3', '2026-11-26', MIN)).toBe('2024-02-29');
    expect(parseFilenameDate('20261126.mp3', '2026-11-26', MIN)).toBe('2026-11-26');
  });
});

describe('resolveCallDate', () => {
  it('uses the filename date and shows it in Jalali', () => {
    const resolved = resolveCallDate('20261019_1.mp3', new Date('2026-11-26T08:00:00Z'), options);
    expect(resolved).toEqual({
      filenameDate: '2026-10-19',
      effectiveDate: '2026-10-19',
      dateSource: 'FILENAME',
      reportingDay: '2026-11-26',
    });
    expect(formatCallDate('2026-10-19')).toBe('۱۴۰۵/۰۷/۲۷');
    expect(formatCallDate(new Date('2026-10-19T00:00:00Z'))).toBe('۱۴۰۵/۰۷/۲۷');
  });

  it('falls back to the upload day in Tehran when the name has no valid date', () => {
    const resolved = resolveCallDate('تماس.mp3', new Date('2026-11-26T08:00:00Z'), options);
    expect(resolved).toMatchObject({
      filenameDate: null,
      effectiveDate: '2026-11-26',
      dateSource: 'UPLOAD',
    });
  });

  it('judges "future" against the Tehran date, not UTC', () => {
    // 21:00 UTC on 26 Nov is 00:30 on 27 Nov in Tehran.
    const acceptedAt = new Date('2026-11-26T21:00:00Z');
    expect(resolveCallDate('20261127.mp3', acceptedAt, options).dateSource).toBe('FILENAME');
    expect(resolveCallDate('x.mp3', acceptedAt, options).effectiveDate).toBe('2026-11-27');
  });
});

describe('expectedReadyAt (tech spec §7)', () => {
  it('is 09:00 Tehran the next morning for an upload at 23:59:59', () => {
    // 23:59:59 Tehran on 26 Nov = 20:29:59 UTC.
    const ready = expectedReadyAt(new Date('2026-11-26T20:29:59Z'), TZ);
    expect(ready.toISOString()).toBe('2026-11-27T05:30:00.000Z');
  });

  it('moves to the following day for an upload at 00:00:00', () => {
    const ready = expectedReadyAt(new Date('2026-11-26T20:30:00Z'), TZ);
    expect(ready.toISOString()).toBe('2026-11-28T05:30:00.000Z');
  });

  it('crosses month and year ends', () => {
    expect(expectedReadyAt(new Date('2026-11-30T10:00:00Z'), TZ).toISOString()).toBe(
      '2026-12-01T05:30:00.000Z',
    );
    expect(expectedReadyAt(new Date('2026-12-31T12:00:00Z'), TZ).toISOString()).toBe(
      '2027-01-01T05:30:00.000Z',
    );
  });

  it('handles a zone with daylight saving time', () => {
    // New York switches to DST on 8 March 2026; 09:00 EDT = 13:00 UTC.
    expect(
      expectedReadyAt(new Date('2026-03-07T20:00:00Z'), 'America/New_York').toISOString(),
    ).toBe('2026-03-08T13:00:00.000Z');
  });
});

describe('date helpers', () => {
  it('zonedDate and addDays', () => {
    expect(zonedDate(new Date('2026-11-26T20:29:59Z'), TZ)).toBe('2026-11-26');
    expect(zonedDate(new Date('2026-11-26T20:30:00Z'), TZ)).toBe('2026-11-27');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});
