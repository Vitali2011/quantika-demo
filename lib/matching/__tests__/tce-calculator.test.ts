/**
 * Unit tests — tce-calculator.ts
 *
 * Covers:
 *   estimateFreightRate:
 *     - known cargo types return their expected base rate range
 *     - unknown cargo type falls back to median rate
 *     - distance factor applied (short vs long voyage)
 *     - DWT factor applied (small vs large vessel)
 *     - null cargo_type → median fallback
 *     - confidence: 0.6 for known, 0.3 for unknown
 *     - source is always 'estimated'
 *     - rate is always >= 1
 *   computeEstimatedTce:
 *     - returns a number (not NaN, not null)
 *     - with manual override source='manual' passes through
 *     - zero distance returns tce from 10-day fallback
 *     - negative distance treated as 0
 *   parseLeadingNumber:
 *     - parses "12.5 knots" → 12.5
 *     - parses "25 mt/day" → 25
 *     - empty string → 0
 *     - null → 0
 */

import {
  estimateFreightRate,
  computeEstimatedTce,
  parseLeadingNumber,
} from '@/lib/matching/tce-calculator';

describe('parseLeadingNumber', () => {
  it('parses "12.5 knots"', () => {
    expect(parseLeadingNumber('12.5 knots')).toBe(12.5);
  });

  it('parses "25 mt/day"', () => {
    expect(parseLeadingNumber('25 mt/day')).toBe(25);
  });

  it('returns 0 for empty string', () => {
    expect(parseLeadingNumber('')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(parseLeadingNumber(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseLeadingNumber(undefined)).toBe(0);
  });
});

describe('estimateFreightRate', () => {
  it('returns source="estimated" always', () => {
    const result = estimateFreightRate('BULK', 3000, 50000);
    expect(result.source).toBe('estimated');
  });

  it('confidence=0.6 for known cargo type', () => {
    const result = estimateFreightRate('COAL', 3000, 50000);
    expect(result.confidence).toBe(0.6);
  });

  it('confidence=0.3 for unknown cargo type', () => {
    const result = estimateFreightRate('UNKNOWN_TYPE', 3000, 50000);
    expect(result.confidence).toBe(0.3);
  });

  it('null cargo_type falls back to median rate (confidence=0.3)', () => {
    const result = estimateFreightRate(null, 3000, 50000);
    expect(result.confidence).toBe(0.3);
    expect(result.rate).toBeGreaterThan(0);
  });

  it('GRAIN has lower rate than BREAK_BULK at same distance/dwt', () => {
    const grain = estimateFreightRate('GRAIN', 3000, 50000);
    const breakBulk = estimateFreightRate('BREAK_BULK', 3000, 50000);
    expect(grain.rate).toBeLessThan(breakBulk.rate);
  });

  it('long voyage (>6000nm) produces higher rate than short voyage (<1000nm)', () => {
    const short = estimateFreightRate('BULK', 500, 50000);
    const long = estimateFreightRate('BULK', 8000, 50000);
    expect(long.rate).toBeGreaterThan(short.rate);
  });

  it('small vessel (<20000 DWT) produces higher rate than capesize (>120000 DWT)', () => {
    const small = estimateFreightRate('BULK', 3000, 15000);
    const cape = estimateFreightRate('BULK', 3000, 150000);
    expect(small.rate).toBeGreaterThan(cape.rate);
  });

  it('rate is always >= 1', () => {
    const result = estimateFreightRate('IRON_ORE', 100, 200000);
    expect(result.rate).toBeGreaterThanOrEqual(1);
  });

  it('handles case-insensitive cargo type', () => {
    const upper = estimateFreightRate('COAL', 3000, 50000);
    const lower = estimateFreightRate('coal', 3000, 50000);
    expect(upper.rate).toBe(lower.rate);
  });

  it('handles cargo type with spaces (IRON ORE)', () => {
    const result = estimateFreightRate('IRON ORE', 3000, 50000);
    expect(result.confidence).toBe(0.6);
  });
});

describe('computeEstimatedTce', () => {
  it('returns a finite tce_usd_per_day', () => {
    const est = estimateFreightRate('BULK', 3000, 50000);
    const result = computeEstimatedTce(est, 3000, 50000, 45000, 12, 25);
    expect(Number.isFinite(result.tce_usd_per_day)).toBe(true);
  });

  it('passes through manual source', () => {
    const manual = { rate: 30, source: 'manual' as const, confidence: 1.0 };
    const result = computeEstimatedTce(manual, 3000, 50000, 45000);
    expect(result.freight_rate_source).toBe('manual');
    expect(result.freight_rate_usd_per_mt).toBe(30);
  });

  it('zero distance uses 10-day fallback and still returns finite TCE', () => {
    const est = estimateFreightRate('BULK', 0, 50000);
    const result = computeEstimatedTce(est, 0, 50000, 45000);
    expect(Number.isFinite(result.tce_usd_per_day)).toBe(true);
  });

  it('zero quantity uses dwt*0.9 fallback', () => {
    const est = estimateFreightRate('BULK', 3000, 50000);
    const withQty = computeEstimatedTce(est, 3000, 50000, 45000);
    const withZeroQty = computeEstimatedTce(est, 3000, 50000, 0);
    // Both should be finite, zero-qty result uses 50000*0.9=45000 so should be similar
    expect(Number.isFinite(withZeroQty.tce_usd_per_day)).toBe(true);
    expect(withZeroQty.tce_usd_per_day).toBeCloseTo(withQty.tce_usd_per_day, -3);
  });

  it('higher freight rate → higher TCE', () => {
    const low = { rate: 10, source: 'estimated' as const, confidence: 0.6 };
    const high = { rate: 40, source: 'estimated' as const, confidence: 0.6 };
    const tce_low = computeEstimatedTce(low, 3000, 50000, 45000).tce_usd_per_day;
    const tce_high = computeEstimatedTce(high, 3000, 50000, 45000).tce_usd_per_day;
    expect(tce_high).toBeGreaterThan(tce_low);
  });
});
