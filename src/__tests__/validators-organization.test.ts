import { describe, expect, it } from 'vitest';
import {
  isValidOrganizationNationalId,
  normalizeOrganizationNationalId,
} from '@/lib/validators/organization';
import { isValidNationalId } from '@/lib/validators/iran';

describe('isValidOrganizationNationalId', () => {
  it.each(['10380284790', '14006278561', '10862059635'])('accepts %s', (id) => {
    expect(isValidOrganizationNationalId(id)).toBe(true);
  });

  it('accepts Persian digits and separators', () => {
    expect(isValidOrganizationNationalId('۱۰۳۸۰۲۸۴۷۹۰')).toBe(true);
    expect(isValidOrganizationNationalId('103-8028479-0')).toBe(true);
    expect(isValidOrganizationNationalId(' 1038 0284 790 ')).toBe(true);
  });

  it('keeps leading zeros (identifiers are strings)', () => {
    expect(isValidOrganizationNationalId('01234567893')).toBe(true);
    expect(normalizeOrganizationNationalId('۰۱۲۳۴۵۶۷۸۹۳')).toBe('01234567893');
  });

  it.each(['10380284791', '10380284799', '14006278560'])(
    'rejects a wrong check digit: %s',
    (id) => {
      expect(isValidOrganizationNationalId(id)).toBe(false);
    },
  );

  it('rejects a 10-digit personal national code, even a valid one', () => {
    expect(isValidNationalId('0013542419')).toBe(true);
    expect(isValidOrganizationNationalId('0013542419')).toBe(false);
  });

  it('rejects repeated digits and an all-zero middle block', () => {
    expect(isValidOrganizationNationalId('00000000000')).toBe(false);
    expect(isValidOrganizationNationalId('11111111111')).toBe(false);
    expect(isValidOrganizationNationalId('00043812303'.replace('438123', '000000'))).toBe(false);
  });

  it('rejects wrong lengths, letters and nullish input', () => {
    expect(isValidOrganizationNationalId('103802847900')).toBe(false);
    expect(isValidOrganizationNationalId('1038028479')).toBe(false);
    expect(isValidOrganizationNationalId('1038028479a')).toBe(false);
    expect(isValidOrganizationNationalId('')).toBe(false);
    expect(isValidOrganizationNationalId(null)).toBe(false);
    expect(isValidOrganizationNationalId(undefined)).toBe(false);
    expect(normalizeOrganizationNationalId('123')).toBeNull();
  });
});
