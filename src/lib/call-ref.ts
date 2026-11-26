import { normalizeDigits } from '@/lib/persian';

/**
 * Short call reference shown in the UI for search and support (tech spec §5):
 * the last eight characters of the opaque call ID, upper-cased. Persian digits
 * typed in a search box are normalized before matching.
 */
export const CALL_REF_LENGTH = 8;

export function callRef(callId: string): string {
  return callId.slice(-CALL_REF_LENGTH).toUpperCase();
}

/** The lower-case ID suffix a search term stands for, or null when it cannot be a reference. */
export function refSearchSuffix(term: string): string | null {
  const value = normalizeDigits(term).trim().toLowerCase();
  return /^[a-z0-9]{4,8}$/.test(value) ? value : null;
}
