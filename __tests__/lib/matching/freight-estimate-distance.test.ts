import { estimateFreightRate } from '@/lib/matching/tce-calculator';

describe('estimateFreightRate distanceFactor (honesty fix #819)', () => {
  test('short route (<1000nm) is no longer depressed to 0.7×', () => {
    // GRAIN base = 18, dwtFactor(3000)=1.4
    // BEFORE: 18 * 0.7 * 1.4 = 17.64  AFTER: 18 * 1.0 * 1.4 = 25.20
    const r = estimateFreightRate('GRAIN', 400, 3000);
    expect(r.rate).toBeGreaterThanOrEqual(25);
    expect(r.rate).toBeLessThan(27);
  });
  test('mid-distance bucket (1000–3000nm) unchanged at parity with short', () => {
    const r = estimateFreightRate('GRAIN', 2000, 3000);
    // 18 * 1.0 * 1.4 = 25.20
    expect(r.rate).toBeCloseTo(25.20, 1);
  });
  test('long-haul (>=6000nm) unchanged at 1.6×', () => {
    const r = estimateFreightRate('GRAIN', 7000, 60000);
    // 18 * 1.6 * 1.0 (dwt 60k bucket) = 28.80
    expect(r.rate).toBeCloseTo(28.80, 1);
  });
});
