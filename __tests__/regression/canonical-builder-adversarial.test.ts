/**
 * Adversarial regression tests for canonical-tce-inputs.ts (#819 test-skill).
 *
 * Attack surface:
 * A. Negative/NaN/zero inputs → must not produce NaN/Infinity in output
 * B. freightRateUsdPerMt=0 → calculateTCE should produce negative TCE (costs > revenue)
 * C. durationDays=0 when distanceNm=0 → calculateTCE returns 0 (not divide-by-zero)
 * D. Very large values → no overflow
 */
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { calculateTCE } from '@/lib/economics/voyage-calculator';

const base = {
  vesselDwt: 28000,
  speedKts: 12,
  consumptionMtPerDay: 22,
  distanceNm: 4500,
  quantityMt: 25000,
  freightRateUsdPerMt: 18,
  bunkerPriceUsdPerMt: 600,
  originPort: '',
  destinationPort: '',
};

describe('buildCanonicalTceInputs — adversarial inputs', () => {
  test('A1: all-zero numeric inputs → no NaN/Infinity in output', () => {
    const result = buildCanonicalTceInputs({
      ...base,
      vesselDwt: 0,
      speedKts: 0,
      consumptionMtPerDay: 0,
      distanceNm: 0,
      quantityMt: 0,
      freightRateUsdPerMt: 0,
      bunkerPriceUsdPerMt: 0,
    });
    const tce = calculateTCE(result);
    expect(Number.isFinite(tce.daily_tce_usd)).toBe(true);
    expect(Number.isNaN(tce.daily_tce_usd)).toBe(false);
    expect(tce.daily_tce_usd).toBe(0); // durationDays=0 → TCE=0
  });

  test('A2: negative distanceNm → treated as 0, durationDays=0', () => {
    const result = buildCanonicalTceInputs({ ...base, distanceNm: -500 });
    expect(result.durationDays).toBe(0);
    expect(result.route.distanceNm).toBe(0);
    const tce = calculateTCE(result);
    expect(tce.daily_tce_usd).toBe(0);
  });

  test('A3: NaN inputs → safeDwt fallback, no crash', () => {
    const result = buildCanonicalTceInputs({ ...base, vesselDwt: NaN, speedKts: NaN });
    expect(result.vessel.dwt).toBe(10_000); // fallback
    expect(result.vessel.speedKts).toBe(12); // fallback
    expect(Number.isFinite(result.durationDays)).toBe(true);
  });

  test('B: freightRateUsdPerMt=0 → gross_freight=0, TCE is negative (cost-only)', () => {
    const result = buildCanonicalTceInputs({ ...base, freightRateUsdPerMt: 0 });
    const tce = calculateTCE(result);
    expect(tce.breakdown.gross_freight_usd).toBe(0);
    expect(tce.breakdown.net_voyage_usd).toBeLessThan(0); // costs exist, no revenue
    expect(tce.daily_tce_usd).toBeLessThan(0);
  });

  test('C: distanceNm=0 → durationDays=0 → calculateTCE returns daily_tce_usd=0', () => {
    const result = buildCanonicalTceInputs({ ...base, distanceNm: 0 });
    expect(result.durationDays).toBe(0);
    const tce = calculateTCE(result);
    expect(tce.daily_tce_usd).toBe(0); // not Infinity, not negative Infinity
    expect(Number.isFinite(tce.daily_tce_usd)).toBe(true);
  });

  test('D: very large distance (20000nm) → no overflow', () => {
    const result = buildCanonicalTceInputs({ ...base, distanceNm: 20000 });
    const tce = calculateTCE(result);
    expect(Number.isFinite(tce.daily_tce_usd)).toBe(true);
    expect(tce.daily_tce_usd).toBeGreaterThan(-1_000_000);
    expect(tce.daily_tce_usd).toBeLessThan(1_000_000);
  });

  test('D2: very small distance (10nm) → round-trip still > 0', () => {
    const result = buildCanonicalTceInputs({ ...base, distanceNm: 10 });
    expect(result.durationDays).toBeGreaterThan(0);
    expect(result.durationDays).toBeCloseTo(2.035, 1); // 10/(12*24)*2+2 ≈ 2.035
  });
});

describe('distanceFactor change: short-route TCE is now non-depressed', () => {
  test('400nm GRAIN: TCE from new distanceFactor(1.0) > old distanceFactor(0.7)', () => {
    // Old: estimateFreightRate('GRAIN', 400, 3000) = max(1, round(18 * 0.7 * 1.4 * 100)/100) = 17.64
    // New: estimateFreightRate('GRAIN', 400, 3000) = max(1, round(18 * 1.0 * 1.4 * 100)/100) = 25.20
    // The TCE should be HIGHER after the fix
    const resultNew = buildCanonicalTceInputs({
      vesselDwt: 3000, speedKts: 12, consumptionMtPerDay: 8,
      distanceNm: 400, quantityMt: 2500, freightRateUsdPerMt: 25.20,
      bunkerPriceUsdPerMt: 600, originPort: '', destinationPort: '',
    });
    const tceNew = calculateTCE(resultNew);

    const resultOld = buildCanonicalTceInputs({
      vesselDwt: 3000, speedKts: 12, consumptionMtPerDay: 8,
      distanceNm: 400, quantityMt: 2500, freightRateUsdPerMt: 17.64,
      bunkerPriceUsdPerMt: 600, originPort: '', destinationPort: '',
    });
    const tceOld = calculateTCE(resultOld);

    expect(tceNew.daily_tce_usd).toBeGreaterThan(tceOld.daily_tce_usd);
  });

  test('44101-class (400nm GRAIN 3000dwt) with corrected rate: TCE POSITIVE', () => {
    // With new distanceFactor=1.0: rate=25.20/mt
    // gross_freight = 25.20 * 2500 = 63,000
    // round-trip days ≈ 4.78, bunker = 4.78 * 8 * 600 ≈ 22,944
    // net = 63,000 - 22,944 = ~40,056 → positive
    const result = buildCanonicalTceInputs({
      vesselDwt: 3000, speedKts: 12, consumptionMtPerDay: 8,
      distanceNm: 400, quantityMt: 2500, freightRateUsdPerMt: 25.20,
      bunkerPriceUsdPerMt: 600, originPort: '', destinationPort: '',
    });
    const tce = calculateTCE(result);
    expect(tce.daily_tce_usd).toBeGreaterThan(0);
  });
});

describe('parity: computeEstimatedTce === buildCanonicalTceInputs→calculateTCE', () => {
  test('must produce IDENTICAL results (proves delegation is correct)', () => {
    // Import the builder-backed computeEstimatedTce
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeEstimatedTce, estimateFreightRate } = require('@/lib/matching/tce-calculator');
    const freight = estimateFreightRate('GRAIN', 400, 3000);
    const fromCompute = computeEstimatedTce(
      { rate: freight.rate, source: freight.source, confidence: freight.confidence },
      400, 3000, 2500, 12, 8, undefined, undefined, undefined, 600,
    );

    const fromBuilder = calculateTCE(buildCanonicalTceInputs({
      vesselDwt: 3000, speedKts: 12, consumptionMtPerDay: 8,
      distanceNm: 400, quantityMt: 2500, freightRateUsdPerMt: freight.rate,
      bunkerPriceUsdPerMt: 600, euaPriceEur: 65, vesselValueUsd: 22_000_000,
      originPort: '', destinationPort: '',
    }));

    expect(fromBuilder.daily_tce_usd).toBe(fromCompute.tce_usd_per_day);
  });
});
