import { describe, expect, it } from 'vitest';
import { callRef, refSearchSuffix } from '@/lib/call-ref';
import { parseRange } from '@/lib/http-range';
import { readyTimeMessage } from '@/lib/ready-time';
import { scoreTotal } from '@/lib/validations/analysis';
import {
  InvalidOutputError,
  validateAnalysis,
  validateTranscript,
} from '@/services/inference/validate';

describe('parseRange (tech spec §6)', () => {
  it.each([
    [null, { kind: 'none' }],
    ['bytes=0-99', { kind: 'range', start: 0, end: 99 }],
    ['bytes=100-', { kind: 'range', start: 100, end: 999 }],
    ['bytes=-100', { kind: 'range', start: 900, end: 999 }],
    ['bytes=900-5000', { kind: 'range', start: 900, end: 999 }],
    ['bytes=1000-', { kind: 'unsatisfiable' }],
    ['bytes=50-10', { kind: 'unsatisfiable' }],
    ['bytes=-', { kind: 'unsatisfiable' }],
    ['bytes=0-1,5-9', { kind: 'none' }],
    ['items=0-1', { kind: 'none' }],
  ])('%s', (header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected);
  });
});

describe('scoreTotal (pilot scale)', () => {
  it('totals out of six only when all three are assessed', () => {
    expect(scoreTotal(['MET', 'MET', 'MET'])).toBe(6);
    expect(scoreTotal(['MET', 'PARTLY_MET', 'NOT_MET'])).toBe(3);
    expect(scoreTotal(['MET', 'MET', 'INSUFFICIENT_EVIDENCE'])).toBeNull();
    expect(scoreTotal(['MET', 'MET'])).toBeNull();
  });
});

describe('validateAnalysis (tech spec §8)', () => {
  const segments = [
    { speaker: 'AGENT' as const },
    { speaker: 'CUSTOMER' as const },
    { speaker: 'UNKNOWN' as const },
  ];
  const keys = new Set(['otp_not_received']);
  const met = (evidence: string[]) => ({ rating: 'MET', explanation: 'x', evidence });
  const base = {
    schemaVersion: '1',
    reason: { text: 'دلیل', evidence: ['s1'] },
    issues: [
      {
        summary: 'کد نمی‌رسد',
        categoryKey: 'otp_not_received',
        outcome: 'UNRESOLVED',
        outcomeExplanation: null,
        evidence: ['s1', 's1'],
        outcomeEvidence: [],
      },
    ],
    scores: { UNDERSTANDING: met(['s0']), CORRECT_ACTION: met(['s0']), CLEAR_CLOSURE: met(['s0']) },
  };

  it('accepts valid output, dedupes evidence and computes eligibility', () => {
    const result = validateAnalysis(base, segments, keys);
    expect(result.findings[0]).toMatchObject({
      evidence: [1],
      eligible: true,
      categoryKey: 'otp_not_received',
    });
    expect(result.scores.map((s) => s.rating)).toEqual(['MET', 'MET', 'MET']);
  });

  it('rejects invented evidence and unknown fields', () => {
    expect(() =>
      validateAnalysis({ ...base, reason: { text: 'x', evidence: ['s9'] } }, segments, keys),
    ).toThrow(InvalidOutputError);
    expect(() => validateAnalysis({ ...base, extra: 1 }, segments, keys)).toThrow(
      InvalidOutputError,
    );
    expect(() =>
      validateAnalysis(
        { ...base, issues: [{ ...base.issues[0], outcome: 'ESCALATED' }] },
        segments,
        keys,
      ),
    ).toThrow(InvalidOutputError);
  });

  it('keeps an unknown category as uncategorized and ineligible', () => {
    const result = validateAnalysis(
      { ...base, issues: [{ ...base.issues[0], categoryKey: 'printer' }] },
      segments,
      keys,
    );
    expect(result.findings[0]).toMatchObject({ categoryKey: null, eligible: false });
  });

  it('rates a criterion without agent evidence as insufficient', () => {
    const result = validateAnalysis(
      { ...base, scores: { ...base.scores, CLEAR_CLOSURE: met(['s1', 's2']) } },
      segments,
      keys,
    );
    expect(result.scores[2]).toMatchObject({ rating: 'INSUFFICIENT_EVIDENCE', evidence: [] });
  });

  it('checks transcript timing against the recording', () => {
    const ok = [{ startMs: 0, endMs: 900, speaker: 'AGENT' as const, text: 'سلام' }];
    expect(() => validateTranscript(ok, 1000)).not.toThrow();
    expect(() => validateTranscript([{ ...ok[0], endMs: 5000 }], 1000)).toThrow(InvalidOutputError);
    expect(() => validateTranscript([{ ...ok[0], text: ' ' }], 1000)).toThrow(InvalidOutputError);
  });
});

describe('call references and ready time', () => {
  it('derives a short reference and accepts Persian digits in search', () => {
    expect(callRef('cmwxv7mdx0004k5j8omkjshbw')).toBe('8OMKJSHBW'.slice(-8));
    expect(refSearchSuffix('۰۰۴K')).toBe('004k');
    expect(refSearchSuffix('a b')).toBeNull();
  });

  it('says فردا for tomorrow and warns when overdue', () => {
    const now = new Date('2026-11-26T10:00:00Z');
    expect(readyTimeMessage('2026-11-27T05:30:00Z', now)).toBe(
      'نتایج تا ساعت ۹ صبح فردا، ۱۴۰۵/۰۹/۰۶، آماده می‌شود',
    );
    expect(readyTimeMessage('2026-11-26T05:30:00Z', now)).toContain('بیش از زمان پیش‌بینی‌شده');
  });
});
