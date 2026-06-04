/**
 * Unit tests — freight-resolver.ts (Wave #7, L2 #7)
 *
 * resolveFreightRate is a PURE 4-tier priority waterfall:
 *   0 manual  (sticky broker override)        → confidence 1.0   → 'manual'
 *   1 parsed  (cargo.freightRateUsd, $/mt)     → confidence 0.9   → 'parsed'
 *   2 baltic  (per-class $/day × days ÷ tonnes)→ confidence 0.5   → 'baltic'
 *   3 estimate(existing estimateFreightRate)   → confidence 0.3-0.6 'estimated'
 *
 * Priority: a higher tier always wins when its input is valid. Invalid/absent
 * input at a tier falls through to the next. estimate is the always-present floor.
 */

import { resolveFreightRate, type ResolveFreightInput } from '@/lib/matching/freight-resolver';
import { estimateFreightRate } from '@/lib/matching/tce-calculator';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';

const base: ResolveFreightInput = {
  cargoType: 'GRAIN',
  vesselDwt: 50000,
  quantityMt: 45000,
  distanceNm: 3000,
  speedKts: 12,
};

const balticInput = { usdPerDay: 13500, date: '2026-05-09', indexCode: 'BSI_TC' };

describe('resolveFreightRate — tier priority', () => {
  it('tier 0: manual beats every other tier', () => {
    const r = resolveFreightRate({
      ...base,
      manualRateUsdPerMt: 31,
      parsedFreightRateUsdPerMt: 18,
      balticDayRate: balticInput,
    });
    expect(r.source).toBe('manual');
    expect(r.value).toBe(31);
    expect(r.confidence).toBe(1.0);
  });

  it('tier 1: parsed beats baltic + estimate (no manual)', () => {
    const r = resolveFreightRate({
      ...base,
      parsedFreightRateUsdPerMt: 18,
      balticDayRate: balticInput,
    });
    expect(r.source).toBe('parsed');
    expect(r.value).toBe(18);
    expect(r.confidence).toBe(0.9);
  });

  it('tier 2: baltic beats estimate (no manual/parsed)', () => {
    const r = resolveFreightRate({ ...base, balticDayRate: balticInput });
    expect(r.source).toBe('baltic');
    expect(r.balticDate).toBe('2026-05-09');
    expect(r.confidence).toBe(0.5);
  });

  it('tier 3: estimate is the fallback floor', () => {
    const r = resolveFreightRate(base);
    expect(r.source).toBe('estimated');
    const est = estimateFreightRate(base.cargoType, base.distanceNm, base.vesselDwt);
    expect(r.value).toBe(est.rate);
    expect(r.confidence).toBe(est.confidence);
  });
});

describe('resolveFreightRate — invalid input falls through', () => {
  it('manual <= 0 or null is ignored → next tier', () => {
    expect(resolveFreightRate({ ...base, manualRateUsdPerMt: 0, parsedFreightRateUsdPerMt: 18 }).source).toBe('parsed');
    expect(resolveFreightRate({ ...base, manualRateUsdPerMt: -5, parsedFreightRateUsdPerMt: 18 }).source).toBe('parsed');
    expect(resolveFreightRate({ ...base, manualRateUsdPerMt: null, parsedFreightRateUsdPerMt: 18 }).source).toBe('parsed');
  });

  it('parsed <= 0 or null is ignored → next tier', () => {
    expect(resolveFreightRate({ ...base, parsedFreightRateUsdPerMt: 0, balticDayRate: balticInput }).source).toBe('baltic');
    expect(resolveFreightRate({ ...base, parsedFreightRateUsdPerMt: null, balticDayRate: balticInput }).source).toBe('baltic');
  });

  it('baltic guards (missing rate / zero qty / zero distance / zero voyage) → estimate', () => {
    expect(resolveFreightRate({ ...base, balticDayRate: null }).source).toBe('estimated');
    expect(resolveFreightRate({ ...base, quantityMt: 0, balticDayRate: balticInput }).source).toBe('estimated');
    expect(resolveFreightRate({ ...base, distanceNm: 0, balticDayRate: balticInput }).source).toBe('estimated');
    expect(resolveFreightRate({ ...base, balticDayRate: { usdPerDay: 0, date: '2026-05-09', indexCode: 'BSI_TC' } }).source).toBe('estimated');
  });
});

describe('resolveFreightRate — tier-2 math gives sane $/mt', () => {
  // Spec change (#819 Phase B(b)): conversion denominator is the SAME duration
  // model used downstream in computeEstimatedTce — round-trip (laden*2 + 2 port
  // days) — so revenue and bunker cost share a consistent voyage span. Using
  // laden-only days here while costs run over round-trip under-stated freight
  // ~7× and drove the −$102k vs +$774 sign flip the override guard was hiding.
  it('matches (usdPerDay × round-trip days ÷ tonnes), rounded to 2dp', () => {
    const r = resolveFreightRate({ ...base, balticDayRate: balticInput });
    const ladenDays = estimateVoyageDays(base.distanceNm, base.speedKts);
    const days = ladenDays > 0 ? ladenDays * 2 + 2 : 0;
    const expected = Math.round((balticInput.usdPerDay * days) / base.quantityMt * 100) / 100;
    expect(r.value).toBe(expected);
  });

  it('is plausible ($1–$40/mt) on three representative routes after RT-denom fix', () => {
    const routes = [
      { distanceNm: 3000, quantityMt: 45000, balticDayRate: { usdPerDay: 13500, date: 'd', indexCode: 'BSI_TC' } },
      { distanceNm: 6000, quantityMt: 30000, balticDayRate: { usdPerDay: 11500, date: 'd', indexCode: 'BHSI_TC' } },
      { distanceNm: 9000, quantityMt: 70000, balticDayRate: { usdPerDay: 15000, date: 'd', indexCode: 'BPI_TC' } },
    ];
    for (const route of routes) {
      const r = resolveFreightRate({ ...base, ...route });
      expect(r.source).toBe('baltic');
      expect(r.value).toBeGreaterThan(1);
      expect(r.value).toBeLessThan(40);
    }
  });

  it('rate after RT fix ≈ 2× the laden-only rate (revenue under-statement was ~6-7× before fix)', () => {
    // For voyages where laden days ≈ ballast days, RT = 2×laden + 2 → ≈ 2.2× larger.
    const r = resolveFreightRate({ ...base, balticDayRate: balticInput });
    const ladenDays = estimateVoyageDays(base.distanceNm, base.speedKts);
    const oldRate = Math.round((balticInput.usdPerDay * ladenDays) / base.quantityMt * 100) / 100;
    expect(r.value).toBeGreaterThanOrEqual(oldRate * 2);
  });

  it('guards ladenDays=0 (distance present but rounds to zero) → falls through to estimate', () => {
    // estimateVoyageDays floors to 1 above 0, so to hit ladenDays=0 we use distance=0
    // (already covered) — separately confirm the explicit "days > 0" guard remains.
    const r = resolveFreightRate({ ...base, distanceNm: 0, balticDayRate: balticInput });
    expect(r.source).toBe('estimated');
  });
});
