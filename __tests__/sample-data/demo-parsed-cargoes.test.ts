/**
 * wave-γ-3-demo: unit tests for resolveDemoParsedCargoes loader.
 *
 * Tests:
 * 1. date resolution: +Nd offsets → ISO dates based on `now`
 * 2. schema parity: all returned records satisfy ParsedCargo shape
 * 3. no mutation of the fixture JSON
 */

import { resolveDemoParsedCargoes } from '@/lib/sample-data/demo-parsed-cargoes';
import type { ParsedCargo } from '@/lib/types';

const NOW = new Date('2026-05-10T00:00:00.000Z');

describe('resolveDemoParsedCargoes — date resolution', () => {
  it('returns an array of 4-5 records', () => {
    const result = resolveDemoParsedCargoes(NOW);
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('resolves +Nd offsets to ISO date strings relative to now', () => {
    const result = resolveDemoParsedCargoes(NOW);
    // Every record with a non-null laycan must have dates >= now (it's laycan start,
    // should be future relative to seed time)
    for (const cargo of result) {
      if (cargo.laycan !== null) {
        // laycan format: "YYYY-MM-DD .. YYYY-MM-DD"
        expect(cargo.laycan).toMatch(/^\d{4}-\d{2}-\d{2} \.\. \d{4}-\d{2}-\d{2}$/);
        const [startStr, endStr] = cargo.laycan.split(' .. ');
        const start = new Date(startStr);
        const end = new Date(endStr);
        expect(end.getTime()).toBeGreaterThanOrEqual(start.getTime());
        // Start should be at or after NOW
        expect(start.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
      }
    }
  });

  it('uses the provided now date, not the current date', () => {
    const now1 = new Date('2026-05-10T00:00:00.000Z');
    const now2 = new Date('2026-06-01T00:00:00.000Z');
    const result1 = resolveDemoParsedCargoes(now1);
    const result2 = resolveDemoParsedCargoes(now2);

    // Laycans should differ when seed date differs
    const laycans1 = result1.map(c => c.laycan).filter(Boolean);
    const laycans2 = result2.map(c => c.laycan).filter(Boolean);
    expect(laycans1).not.toEqual(laycans2);
  });

  it('does not mutate the fixture JSON between calls', () => {
    const result1 = resolveDemoParsedCargoes(NOW);
    const result2 = resolveDemoParsedCargoes(NOW);
    // Both calls return the same resolved dates
    expect(result1.map(c => c.laycan)).toEqual(result2.map(c => c.laycan));
  });
});

describe('resolveDemoParsedCargoes — schema parity with ParsedCargo', () => {
  let result: ParsedCargo[];

  beforeAll(() => {
    result = resolveDemoParsedCargoes(NOW);
  });

  it('each record has required string fields: emailId, itemIndex, cargoType', () => {
    for (const cargo of result) {
      expect(typeof cargo.emailId).toBe('string');
      expect(cargo.emailId.length).toBeGreaterThan(0);
      expect(typeof cargo.itemIndex).toBe('number');
      expect(typeof cargo.cargoType).toBe('string');
    }
  });

  it('each record has missingInfo as an array', () => {
    for (const cargo of result) {
      expect(Array.isArray(cargo.missingInfo)).toBe(true);
    }
  });

  it('each emailId matches a real cargo-inquiry ID (sample-01 through sample-05)', () => {
    const validIds = new Set(['sample-01', 'sample-02', 'sample-03', 'sample-04', 'sample-05']);
    for (const cargo of result) {
      expect(validIds.has(cargo.emailId)).toBe(true);
    }
  });

  it('cargoType is a valid CargoType enum value', () => {
    const validTypes = new Set(['FCL', 'LCL', 'BREAK_BULK', 'BULK', 'PROJECT', 'AIR', 'RORO', 'OTHER']);
    for (const cargo of result) {
      expect(validTypes.has(cargo.cargoType)).toBe(true);
    }
  });
});
