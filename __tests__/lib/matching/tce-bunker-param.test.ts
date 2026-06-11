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

  test('omitting bunkerPriceUsdPerMt uses the 600 default', () => {
    const withDefault = computeEstimatedTce(FREIGHT, 254, 44000, 35000);
    const with600 = computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 600);
    expect(withDefault.tce_usd_per_day).toBe(with600.tce_usd_per_day);
  });
});

describe('computeEstimatedTce — Stage 7 deprecation warn (bunker fallback)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('omitting bunkerPriceUsdPerMt fires console.warn with Stage 9 mention', () => {
    computeEstimatedTce(FREIGHT, 254, 44000, 35000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/Stage 9/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/DEFAULT_BUNKER_USD_PER_MT/);
  });

  test('passing explicit bunkerPriceUsdPerMt suppresses the warn', () => {
    computeEstimatedTce(FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, 600);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('result with fallback equals result with explicit DEFAULT_BUNKER_USD_PER_MT', () => {
    const { DEFAULT_BUNKER_USD_PER_MT } = require('@/lib/constants');
    const withFallback = computeEstimatedTce(FREIGHT, 254, 44000, 35000);
    const withExplicit = computeEstimatedTce(
      FREIGHT, 254, 44000, 35000, 12, 25, undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
    );
    expect(withFallback.tce_usd_per_day).toBe(withExplicit.tce_usd_per_day);
    expect(withFallback.breakdown.bunker_usd).toBe(withExplicit.breakdown.bunker_usd);
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
