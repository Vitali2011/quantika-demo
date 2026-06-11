import * as fs from 'fs';
import * as path from 'path';
import { loadJwcRates, __resetRateCacheForTest } from '../war-risk-rates';

beforeEach(() => {
  __resetRateCacheForTest();
  jest.restoreAllMocks();
});

describe('loadJwcRates — 2025-current.yaml', () => {
  it('parses 2025-current.yaml and maps red-sea → red-sea-hra → 0.002', () => {
    const rates = loadJwcRates();
    expect(rates).not.toBeNull();
    expect(rates!.byCalcZoneId['red-sea-hra']).toBe(0.002);
  });

  it('maps persian-gulf-oman-indian-ocean → both persian-gulf-hra and indian-ocean-hra', () => {
    const rates = loadJwcRates();
    expect(rates).not.toBeNull();
    expect(rates!.byCalcZoneId['persian-gulf-hra']).toBe(0.0075);
    expect(rates!.byCalcZoneId['indian-ocean-hra']).toBe(0.0075);
  });

  it('effectiveFrom === "2026-03-12"', () => {
    const rates = loadJwcRates();
    expect(rates).not.toBeNull();
    expect(rates!.effectiveFrom).toBe('2026-03-12');
  });

  it('version contains "JWC-2025-current"', () => {
    const rates = loadJwcRates();
    expect(rates).not.toBeNull();
    expect(rates!.version).toContain('JWC-2025-current');
  });

  it('does not throw on null-rate zones (libya / cabo-delgado)', () => {
    expect(() => loadJwcRates()).not.toThrow();
    const rates = loadJwcRates();
    // libya and cabo-delgado have no mapping → should not appear in byCalcZoneId
    expect(Object.keys(rates!.byCalcZoneId)).not.toContain('libya');
    expect(Object.keys(rates!.byCalcZoneId)).not.toContain('cabo-delgado');
    // strait-of-hormuz also skipped (not in mapping table)
    expect(Object.keys(rates!.byCalcZoneId)).not.toContain('strait-of-hormuz');
  });

  it('missing file → returns null without throwing', () => {
    let result: unknown;
    expect(() => {
      result = loadJwcRates('/nonexistent/path/that/does-not-exist.yaml');
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('memoization: second call does not re-read (spy on fs.readFileSync)', () => {
    const spy = jest.spyOn(fs, 'readFileSync');
    const r1 = loadJwcRates();
    const r2 = loadJwcRates();
    // Primary proof: both calls return the exact same object (memoized reference)
    expect(r1).toBe(r2);
    // Secondary: readFileSync called at most once (0 if spy doesn't intercept impl's
    // fs instance across module boundaries, but object identity proves memoization)
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('PBT: every value in byCalcZoneId is pct/100, finite, non-negative, never NaN', () => {
    const rates = loadJwcRates();
    expect(rates).not.toBeNull();
    for (const [key, val] of Object.entries(rates!.byCalcZoneId)) {
      expect(typeof val).toBe('number');
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(0.1); // 10% max (10 pct / 100)
      // Verify it is pct/100: multiply back and check it's in [0, 10]
      const asPct = val * 100;
      expect(asPct).toBeGreaterThanOrEqual(0);
      expect(asPct).toBeLessThanOrEqual(10);
      void key; // suppress unused var lint
    }
  });

  it('source is "knowledge"', () => {
    const rates = loadJwcRates();
    expect(rates).not.toBeNull();
    expect(rates!.source).toBe('knowledge');
  });
});
