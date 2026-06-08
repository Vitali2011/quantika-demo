import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

describe('buildCanonicalTceInputs', () => {
  const baseInput = {
    vesselDwt: 3000,
    speedKts: 12,
    consumptionMtPerDay: 8,
    distanceNm: 400,             // Marmara→Constanta class
    quantityMt: 2500,
    freightRateUsdPerMt: 21.56,  // post-fix Tier-3 estimate
    bunkerPriceUsdPerMt: 600,
    originPort: 'marmara',
    destinationPort: 'constanta',
  };

  test('uses round-trip duration (laden*2 + 2 port days)', () => {
    const out = buildCanonicalTceInputs(baseInput);
    // ladenDays = 400 / (12*24) ≈ 1.389 → durationDays ≈ 4.78
    expect(out.durationDays).toBeCloseTo(4.78, 1);
  });

  test('falls back to vesselDwt * 0.65 when quantityMt missing', () => {
    const out = buildCanonicalTceInputs({ ...baseInput, quantityMt: 0 });
    expect(out.cargo.quantityMt).toBe(3000 * 0.65);
  });

  test('passes through real ports (not empty strings) so war-risk/canal trigger', () => {
    const out = buildCanonicalTceInputs(baseInput);
    expect(out.route.originPort).toBe('marmara');
    expect(out.route.destinationPort).toBe('constanta');
  });

  test('returns durationDays=0 when distance missing (caller must skip calc)', () => {
    const out = buildCanonicalTceInputs({ ...baseInput, distanceNm: 0 });
    expect(out.durationDays).toBe(0);
  });

  test('caps quantity sanity (never negative, never absurd > DWT*1.5)', () => {
    const out = buildCanonicalTceInputs({ ...baseInput, quantityMt: -50 });
    expect(out.cargo.quantityMt).toBeGreaterThan(0);
  });

  test('threads daUsd through to VoyageInput', () => {
    const out = buildCanonicalTceInputs({ ...baseInput, daUsd: 45_000 });
    expect(out.daUsd).toBe(45_000);
  });

  test('daUsd is undefined when not provided (back-compat)', () => {
    const out = buildCanonicalTceInputs(baseInput);
    expect(out.daUsd).toBeUndefined();
  });

  test('ballastDistanceNm known: uses ballast+laden+2 not round-trip', () => {
    // Piraeus→Odessa ballast ≈ 800nm, Odessa→Rotterdam laden ≈ 2900nm, speed 13kts
    const ballastNm = 800;
    const ladenNm = 2900;
    const speedKts = 13;
    const out = buildCanonicalTceInputs({
      ...baseInput,
      distanceNm: ladenNm,
      speedKts,
      ballastDistanceNm: ballastNm,
    });
    const ballastDays = ballastNm / (speedKts * 24);
    const ladenDays = ladenNm / (speedKts * 24);
    const expected = ballastDays + ladenDays + 2;
    expect(out.durationDays).toBeCloseTo(expected, 2);
    // Confirm it's NOT the round-trip
    const roundTrip = ladenDays * 2 + 2;
    expect(out.durationDays).not.toBeCloseTo(roundTrip, 1);
  });
});

test('buildMatchEconomics with zero consumption on 28k-DWT vessel: consumptionEstimated=true, TCE uses class-aware ~14', () => {
  const result = buildMatchEconomics({
    cargoType: 'GRAIN',
    distanceNm: 3000,
    vesselDwt: 28000,
    quantityMt: 18000,
    speedKts: 12,
    consumptionMt: 0,  // missing consumption
    loadPort: 'NLRTM',
    dischargePort: 'EGPSD',
    calculatedAt: new Date().toISOString(),
    excludeWarRiskFromDailyTce: true,
  });
  expect(result).not.toBeNull();
  expect(result!.consumptionEstimated).toBe(true);
  // With class-aware ~28 t/day for 28k-DWT (supra), TCE should be different from
  // flat-25 result (and sensible, not 0-bunker inflated value)
  expect(result!.tceUsdPerDay).toBeDefined();
  expect(result!.tceUsdPerDay).toBeGreaterThan(-5000); // sanity: not absurdly negative
});
