import { fmtOpenDate } from '@/lib/vessels-utils';

describe('fmtOpenDate', () => {
  it('returns null for null field', () => {
    expect(fmtOpenDate(null)).toBeNull();
  });

  it('returns null for undefined field', () => {
    expect(fmtOpenDate(undefined)).toBeNull();
  });

  it('returns plain string value as-is', () => {
    expect(fmtOpenDate({ value: '2026-05-22', confidence: 'confirmed' })).toBe('2026-05-22');
  });

  it('returns null for empty string value', () => {
    expect(fmtOpenDate({ value: '', confidence: 'confirmed' })).toBeNull();
  });

  it('returns display from {open, close, display} object — primary display field', () => {
    const field = {
      value: { open: '2026-05-10', close: '2026-05-12', display: '10/12 May' } as unknown as string,
      confidence: 'interpreted' as const,
    };
    expect(fmtOpenDate(field)).toBe('10/12 May');
  });

  it('falls back to open when display is null', () => {
    const field = {
      value: { open: '2026-05-10', close: '2026-05-12', display: null } as unknown as string,
      confidence: 'interpreted' as const,
    };
    expect(fmtOpenDate(field)).toBe('2026-05-10');
  });

  it('returns null when display and open are both null', () => {
    const field = {
      value: { open: null, close: null, display: null } as unknown as string,
      confidence: 'uncertain' as const,
    };
    expect(fmtOpenDate(field)).toBeNull();
  });

  it('handles spot/display-only object (no year case)', () => {
    const field = {
      value: { open: null, close: null, display: 'spot' } as unknown as string,
      confidence: 'confirmed' as const,
    };
    expect(fmtOpenDate(field)).toBe('spot');
  });
});
