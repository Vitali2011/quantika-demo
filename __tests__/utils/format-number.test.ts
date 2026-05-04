import { formatNumber } from '@/lib/utils';

describe('formatNumber — locale-stable parity (γ-cleanup-2 F2)', () => {
  it('formats integers with en-US comma thousands', () => {
    expect(formatNumber(9500)).toBe('9,500');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats decimals with maxFractionDigits', () => {
    expect(formatNumber(9500.45, { maximumFractionDigits: 2 })).toBe('9,500.45');
    expect(formatNumber(9500.456, { maximumFractionDigits: 0 })).toBe('9,500');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('handles negative numbers', () => {
    expect(formatNumber(-1500)).toBe('-1,500');
  });

  it('handles NaN/undefined defensively', () => {
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(undefined as unknown as number)).toBe('0');
    expect(formatNumber(null as unknown as number)).toBe('0');
  });

  it('matches old toLocaleString("en-US") output for parity', () => {
    const n = 12345.67;
    expect(formatNumber(n)).toBe(n.toLocaleString('en-US'));
  });

  it('returns en-US format regardless of caller locale', () => {
    // formatNumber hardcodes 'en-US', so output is stable
    expect(formatNumber(9500)).toBe('9,500');
  });
});
