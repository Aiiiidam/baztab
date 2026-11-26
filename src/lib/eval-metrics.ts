import { normalizePersianChars, normalizeDigits } from '@/lib/persian';

/**
 * Evaluation metrics for the model screen (tech spec §8, plan M0-T2). Pure
 * functions shared by `scripts/eval/run.ts` and its unit tests.
 */

/**
 * Persian normalization agreed for WER: Persian/Arabic digits → Latin,
 * Arabic ي/ك → Persian ی/ک, diacritics and tatweel removed, ZWNJ treated as a
 * word joiner (removed), punctuation dropped, whitespace collapsed.
 */
export function normalizeForWer(text: string): string[] {
  return normalizePersianChars(normalizeDigits(text))
    .replace(/‌/g, '')
    .replace(/[.,!?؟،؛:;«»"'()[\]{}…\-–—]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate: word-level edit distance / reference length. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = normalizeForWer(reference);
  const hyp = normalizeForWer(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  let previous = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const current = [i];
    for (let j = 1; j <= hyp.length; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[hyp.length] / ref.length;
}

export type LabeledIssue = { categoryKey: string; outcome: string };

/** Per-call issue detection by category (distinct categories; a repeat counts once). */
export function issueDetection(expected: LabeledIssue[], predicted: LabeledIssue[]) {
  const want = new Set(expected.map((i) => i.categoryKey));
  const got = new Set(predicted.map((i) => i.categoryKey));
  const truePositives = [...got].filter((key) => want.has(key)).length;
  return { truePositives, predicted: got.size, expected: want.size };
}

/** Outcome agreement over categories both sides found. */
export function outcomeAgreement(expected: LabeledIssue[], predicted: LabeledIssue[]) {
  let compared = 0;
  let agreed = 0;
  for (const want of expected) {
    const got = predicted.find((p) => p.categoryKey === want.categoryKey);
    if (!got) continue;
    compared += 1;
    if (got.outcome === want.outcome) agreed += 1;
  }
  return { compared, agreed };
}

const POINTS: Record<string, number | null> = {
  MET: 2,
  PARTLY_MET: 1,
  NOT_MET: 0,
  INSUFFICIENT_EVIDENCE: null,
};

/** Exact and within-one agreement for one criterion; insufficient evidence must match exactly. */
export function criterionAgreement(expected: string, predicted: string) {
  const a = POINTS[expected];
  const b = POINTS[predicted];
  const exact = expected === predicted;
  const withinOne = exact || (a !== null && b !== null && Math.abs(a - b) <= 1);
  return { exact, withinOne };
}

export const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 1 : numerator / denominator;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
