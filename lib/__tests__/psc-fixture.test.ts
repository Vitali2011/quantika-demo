/**
 * Validates structural invariants of the PSC fixture so the demo doesn't
 * drift into impossible shapes (bad IMO format, unknown authority, runaway
 * detention ratio, etc.). Schema fields must stay aligned with
 * lib/migrations/028-psc-history.ts.
 */
import { PSC_FIXTURE, PSC_FIXTURE_IMOS } from '../knowledge/sources/psc/fixture';
import ciiData from '../sample-data/imo/cii.json';

const VALID_AUTHORITIES = new Set(['paris-mou', 'tokyo-mou', 'uscg', 'other']);
const ALLOWED_IMOS = new Set<string>(ciiData.records.map((r) => r.imo));

describe('PSC_FIXTURE', () => {
  it('contains 15-20 records', () => {
    expect(PSC_FIXTURE.length).toBeGreaterThanOrEqual(15);
    expect(PSC_FIXTURE.length).toBeLessThanOrEqual(20);
  });

  it('spans 3-5 unique IMOs', () => {
    const imos = new Set(PSC_FIXTURE.map((r) => r.imo));
    expect(imos.size).toBeGreaterThanOrEqual(3);
    expect(imos.size).toBeLessThanOrEqual(5);
  });

  it('declares the same IMO set in PSC_FIXTURE_IMOS', () => {
    const inFixture = new Set(PSC_FIXTURE.map((r) => r.imo));
    expect(new Set(PSC_FIXTURE_IMOS)).toEqual(inFixture);
  });

  it('uses IMOs that already appear in the demo CII dataset', () => {
    for (const imo of PSC_FIXTURE_IMOS) {
      expect(ALLOWED_IMOS.has(imo)).toBe(true);
    }
  });

  it('uses 7-digit IMO numbers', () => {
    for (const rec of PSC_FIXTURE) {
      expect(rec.imo).toMatch(/^\d{7}$/);
    }
  });

  it('uses only schema-valid authorities', () => {
    for (const rec of PSC_FIXTURE) {
      expect(VALID_AUTHORITIES.has(rec.authority)).toBe(true);
    }
  });

  it('uses ISO-style YYYY-MM-DD inspection_date', () => {
    for (const rec of PSC_FIXTURE) {
      expect(rec.inspection_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Date constructor accepts the format and yields a real date
      const parsed = new Date(rec.inspection_date);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
    }
  });

  it('keeps inspection dates within a 24-month span', () => {
    const times = PSC_FIXTURE.map((r) => new Date(r.inspection_date).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    const spanMs = max - min;
    const twentyFourMonthsMs = 24 * 31 * 24 * 60 * 60 * 1000;
    expect(spanMs).toBeLessThanOrEqual(twentyFourMonthsMs);
  });

  it('keeps detained ratio ≤ 30%', () => {
    const detainedCount = PSC_FIXTURE.filter((r) => r.detained).length;
    const ratio = detainedCount / PSC_FIXTURE.length;
    expect(ratio).toBeLessThanOrEqual(0.3);
  });

  it('uses non-negative finite deficiencies counts', () => {
    for (const rec of PSC_FIXTURE) {
      expect(Number.isFinite(rec.deficiencies)).toBe(true);
      expect(rec.deficiencies).toBeGreaterThanOrEqual(0);
    }
  });

  it('has unique ids per record (idempotency hinges on this)', () => {
    const ids = PSC_FIXTURE.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses at least 3 distinct ports', () => {
    const ports = new Set(PSC_FIXTURE.map((r) => r.port).filter(Boolean));
    expect(ports.size).toBeGreaterThanOrEqual(3);
  });
});
