import { fmtTce } from '../fmt-tce';

describe('fmtTce — B18e sign placement', () => {
  it('returns em-dash for null', () => {
    expect(fmtTce(null)).toBe('—');
  });

  it('formats positive value correctly', () => {
    expect(fmtTce(800)).toBe('$0.8k');
  });

  it('puts minus BEFORE dollar for negative (B18e)', () => {
    expect(fmtTce(-800)).toBe('-$0.8k');
  });

  it('formats zero without minus sign', () => {
    expect(fmtTce(0)).not.toContain('-');
    expect(fmtTce(0)).toBe('$0.0k');
  });

  it('formats larger values correctly', () => {
    expect(fmtTce(15000)).toBe('$15.0k');
    expect(fmtTce(-15000)).toBe('-$15.0k');
  });
});
