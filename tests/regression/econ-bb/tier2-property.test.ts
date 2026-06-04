import { resolveFreightRate } from '@/lib/matching/freight-resolver';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';

function rint(lo: number, hi: number): number {
  return Math.floor(lo + Math.random() * (hi - lo));
}

describe('Tier-2 RT-denom property check (100 randomized routes)', () => {
  it('rate is always finite, > $1/mt, < $200/mt (covers thin parcels), and non-negative', () => {
    for (let i = 0; i < 100; i++) {
      const distanceNm = rint(3000, 12000);
      const quantityMt = rint(20000, 90000);
      const usdPerDay = rint(5000, 25000);
      const speedKts = rint(10, 14);
      const r = resolveFreightRate({
        cargoType: 'GRAIN',
        vesselDwt: 50000,
        quantityMt,
        distanceNm,
        speedKts,
        balticDayRate: { usdPerDay, date: '2026-01-01', indexCode: 'BSI_TC' },
      });
      expect(r.source).toBe('baltic');
      expect(Number.isFinite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThan(1);
      expect(r.value).toBeLessThan(200);
      expect(r.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('quantityMt=0 falls through to estimate (not divide-by-zero / Infinity)', () => {
    const r = resolveFreightRate({
      cargoType: 'GRAIN',
      vesselDwt: 50000,
      quantityMt: 0,
      distanceNm: 5000,
      speedKts: 12,
      balticDayRate: { usdPerDay: 15000, date: '2026-01-01', indexCode: 'BSI_TC' },
    });
    expect(r.source).toBe('estimated');
    expect(Number.isFinite(r.value)).toBe(true);
  });

  it('Baltic usdPerDay <= 0 falls through to estimate', () => {
    const r1 = resolveFreightRate({
      cargoType: 'GRAIN', vesselDwt: 50000, quantityMt: 30000, distanceNm: 5000, speedKts: 12,
      balticDayRate: { usdPerDay: 0, date: '2026-01-01', indexCode: 'BSI_TC' },
    });
    const r2 = resolveFreightRate({
      cargoType: 'GRAIN', vesselDwt: 50000, quantityMt: 30000, distanceNm: 5000, speedKts: 12,
      balticDayRate: { usdPerDay: -100, date: '2026-01-01', indexCode: 'BSI_TC' },
    });
    expect(r1.source).toBe('estimated');
    expect(r2.source).toBe('estimated');
  });

  it('representative supramax: 3500nm/40000mt/12500 $/day → positive plausible rate', () => {
    const r = resolveFreightRate({
      cargoType: 'GRAIN', vesselDwt: 50000, quantityMt: 40000, distanceNm: 3500, speedKts: 13,
      balticDayRate: { usdPerDay: 12500, date: '2026-01-01', indexCode: 'BSI_TC' },
    });
    const ladenDays = estimateVoyageDays(3500, 13);
    const expected = Math.round(12500 * (ladenDays * 2 + 2) / 40000 * 100) / 100;
    expect(r.value).toBe(expected);
    expect(r.value).toBeGreaterThan(1);
    expect(r.source).toBe('baltic');
  });

  it('SHORT high-cost: 1500nm/10000mt/8000 $/day → finite, no blow-up', () => {
    const r = resolveFreightRate({
      cargoType: 'GRAIN', vesselDwt: 30000, quantityMt: 10000, distanceNm: 1500, speedKts: 12,
      balticDayRate: { usdPerDay: 8000, date: '2026-01-01', indexCode: 'BHSI_TC' },
    });
    expect(r.source).toBe('baltic');
    expect(Number.isFinite(r.value)).toBe(true);
    expect(r.value).toBeGreaterThan(1);
    expect(r.value).toBeLessThan(100);
  });
});
