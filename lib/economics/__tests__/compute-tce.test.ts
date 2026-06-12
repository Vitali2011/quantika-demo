/**
 * Stage 5 golden-set tests for computeTce.
 *
 * Pattern: for each fixture, computeTce(inputs) must produce the same result
 * as calculateTCE(equivalent VoyageInput). The reference is the existing
 * calculateTCE function — these tests pin the 1:1 delegation mapping.
 *
 * ≥20 fixtures covering DWT classes, rates, bunker prices, canal/DA, ETS,
 * ballast leg, excludeWarRiskFromDailyTce, and edge cases.
 */

import { computeTce } from '../compute-tce';
import type { TceInputs } from '../compute-tce';
import { calculateTCE } from '../voyage-calculator';
import { estimateRoundTripDays } from '../voyage-days';

function refResult(inputs: TceInputs) {
  const safeSpeed = inputs.speedKts > 0 ? inputs.speedKts : 12;
  const safeDist = inputs.distanceNm > 0 ? inputs.distanceNm : 0;
  let durationDays: number;
  if (inputs.ballastDistanceNm != null && inputs.ballastDistanceNm > 0 && safeDist > 0) {
    const ballastDays = inputs.ballastDistanceNm / (safeSpeed * 24);
    const ladenDays = safeDist / (safeSpeed * 24);
    durationDays = ballastDays + ladenDays + 2;
  } else {
    durationDays = estimateRoundTripDays(safeDist, safeSpeed);
  }
  return calculateTCE({
    vessel: { dwt: inputs.dwt, valueUsd: inputs.valueUsd, speedKts: inputs.speedKts, consumptionMtPerDay: inputs.consumptionMtPerDay },
    route: { originPort: '', destinationPort: '', distanceNm: inputs.distanceNm },
    cargo: { quantityMt: inputs.quantityMt, freightRateUsdPerMt: inputs.freightRateUsdPerMt },
    bunkerPriceUsdPerMt: inputs.bunkerPriceUsdPerMt,
    euaPriceEur: inputs.euaPriceEur,
    durationDays,
    canalUsd: inputs.canalUsd,
    daUsd: inputs.daUsd,
    euLegPercent: inputs.euLegPercent,
    originEu: inputs.originEu,
    destEu: inputs.destEu,
    daysInHra: inputs.daysInHra,
    excludeWarRiskFromDailyTce: inputs.excludeWarRiskFromDailyTce,
    ecaZones: inputs.ecaZones,
  });
}

// ---------------------------------------------------------------------------
// Golden fixture set (25 fixtures)
// ---------------------------------------------------------------------------

const FIXTURES: Array<{ label: string; inputs: TceInputs }> = [
  // --- Handysize class ---
  {
    label: 'HS-1: 15k DWT short haul 1000nm $15/mt',
    inputs: {
      dwt: 15_000, valueUsd: 8_000_000, speedKts: 12, consumptionMtPerDay: 10,
      distanceNm: 1_000, quantityMt: 9_750, freightRateUsdPerMt: 15,
      bunkerPriceUsdPerMt: 600, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'HS-2: 20k DWT medium haul 3000nm $20/mt',
    inputs: {
      dwt: 20_000, valueUsd: 10_000_000, speedKts: 12, consumptionMtPerDay: 14,
      distanceNm: 3_000, quantityMt: 13_000, freightRateUsdPerMt: 20,
      bunkerPriceUsdPerMt: 650, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'HS-3: 25k DWT long haul 7000nm $22/mt',
    inputs: {
      dwt: 25_000, valueUsd: 12_000_000, speedKts: 12.5, consumptionMtPerDay: 16,
      distanceNm: 7_000, quantityMt: 16_000, freightRateUsdPerMt: 22,
      bunkerPriceUsdPerMt: 700, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },

  // --- Handymax / Supramax class ---
  {
    label: 'SM-1: 28k DWT short haul 1500nm $25/mt',
    inputs: {
      dwt: 28_000, valueUsd: 13_000_000, speedKts: 13, consumptionMtPerDay: 18,
      distanceNm: 1_500, quantityMt: 18_000, freightRateUsdPerMt: 25,
      bunkerPriceUsdPerMt: 600, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'SM-2: 38k DWT medium haul 4000nm $28/mt',
    inputs: {
      dwt: 38_000, valueUsd: 16_000_000, speedKts: 13.5, consumptionMtPerDay: 22,
      distanceNm: 4_000, quantityMt: 25_000, freightRateUsdPerMt: 28,
      bunkerPriceUsdPerMt: 720, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'SM-3: 45k DWT long haul 6000nm $24/mt',
    inputs: {
      dwt: 45_000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 25,
      distanceNm: 6_000, quantityMt: 30_000, freightRateUsdPerMt: 24,
      bunkerPriceUsdPerMt: 760, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'SM-4: 56k DWT long haul 8000nm $21/mt',
    inputs: {
      dwt: 56_000, valueUsd: 20_000_000, speedKts: 14, consumptionMtPerDay: 28,
      distanceNm: 8_000, quantityMt: 36_000, freightRateUsdPerMt: 21,
      bunkerPriceUsdPerMt: 791, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },

  // --- Panamax class ---
  {
    label: 'PM-1: 65k DWT long haul 9000nm $19/mt',
    inputs: {
      dwt: 65_000, valueUsd: 22_000_000, speedKts: 14, consumptionMtPerDay: 30,
      distanceNm: 9_000, quantityMt: 42_000, freightRateUsdPerMt: 19,
      bunkerPriceUsdPerMt: 750, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'PM-2: 76k DWT very long haul 12000nm $18/mt',
    inputs: {
      dwt: 76_000, valueUsd: 25_000_000, speedKts: 14.5, consumptionMtPerDay: 33,
      distanceNm: 12_000, quantityMt: 50_000, freightRateUsdPerMt: 18,
      bunkerPriceUsdPerMt: 800, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },

  // --- Capesize class ---
  {
    label: 'CS-1: 100k DWT long haul 8000nm $15/mt',
    inputs: {
      dwt: 100_000, valueUsd: 35_000_000, speedKts: 14, consumptionMtPerDay: 42,
      distanceNm: 8_000, quantityMt: 65_000, freightRateUsdPerMt: 15,
      bunkerPriceUsdPerMt: 760, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'CS-2: 180k DWT very long haul 14000nm $12/mt',
    inputs: {
      dwt: 180_000, valueUsd: 55_000_000, speedKts: 15, consumptionMtPerDay: 58,
      distanceNm: 14_000, quantityMt: 117_000, freightRateUsdPerMt: 12,
      bunkerPriceUsdPerMt: 800, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },

  // --- Bunker price variations ---
  {
    label: 'BNK-1: low bunker $400/mt (Supramax)',
    inputs: {
      dwt: 50_000, valueUsd: 19_000_000, speedKts: 13, consumptionMtPerDay: 26,
      distanceNm: 5_000, quantityMt: 32_000, freightRateUsdPerMt: 22,
      bunkerPriceUsdPerMt: 400, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'BNK-2: high bunker $950/mt (Panamax)',
    inputs: {
      dwt: 72_000, valueUsd: 24_000_000, speedKts: 14, consumptionMtPerDay: 31,
      distanceNm: 9_500, quantityMt: 47_000, freightRateUsdPerMt: 20,
      bunkerPriceUsdPerMt: 950, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },

  // --- Canal costs ---
  {
    label: 'CANAL-1: Suez canal $150k (Supramax 45k)',
    inputs: {
      dwt: 45_000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 25,
      distanceNm: 6_500, quantityMt: 30_000, freightRateUsdPerMt: 26,
      bunkerPriceUsdPerMt: 750, euaPriceEur: 0, canalUsd: 150_000, daUsd: 0,
    },
  },
  {
    label: 'CANAL-2: Panama canal $200k (Panamax 65k)',
    inputs: {
      dwt: 65_000, valueUsd: 22_000_000, speedKts: 14, consumptionMtPerDay: 30,
      distanceNm: 10_500, quantityMt: 42_000, freightRateUsdPerMt: 19,
      bunkerPriceUsdPerMt: 800, euaPriceEur: 0, canalUsd: 200_000, daUsd: 0,
    },
  },

  // --- DA costs ---
  {
    label: 'DA-1: high DA $80k (Handymax 35k)',
    inputs: {
      dwt: 35_000, valueUsd: 15_000_000, speedKts: 12.5, consumptionMtPerDay: 20,
      distanceNm: 3_500, quantityMt: 22_000, freightRateUsdPerMt: 30,
      bunkerPriceUsdPerMt: 680, euaPriceEur: 0, canalUsd: 0, daUsd: 80_000,
    },
  },

  // --- EU ETS ---
  {
    label: 'ETS-1: EU-to-EU full coverage (Supramax)',
    inputs: {
      dwt: 52_000, valueUsd: 19_000_000, speedKts: 13, consumptionMtPerDay: 27,
      distanceNm: 2_000, quantityMt: 33_000, freightRateUsdPerMt: 32,
      bunkerPriceUsdPerMt: 750, euaPriceEur: 65, canalUsd: 0, daUsd: 0,
      euLegPercent: 1.0, originEu: true, destEu: true,
    },
  },
  {
    label: 'ETS-2: EU-to-non-EU half coverage (Handymax)',
    inputs: {
      dwt: 38_000, valueUsd: 16_000_000, speedKts: 13, consumptionMtPerDay: 22,
      distanceNm: 1_500, quantityMt: 25_000, freightRateUsdPerMt: 28,
      bunkerPriceUsdPerMt: 700, euaPriceEur: 65, canalUsd: 0, daUsd: 0,
      euLegPercent: 0.5, originEu: true, destEu: false,
    },
  },

  // --- Ballast distance ---
  {
    label: 'BALLAST-1: known ballast short reposition (Supramax)',
    inputs: {
      dwt: 56_000, valueUsd: 20_000_000, speedKts: 14, consumptionMtPerDay: 28,
      distanceNm: 5_000, ballastDistanceNm: 800, quantityMt: 36_000,
      freightRateUsdPerMt: 23, bunkerPriceUsdPerMt: 780, euaPriceEur: 0,
      canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'BALLAST-2: long ballast medium laden (Panamax)',
    inputs: {
      dwt: 75_000, valueUsd: 24_000_000, speedKts: 14, consumptionMtPerDay: 32,
      distanceNm: 4_500, ballastDistanceNm: 3_000, quantityMt: 49_000,
      freightRateUsdPerMt: 18, bunkerPriceUsdPerMt: 800, euaPriceEur: 0,
      canalUsd: 0, daUsd: 0,
    },
  },

  // --- excludeWarRiskFromDailyTce (stored-path) ---
  {
    label: 'EXCL-WAR-1: stored path excludeWarRisk=true (Capesize)',
    inputs: {
      dwt: 120_000, valueUsd: 40_000_000, speedKts: 15, consumptionMtPerDay: 48,
      distanceNm: 9_000, quantityMt: 78_000, freightRateUsdPerMt: 14,
      bunkerPriceUsdPerMt: 760, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
      excludeWarRiskFromDailyTce: true,
    },
  },
  {
    label: 'EXCL-WAR-2: detail path excludeWarRisk=false (Panamax)',
    inputs: {
      dwt: 68_000, valueUsd: 22_000_000, speedKts: 14, consumptionMtPerDay: 30,
      distanceNm: 8_500, quantityMt: 44_000, freightRateUsdPerMt: 19,
      bunkerPriceUsdPerMt: 750, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
      excludeWarRiskFromDailyTce: false,
    },
  },

  // --- Combined costs ---
  {
    label: 'COMBO-1: canal + DA + ETS (Supramax)',
    inputs: {
      dwt: 55_000, valueUsd: 20_000_000, speedKts: 13, consumptionMtPerDay: 27,
      distanceNm: 5_500, quantityMt: 35_000, freightRateUsdPerMt: 25,
      bunkerPriceUsdPerMt: 750, euaPriceEur: 60, canalUsd: 120_000, daUsd: 60_000,
      euLegPercent: 1.0, originEu: true, destEu: true,
    },
  },

  // --- Edge cases ---
  {
    label: 'EDGE-1: zero distance → durationDays=0 → tceUsdPerDay=0',
    inputs: {
      dwt: 50_000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 25,
      distanceNm: 0, quantityMt: 30_000, freightRateUsdPerMt: 20,
      bunkerPriceUsdPerMt: 700, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
  {
    label: 'EDGE-2: zero bunker price → bunker_usd=0',
    inputs: {
      dwt: 28_000, valueUsd: 12_000_000, speedKts: 12, consumptionMtPerDay: 18,
      distanceNm: 2_500, quantityMt: 18_000, freightRateUsdPerMt: 25,
      bunkerPriceUsdPerMt: 0, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    },
  },
];

// ---------------------------------------------------------------------------
// Equivalence tests: computeTce must match calculateTCE reference for all 25
// ---------------------------------------------------------------------------

describe('computeTce — equivalence to calculateTCE reference (Stage 5 delegation)', () => {
  for (const { label, inputs } of FIXTURES) {
    test(label, () => {
      const ref = refResult(inputs);
      const actual = computeTce(inputs);

      expect(actual.tceUsdPerDay).toBe(ref.daily_tce_usd);
      expect(actual.durationDays).toBe(ref.breakdown.duration_days);
      expect(actual.breakdown).toEqual(ref.breakdown);
    });
  }
});

// ---------------------------------------------------------------------------
// Behavioral tests (PI2 — real function call, not just string checks)
// ---------------------------------------------------------------------------

describe('computeTce — behavioral invariants', () => {
  const base: TceInputs = {
    dwt: 50_000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 25,
    distanceNm: 5_000, quantityMt: 32_000, freightRateUsdPerMt: 22,
    bunkerPriceUsdPerMt: 750, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
  };

  test('returns finite tceUsdPerDay for a profitable non-HRA voyage', () => {
    const result = computeTce(base);
    expect(Number.isFinite(result.tceUsdPerDay)).toBe(true);
    expect(result.tceUsdPerDay).toBeGreaterThan(0);
  });

  test('breakdown.gross_freight_usd = quantityMt * freightRateUsdPerMt', () => {
    const result = computeTce(base);
    expect(result.breakdown.gross_freight_usd).toBe(32_000 * 22);
  });

  test('breakdown.bunker_usd = consumptionMtPerDay * durationDays * bunkerPrice (rounded)', () => {
    const result = computeTce(base);
    const duration = estimateRoundTripDays(5_000, 13);
    const expected = Math.round(25 * duration * 750);
    expect(result.breakdown.bunker_usd).toBe(expected);
  });

  test('zero canal → breakdown.canal_usd = 0, applicable.canal = false', () => {
    const result = computeTce(base);
    expect(result.breakdown.canal_usd).toBe(0);
    expect(result.breakdown.applicable.canal).toBe(false);
  });

  test('canal included → breakdown.canal_usd and applicable.canal = true', () => {
    const result = computeTce({ ...base, canalUsd: 150_000 });
    expect(result.breakdown.canal_usd).toBe(150_000);
    expect(result.breakdown.applicable.canal).toBe(true);
  });

  test('DA included → breakdown.da_usd and applicable.da = true', () => {
    const result = computeTce({ ...base, daUsd: 50_000 });
    expect(result.breakdown.da_usd).toBe(50_000);
    expect(result.breakdown.applicable.da).toBe(true);
  });

  test('EU ETS → breakdown.ets_usd > 0 when euLegPercent > 0 and euaPriceEur > 0', () => {
    const result = computeTce({ ...base, euaPriceEur: 65, euLegPercent: 1.0, originEu: true, destEu: true });
    expect(result.breakdown.ets_usd).toBeGreaterThan(0);
    expect(result.breakdown.applicable.ets).toBe(true);
  });

  test('zero distance → durationDays = 0 and tceUsdPerDay = 0', () => {
    const result = computeTce({ ...base, distanceNm: 0 });
    expect(result.durationDays).toBe(0);
    expect(result.tceUsdPerDay).toBe(0);
  });

  test('ballastDistanceNm: durationDays = ballast+laden+2 (not round-trip)', () => {
    const inputs: TceInputs = { ...base, distanceNm: 4_000, ballastDistanceNm: 1_000 };
    const result = computeTce(inputs);
    const safeSpeed = 13;
    const expected = 1_000 / (safeSpeed * 24) + 4_000 / (safeSpeed * 24) + 2;
    expect(result.durationDays).toBeCloseTo(expected, 5);
    const roundTrip = estimateRoundTripDays(4_000, 13);
    expect(result.durationDays).not.toBe(roundTrip);
  });

  test('excludeWarRiskFromDailyTce: non-HRA route → equal tceUsdPerDay regardless of flag (war_risk_usd=0)', () => {
    // Without excludeWarRisk and with zero war-risk (no HRA ports), both should be equal
    const withFlag = computeTce({ ...base, excludeWarRiskFromDailyTce: true });
    const withoutFlag = computeTce({ ...base, excludeWarRiskFromDailyTce: false });
    // Non-HRA route → war_risk_usd = 0 → both equal
    expect(withFlag.tceUsdPerDay).toBe(withoutFlag.tceUsdPerDay);
  });

  test('breakdown.total_costs_usd = bunker + canal + da + war_risk + ets_usd', () => {
    const inputs: TceInputs = { ...base, canalUsd: 120_000, daUsd: 50_000 };
    const result = computeTce(inputs);
    const { bunker_usd, canal_usd, da_usd, war_risk_usd, ets_usd, total_costs_usd } = result.breakdown;
    expect(total_costs_usd).toBe(bunker_usd + canal_usd + da_usd + war_risk_usd + ets_usd);
  });

  test('breakdown.net_voyage_usd = gross_freight - total_costs', () => {
    const result = computeTce(base);
    expect(result.breakdown.net_voyage_usd).toBe(
      result.breakdown.gross_freight_usd - result.breakdown.total_costs_usd
    );
  });

  test('applicable.bunker = true when consumption > 0 and bunkerPrice > 0', () => {
    const result = computeTce(base);
    expect(result.breakdown.applicable.bunker).toBe(true);
  });

  test('applicable.bunker = false when bunkerPrice = 0', () => {
    const result = computeTce({ ...base, bunkerPriceUsdPerMt: 0 });
    expect(result.breakdown.applicable.bunker).toBe(false);
  });

  test('breakdown.freight_rate_usd_per_mt = freightRateUsdPerMt input', () => {
    const result = computeTce(base);
    expect(result.breakdown.freight_rate_usd_per_mt).toBe(22);
  });

  test('breakdown.quantity_mt = quantityMt input', () => {
    const result = computeTce(base);
    expect(result.breakdown.quantity_mt).toBe(32_000);
  });

  test('breakdown.bunker_price_usd_per_mt = bunkerPriceUsdPerMt input', () => {
    const result = computeTce(base);
    expect(result.breakdown.bunker_price_usd_per_mt).toBe(750);
  });

  test('tceUsdPerDay increases when freight rate increases (all else equal)', () => {
    const low = computeTce(base);
    const high = computeTce({ ...base, freightRateUsdPerMt: 35 });
    expect(high.tceUsdPerDay).toBeGreaterThan(low.tceUsdPerDay);
  });

  test('tceUsdPerDay decreases when bunker price increases (all else equal)', () => {
    const low = computeTce({ ...base, bunkerPriceUsdPerMt: 400 });
    const high = computeTce({ ...base, bunkerPriceUsdPerMt: 900 });
    expect(high.tceUsdPerDay).toBeLessThan(low.tceUsdPerDay);
  });

  it('clamps a negative freight rate to 0 — no negative gross freight (audit C.8)', () => {
    const r = computeTce({
      dwt: 50000, valueUsd: 15_000_000, speedKts: 13, consumptionMtPerDay: 28,
      freightRateUsdPerMt: -12, quantityMt: 50000, distanceNm: 3000,
      bunkerPriceUsdPerMt: 600, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
    });
    expect(r.breakdown.gross_freight_usd).toBe(0);
    expect(r.breakdown.freight_rate_usd_per_mt).toBe(0);
  });
});
