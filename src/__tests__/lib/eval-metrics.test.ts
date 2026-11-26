import { describe, expect, it } from 'vitest';
import {
  criterionAgreement,
  issueDetection,
  median,
  normalizeForWer,
  outcomeAgreement,
  wordErrorRate,
} from '@/lib/eval-metrics';

describe('Persian WER', () => {
  it('normalizes digits, Arabic letters, ZWNJ and punctuation before comparing', () => {
    expect(normalizeForWer('كد تأييد ۱۲۳، نمی‌رسد!')).toEqual(['کد', 'تأیید', '123', 'نمیرسد']);
    expect(wordErrorRate('کد تأیید نمی‌رسد', 'كد تأييد نميرسد')).toBe(0);
  });

  it('counts substitutions, insertions and deletions against the reference', () => {
    expect(wordErrorRate('یک دو سه چهار', 'یک دو سه چهار')).toBe(0);
    expect(wordErrorRate('یک دو سه چهار', 'یک سه چهار')).toBe(0.25);
    expect(wordErrorRate('یک دو', 'یک دو سه چهار')).toBe(1);
    expect(wordErrorRate('', '')).toBe(0);
  });
});

describe('issue and outcome agreement', () => {
  const expected = [
    { categoryKey: 'otp_not_received', outcome: 'UNRESOLVED' },
    { categoryKey: 'login_failed', outcome: 'RESOLVED' },
  ];

  it('detects issues by distinct category', () => {
    const predicted = [
      { categoryKey: 'otp_not_received', outcome: 'RESOLVED' },
      { categoryKey: 'otp_not_received', outcome: 'RESOLVED' },
      { categoryKey: 'app_error', outcome: 'UNKNOWN' },
    ];
    expect(issueDetection(expected, predicted)).toEqual({
      truePositives: 1,
      predicted: 2,
      expected: 2,
    });
    expect(outcomeAgreement(expected, predicted)).toEqual({ compared: 1, agreed: 0 });
  });

  it('scores criteria exactly and within one point', () => {
    expect(criterionAgreement('MET', 'MET')).toEqual({ exact: true, withinOne: true });
    expect(criterionAgreement('MET', 'PARTLY_MET')).toEqual({ exact: false, withinOne: true });
    expect(criterionAgreement('MET', 'NOT_MET')).toEqual({ exact: false, withinOne: false });
    expect(criterionAgreement('INSUFFICIENT_EVIDENCE', 'NOT_MET')).toEqual({
      exact: false,
      withinOne: false,
    });
  });

  it('medians', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
