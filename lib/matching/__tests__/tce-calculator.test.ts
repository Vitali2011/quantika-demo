/**
 * Unit tests — tce-calculator.ts
 *
 * Covers:
 *   estimateFreightRate:
 *     - known cargo types return their expected base rate range
 *     - unknown cargo type falls back to median rate
 *     - distance factor applied (short vs long voyage)
 *     - DWT factor applied (small vs large vessel)
 *     - null cargo_type → median fallback
 *     - confidence: 0.6 for known, 0.3 for unknown
 *     - source is always 'estimated'
 *     - rate is always >= 1
 *   computeEstimatedTce:
 *     - returns a number (not NaN, not null)
 *     - with manual override source='manual' passes through
 *     - zero distance returns tce from 10-day fallback
 *     - negative distance treated as 0
 *   parseLeadingNumber:
 *     - parses "12.5 knots" → 12.5
 *     - parses "25 mt/day" → 25
 *     - empty string → 0
 *     - null → 0
 */

import {
  estimateFreightRate,
  computeEstimatedTce,
  parseLeadingNumber,
  parseConsumption,
  buildMatchEconomics,
  deriveEtsCoverage,
} from '@/lib/matching/tce-calculator';

describe('parseLeadingNumber', () => {
  it('parses "12.5 knots"', () => {
    expect(parseLeadingNumber('12.5 knots')).toBe(12.5);
  });

  it('parses "25 mt/day"', () => {
    expect(parseLeadingNumber('25 mt/day')).toBe(25);
  });

  it('returns 0 for empty string', () => {
    expect(parseLeadingNumber('')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(parseLeadingNumber(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseLeadingNumber(undefined)).toBe(0);
  });

  // Real/demo parsed data stores speed/consumption as ConfidenceField objects
  // ({ value, confidence, source_text }) or raw numbers, despite the string typing.
  // parseLeadingNumber must tolerate both rather than crash on `.match` (L2 wiring).
  // (raw-number tolerance also guards the frozen-demo dashboard crash, #684.)
  it('returns a finite number unchanged', () => {
    expect(parseLeadingNumber(13)).toBe(13);
    expect(parseLeadingNumber(12.5)).toBe(12.5);
    expect(parseLeadingNumber(0)).toBe(0);
  });

  it('returns 0 for non-finite numbers', () => {
    expect(parseLeadingNumber(NaN)).toBe(0);
    expect(parseLeadingNumber(Infinity)).toBe(0);
  });

  it('unwraps a ConfidenceField object with a numeric value', () => {
    expect(parseLeadingNumber({ value: 13, confidence: 'confirmed', source_text: '13 knts' })).toBe(13);
  });

  it('unwraps a ConfidenceField object with a string value', () => {
    expect(parseLeadingNumber({ value: '12.5 knots', confidence: 'estimated' })).toBe(12.5);
  });

  it('returns 0 for an object without a value field', () => {
    expect(parseLeadingNumber({ confidence: 'estimated' })).toBe(0);
  });
});

describe('parseConsumption', () => {
  const DEFAULT = 25; // DEFAULT_CONSUMPTION_MT_PER_DAY

  it('extracts MT/D figure from "Ballast: IFO 180 M/E 3.7MT/D" — not the grade 180', () => {
    expect(parseConsumption('Ballast: IFO 180 M/E 3.7MT/D; Laden: IFO 180 M/E 3.7MT/D')).toBe(3.7);
  });

  it('parses "abt 14 mt/day" → 14', () => {
    expect(parseConsumption('abt 14 mt/day')).toBe(14);
  });

  it('parses bare number string "14.5" → 14.5', () => {
    expect(parseConsumption('14.5')).toBe(14.5);
  });

  it('returns default for empty string', () => {
    expect(parseConsumption('')).toBe(DEFAULT);
  });

  it('returns default for null', () => {
    expect(parseConsumption(null)).toBe(DEFAULT);
  });

  it('returns default for undefined', () => {
    expect(parseConsumption(undefined)).toBe(DEFAULT);
  });

  it('unwraps ConfidenceField {value:"3.7MT/D"} → 3.7', () => {
    expect(parseConsumption({ value: '3.7MT/D', confidence: 'confirmed' })).toBe(3.7);
  });

  it('returns default for string with only a fuel-grade token (no MT/D figure)', () => {
    expect(parseConsumption('IFO 180')).toBe(DEFAULT);
    expect(parseConsumption('VLSFO M/E')).toBe(DEFAULT);
  });

  it('passes through a raw positive number', () => {
    expect(parseConsumption(25)).toBe(25);
    expect(parseConsumption(3.7)).toBe(3.7);
  });

  it('returns default for 0 or negative numbers', () => {
    expect(parseConsumption(0)).toBe(DEFAULT);
    expect(parseConsumption(-5)).toBe(DEFAULT);
  });

  it('LADY ANITA scenario: parseConsumption extracts 3.7 (not grade 180); a leaked 180 is clamped downstream', () => {
    const freight = estimateFreightRate('GRAIN', 3000, 28000);
    const goodCons = parseConsumption('Ballast: IFO 180 M/E 3.7MT/D');
    // Parse defense: extract the real MT/D figure, not the fuel-grade "180".
    expect(goodCons).toBe(3.7);
    const goodTce = computeEstimatedTce(freight, 3000, 28000, 25000, 12, goodCons);
    expect(goodTce.tce_usd_per_day).toBeGreaterThan(0);
    // Downstream defense (economics-overhaul step 1): even if the grade 180 leaked through,
    // resolveConsMtPerDay now clamps it to the DWT-class estimate (180 > class × 1.8), so it
    // no longer drives an extreme-negative TCE. The real 3.7 still beats the clamped value
    // (lower burn → higher TCE), but the divergence is bounded, not catastrophic.
    const leakedTce = computeEstimatedTce(freight, 3000, 28000, 25000, 12, 180);
    expect(goodTce.tce_usd_per_day).toBeGreaterThan(leakedTce.tce_usd_per_day);
  });
});

describe('estimateFreightRate', () => {
  it('returns source="estimated" always', () => {
    const result = estimateFreightRate('BULK', 3000, 50000);
    expect(result.source).toBe('estimated');
  });

  it('confidence=0.6 for known cargo type', () => {
    const result = estimateFreightRate('COAL', 3000, 50000);
    expect(result.confidence).toBe(0.6);
  });

  it('confidence=0.3 for unknown cargo type', () => {
    const result = estimateFreightRate('UNKNOWN_TYPE', 3000, 50000);
    expect(result.confidence).toBe(0.3);
  });

  it('null cargo_type falls back to median rate (confidence=0.3)', () => {
    const result = estimateFreightRate(null, 3000, 50000);
    expect(result.confidence).toBe(0.3);
    expect(result.rate).toBeGreaterThan(0);
  });

  it('GRAIN has lower rate than BREAK_BULK at same distance/dwt', () => {
    const grain = estimateFreightRate('GRAIN', 3000, 50000);
    const breakBulk = estimateFreightRate('BREAK_BULK', 3000, 50000);
    expect(grain.rate).toBeLessThan(breakBulk.rate);
  });

  it('long voyage (>6000nm) produces higher rate than short voyage (<1000nm)', () => {
    const short = estimateFreightRate('BULK', 500, 50000);
    const long = estimateFreightRate('BULK', 8000, 50000);
    expect(long.rate).toBeGreaterThan(short.rate);
  });

  it('small vessel (<20000 DWT) produces higher rate than capesize (>120000 DWT)', () => {
    const small = estimateFreightRate('BULK', 3000, 15000);
    const cape = estimateFreightRate('BULK', 3000, 150000);
    expect(small.rate).toBeGreaterThan(cape.rate);
  });

  it('rate is always >= 1', () => {
    const result = estimateFreightRate('IRON_ORE', 100, 200000);
    expect(result.rate).toBeGreaterThanOrEqual(1);
  });

  it('handles case-insensitive cargo type', () => {
    const upper = estimateFreightRate('COAL', 3000, 50000);
    const lower = estimateFreightRate('coal', 3000, 50000);
    expect(upper.rate).toBe(lower.rate);
  });

  it('handles cargo type with spaces (IRON ORE)', () => {
    const result = estimateFreightRate('IRON ORE', 3000, 50000);
    expect(result.confidence).toBe(0.6);
  });
});

describe('computeEstimatedTce', () => {
  it('returns a finite tce_usd_per_day', () => {
    const est = estimateFreightRate('BULK', 3000, 50000);
    const result = computeEstimatedTce(est, 3000, 50000, 45000, 12, 25);
    expect(Number.isFinite(result.tce_usd_per_day)).toBe(true);
  });

  it('passes through manual source', () => {
    const manual = { rate: 30, source: 'manual' as const, confidence: 1.0 };
    const result = computeEstimatedTce(manual, 3000, 50000, 45000);
    expect(result.freight_rate_source).toBe('manual');
    expect(result.freight_rate_usd_per_mt).toBe(30);
  });

  it('passes through waterfall sources (parsed / baltic) unchanged (Wave #7)', () => {
    const parsed = computeEstimatedTce({ rate: 18, source: 'parsed', confidence: 0.9 }, 3000, 50000, 45000);
    expect(parsed.freight_rate_source).toBe('parsed');
    expect(parsed.freight_rate_usd_per_mt).toBe(18);

    const baltic = computeEstimatedTce({ rate: 3.6, source: 'baltic', confidence: 0.5 }, 3000, 50000, 45000);
    expect(baltic.freight_rate_source).toBe('baltic');
    expect(baltic.freight_rate_usd_per_mt).toBe(3.6);
  });

  it('zero distance uses 10-day fallback and still returns finite TCE', () => {
    const est = estimateFreightRate('BULK', 0, 50000);
    const result = computeEstimatedTce(est, 0, 50000, 45000);
    expect(Number.isFinite(result.tce_usd_per_day)).toBe(true);
  });

  it('zero quantity uses conservative dwt*0.65 fallback — lower freight than stated 45k qty', () => {
    const est = estimateFreightRate('BULK', 3000, 50000);
    const withZeroQty = computeEstimatedTce(est, 3000, 50000, 0);
    const withFullQty = computeEstimatedTce(est, 3000, 50000, 45000);
    // Finite result with conservative fallback (50000 * 0.65 = 32500 < 45000).
    expect(Number.isFinite(withZeroQty.tce_usd_per_day)).toBe(true);
    // Conservative load → lower TCE than explicitly stated 45k cargo.
    expect(withZeroQty.tce_usd_per_day).toBeLessThan(withFullQty.tce_usd_per_day);
  });

  // PI2 behavioral: round-trip duration exceeds laden-only, so $/day is realistic (#782).
  it('round-trip voyage (3000nm) produces lower $/day than laden-only duration would', () => {
    const est = estimateFreightRate('BULK', 3000, 50000);
    // Round-trip: ladenDays(3000nm,12kts)=10.42 × 2 + 2portDays = 22.83 days.
    // Laden-only would give 10.42 days → $/day ~2.2× higher (~$97k).
    const roundTrip = computeEstimatedTce(est, 3000, 50000, 45000, 12, 25);
    // Verify round-trip TCE is substantially below what laden-only would give.
    // Laden-only net/$97k → round-trip net/22.83d = ~$36k — below the $50k threshold.
    expect(roundTrip.tce_usd_per_day).toBeLessThan(50_000);
    expect(Number.isFinite(roundTrip.tce_usd_per_day)).toBe(true);
  });

  // PI2 behavioral: SEAGULL 71-like case — 8.1k DWT small handysize, short voyage (#782 part b).
  it('SEAGULL 71 scenario — 8.1k DWT, 700nm laden — TCE in plausible handysize range', () => {
    const freight = estimateFreightRate('GRAIN', 700, 8100);
    const result = computeEstimatedTce(freight, 700, 8100, 0, 12, 8);
    // With round-trip duration (2×700nm + 2 port days) and conservative weight (8100×0.65=5265mt),
    // TCE must be below $20k/day (old laden-only was ~$53k, clearly wrong for a small handysize).
    expect(result.tce_usd_per_day).toBeLessThan(20_000);
    // And finite — no NaN or Infinity.
    expect(Number.isFinite(result.tce_usd_per_day)).toBe(true);
  });

  it('higher freight rate → higher TCE', () => {
    const low = { rate: 10, source: 'estimated' as const, confidence: 0.6 };
    const high = { rate: 40, source: 'estimated' as const, confidence: 0.6 };
    const tce_low = computeEstimatedTce(low, 3000, 50000, 45000).tce_usd_per_day;
    const tce_high = computeEstimatedTce(high, 3000, 50000, 45000).tce_usd_per_day;
    expect(tce_high).toBeGreaterThan(tce_low);
  });
});

describe('buildMatchEconomics', () => {
  const CALC_AT = '2026-05-30T00:00:00.000Z';
  const base = {
    cargoType: 'GRAIN',
    distanceNm: 3000,
    vesselDwt: 50000,
    quantityMt: 45000,
    speedKts: 12,
    consumptionMt: 25,
    loadPort: 'Rotterdam',
    dischargePort: 'Hamburg',
    calculatedAt: CALC_AT,
  };

  it('returns null when distance is not positive', () => {
    expect(buildMatchEconomics({ ...base, distanceNm: 0 })).toBeNull();
    expect(buildMatchEconomics({ ...base, distanceNm: -5 })).toBeNull();
  });

  it('populates a finite tceUsdPerDay identical to computeEstimatedTce', () => {
    const econ = buildMatchEconomics(base);
    expect(econ).not.toBeNull();
    expect(Number.isFinite(econ!.tceUsdPerDay!)).toBe(true);

    const freight = estimateFreightRate(base.cargoType, base.distanceNm, base.vesselDwt);
    // base route Rotterdam→Hamburg: both EU ports → EU-ETS applies to the full leg.
    // buildMatchEconomics derives this coverage internally (deriveEtsCoverage); the
    // reference must pass the SAME ETS inputs or it lags behind by the ETS cost
    // (~$5.5k/day here: 31117 no-ETS vs 25587 with-ETS). The invariant under test is
    // path parity, not a fixed number — so mirror the derivation, don't hardcode.
    const ets = deriveEtsCoverage(base.loadPort, base.dischargePort);
    const tce = computeEstimatedTce(
      freight, base.distanceNm, base.vesselDwt, base.quantityMt, base.speedKts, base.consumptionMt,
      undefined, undefined, undefined, undefined,
      ets.euLegPercent, ets.originEu, ets.destEu,
    );
    // Per-day TCE must match the value compute-matches.ts persists to the DB column.
    expect(econ!.tceUsdPerDay).toBe(tce.tce_usd_per_day);
    expect(econ!.calculatedAt).toBe(CALC_AT);
  });

  it('non-HRA route → empty war-risk zones, zero premium', () => {
    const econ = buildMatchEconomics(base);
    expect(econ!.breakdown.warRiskZones).toEqual([]);
    expect(econ!.breakdown.warRiskPremium).toBe(0);
    expect(econ!.breakdown.warRiskBreakdown).toBeUndefined();
  });

  it('surfaces JWC war-risk when load port is in a high-risk area (#6)', () => {
    const econ = buildMatchEconomics({ ...base, loadPort: 'Lagos', dischargePort: 'Hamburg' });
    expect(econ!.breakdown.warRiskZones.length).toBeGreaterThan(0);
    expect(econ!.breakdown.warRiskPremium).toBeGreaterThan(0);
    expect(econ!.breakdown.warRiskBreakdown!.totalPremiumUsd).toBeGreaterThan(0);
  });

  it('daUsd lowers tceUsdPerDay and raises totalUsd vs zero-DA baseline', () => {
    const baseCase = {
      cargoType: 'BULK',
      distanceNm: 1200,
      vesselDwt: 30000,
      quantityMt: 28000,
      speedKts: 12,
      consumptionMt: 22,
      loadPort: 'constanta',
      dischargePort: 'alexandria',
      calculatedAt: '2026-06-07T00:00:00.000Z',
    };
    const noDa = buildMatchEconomics({ ...baseCase });
    const withDa = buildMatchEconomics({ ...baseCase, daUsd: 40000 });
    expect(noDa).not.toBeNull();
    expect(withDa).not.toBeNull();
    // DA is a cost → total goes up, per-day TCE goes down.
    expect(withDa!.totalUsd).toBeGreaterThan(noDa!.totalUsd);
    expect(withDa!.tceUsdPerDay!).toBeLessThan(noDa!.tceUsdPerDay!);
  });
});
