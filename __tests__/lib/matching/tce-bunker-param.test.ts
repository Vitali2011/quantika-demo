/**
 * PI2 behavioral — bunkerPriceUsdPerMt parameter threading (Fix B, #fix-list-vs-detail).
 *
 * computeEstimatedTce and buildMatchEconomics must accept a live bunker price
 * and produce a TCE that reflects that price in the breakdown.
 */
import { computeEstimatedTce, estimateFreightRate, buildMatchEconomics } from '@/lib/matching/tce-calculator';

const FREIGHT = estimateFreightRate('GRAIN', 254, 44000);

describe('computeEstimatedTce — bunkerPriceUsdPerMt param (Fix B)', () => {
  test('higher bunker price yields lower TCE', () => {
    const low = computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 600);
    const high = computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 766);
    expect(high.tce_usd_per_day).toBeLessThan(low.tce_usd_per_day);
  });

  test('breakdown.bunker_usd reflects the passed bunker price', () => {
    const result = computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 766);
    // durationDays for 254nm at 12kts ≈ 254/(12*24) ≈ 0.882 days round-trip
    // bunker_usd = consumption * duration * price ≈ 25 * roundtrip * 766
    // Just check the ratio: bunker_usd(766) / bunker_usd(600) ≈ 766/600
    const base = computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 600);
    const ratio = result.breakdown.bunker_usd / base.breakdown.bunker_usd;
    expect(ratio).toBeCloseTo(766 / 600, 1);
  });

  // Stage 9: omitting bunkerPriceUsdPerMt now throws instead of silently defaulting to 600.
  test('Stage 9: omitting bunkerPriceUsdPerMt throws (no silent default)', () => {
    expect(() => computeEstimatedTce(FREIGHT, 254, 44000, 35000)).toThrow(
      'computeEstimatedTce: bunkerPriceUsdPerMt is required since Stage 9',
    );
  });
});

describe('computeEstimatedTce — Stage 9 explicit bunker required (no deprecation warn)', () => {
  test('passing explicit bunkerPriceUsdPerMt produces finite TCE, no console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 600);
    expect(Number.isFinite(result.tce_usd_per_day)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('explicit 600 matches DEFAULT_BUNKER_USD_PER_MT value (no drift)', () => {
    const { DEFAULT_BUNKER_USD_PER_MT } = require('@/lib/constants');
    const with600 = computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 600);
    const withConst = computeEstimatedTce(
      FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
    );
    expect(with600.tce_usd_per_day).toBe(withConst.tce_usd_per_day);
    expect(with600.breakdown.bunker_usd).toBe(withConst.breakdown.bunker_usd);
  });
});

describe('buildMatchEconomics — bunkerPriceUsdPerMt propagation (Fix B)', () => {
  const BASE = {
    cargoType: 'GRAIN',
    distanceNm: 254,
    vesselDwt: 44000,
    quantityMt: 35000,
    speedKts: 12,
    consumptionMt: 25,
    loadPort: null,
    dischargePort: null,
    calculatedAt: '2026-06-07T00:00:00Z',
  };

  test('bunkerPriceUsdPerMt=766 produces lower tceUsdPerDay than default', () => {
    const live = buildMatchEconomics({ ...BASE, bunkerPriceUsdPerMt: 766 });
    const def = buildMatchEconomics({ ...BASE });
    expect(live).not.toBeNull();
    expect(def).not.toBeNull();
    expect(live!.tceUsdPerDay ?? 0).toBeLessThan(def!.tceUsdPerDay ?? 0);
  });
});
