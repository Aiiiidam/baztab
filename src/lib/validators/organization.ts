/**
 * Organization national ID (شناسه ملی اشخاص حقوقی): 11 digits whose last digit
 * is a check digit. This is not the 10-digit personal code in `./iran`; never
 * use one validator for the other.
 *
 * Identifiers are strings so leading zeros survive. Persian/Arabic digits,
 * spaces and hyphens are accepted on input and normalized away.
 */
import { normalizeDigits } from '@/lib/persian';

type Nullable<T> = T | null | undefined;

const WEIGHTS = [29, 27, 23, 19, 17] as const;

/** Latin-digit form with separators removed, or null when it is not 11 digits. */
export function normalizeOrganizationNationalId(input: Nullable<string>): string | null {
  const id = normalizeDigits(input).replace(/[\s-]/g, '');
  return /^\d{11}$/.test(id) ? id : null;
}

/**
 * Legal-entity check: d = tens digit (the 10th of 11) + 2; the check digit is
 * Σ (digitᵢ + d) × weight(i mod 5) over the first ten digits, mod 11, where a
 * remainder of 10 counts as 0. A run of six zeros after the three-digit prefix
 * is never issued, so it is rejected even if the sum happens to match.
 */
export function isValidOrganizationNationalId(input: Nullable<string>): boolean {
  const id = normalizeOrganizationNationalId(input);
  if (!id || /^(\d)\1*$/.test(id) || id.slice(3, 9) === '000000') return false;
  const digits = Array.from(id, Number);
  const d = digits[9] + 2;
  const sum = digits.slice(0, 10).reduce((acc, digit, i) => acc + (digit + d) * WEIGHTS[i % 5], 0);
  const remainder = sum % 11;
  return digits[10] === (remainder === 10 ? 0 : remainder);
}
