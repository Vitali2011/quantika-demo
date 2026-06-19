/**
 * Task 7 — КОМИССИЯ В TCE (#1046, recon docs/research/recon-tce-commission-2026-06-17.md).
 *
 * Commission (address + brokerage TTL) is a direct deduction from gross freight:
 *   net_freight = gross_freight × (1 − commPct/100)
 * net_freight feeds BOTH netVoyage and dailyNetVoyage symmetrically (same convention
 * as excludeWarRiskFromDailyTce) so list (stored) TCE == detail (live) TCE.
 *
 * Founder lock: rate = cargo.commissionPercent from the email WHERE present, else 3.75% TTL.
 * The 3.75 fallback lives at the cargo-reading consumers (computeStoredMatchEconomics,
 * /api/voyage/tce) — computeTce itself stays a no-silent-default pure function
 * (commissionPct absent/0 → no deduction → legacy behaviour preserved).
 */

import { computeTce } from '../compute-tce';
import type { TceInputs } from '../compute-tce';
import { calculateTCE } from '../voyage-calculator';
import { estimateRoundTripDays } from '../voyage-days';
import { buildMatchEconomics, estimateFreightRate } from '@/lib/matching/tce-calculator';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

const BASE: TceInputs = {
  dwt: 50_000, valueUsd: 18_000_000, speedKts: 13, consumptionMtPerDay: 25,
  distanceNm: 5_000, quantityMt: 32_000, freightRateUsdPerMt: 22,
  bunkerPriceUsdPerMt: 750, euaPriceEur: 0, canalUsd: 0, daUsd: 0,
};

describe('computeTce — commission deduction (Task 7 #1046)', () => {
  test('commission is deducted from gross freight: net_freight = gross × (1 − commPct/100)', () => {
    const r = computeTce({ ...BASE, commissionPct: 3.75 });
    const gross = 32_000 * 22;
    const expectedCommission = Math.round(gross * (3.75 / 100));
    expect(r.breakdown.gross_freight_usd).toBe(gross); // gross is the contracted freight, unchanged
    expect(r.breakdown.commission_usd).toBe(expectedCommission);
    expect(r.breakdown.commission_pct).toBe(3.75);
    expect(r.breakdown.net_freight_usd).toBe(gross - expectedCommission);
  });

  test('commission lowers tceUsdPerDay vs no commission (material impact)', () => {
    const withComm = computeTce({ ...BASE, commissionPct: 3.75 });
    const without = computeTce(BASE);
    expect(withComm.tceUsdPerDay).toBeLessThan(without.tceUsdPerDay);
    // net_voyage drops by exactly the commission amount (commission is not a cost line).
    expect(without.breakdown.net_voyage_usd - withComm.breakdown.net_voyage_usd).toBe(
      withComm.breakdown.commission_usd,
    );
  });

  test('ZERO commission → identical to legacy (old behaviour preserved)', () => {
    const zero = computeTce({ ...BASE, commissionPct: 0 });
    const omitted = computeTce(BASE);
    expect(zero.tceUsdPerDay).toBe(omitted.tceUsdPerDay);
    expect(zero.breakdown.commission_usd).toBe(0);
    expect(zero.breakdown.net_freight_usd).toBe(zero.breakdown.gross_freight_usd);
    expect(zero.breakdown.net_voyage_usd).toBe(omitted.breakdown.net_voyage_usd);
  });

  test('commission rides net_freight symmetrically in dailyNetVoyage (excludeWarRisk both branches)', () => {
    // Non-HRA route → war_risk_usd = 0 → excludeWarRisk true/false agree, AND both reflect commission.
    const exclTrue = computeTce({ ...BASE, commissionPct: 3.75, excludeWarRiskFromDailyTce: true });
    const exclFalse = computeTce({ ...BASE, commissionPct: 3.75, excludeWarRiskFromDailyTce: false });
    expect(exclTrue.tceUsdPerDay).toBe(exclFalse.tceUsdPerDay);
    // Both are net-of-commission: lower than the same flag without commission.
    const noCommExcl = computeTce({ ...BASE, excludeWarRiskFromDailyTce: true });
    expect(exclTrue.tceUsdPerDay).toBeLessThan(noCommExcl.tceUsdPerDay);
  });

  test('negative commissionPct is clamped to 0 (no nonsense uplift)', () => {
    const r = computeTce({ ...BASE, commissionPct: -5 });
    expect(r.breakdown.commission_usd).toBe(0);
    expect(r.breakdown.net_freight_usd).toBe(r.breakdown.gross_freight_usd);
  });
});

describe('list == detail TCE parity with commission (#1046)', () => {
  test('buildMatchEconomics(commissionPct) === calculateTCE(commissionPct) to the dollar', () => {
    const dwt = 50_000, speed = 13, cons = 25, distance = 5_000, qty = 32_000;
    const bunker = 750, eua = 0, vesselValue = 18_000_000, comm = 3.75;
    const freight = estimateFreightRate('GRAIN', distance, dwt);

    // LIST path
    const list = buildMatchEconomics({
      cargoType: 'GRAIN',
      distanceNm: distance,
      vesselDwt: dwt,
      quantityMt: qty,
      speedKts: speed,
      consumptionMt: cons,
      loadPort: null,
      dischargePort: null,
      calculatedAt: '2026-06-17T00:00:00.000Z',
      resolvedFreight: { rate: freight.rate, source: freight.source, confidence: freight.confidence },
      bunkerPriceUsdPerMt: bunker,
      euaPriceEur: eua > 0 ? eua : undefined,
      vesselValueUsd: vesselValue,
      excludeWarRiskFromDailyTce: true,
      commissionPct: comm,
    })!;

    // DETAIL path — same inputs, same round-trip duration, same commission.
    const detail = calculateTCE({
      vessel: { dwt, valueUsd: vesselValue, speedKts: speed, consumptionMtPerDay: cons },
      route: { originPort: '', destinationPort: '', distanceNm: distance },
      cargo: { quantityMt: qty, freightRateUsdPerMt: freight.rate, commissionPct: comm },
      bunkerPriceUsdPerMt: bunker,
      euaPriceEur: eua,
      durationDays: estimateRoundTripDays(distance, speed),
      excludeWarRiskFromDailyTce: true,
    });

    expect(detail.daily_tce_usd).toBe(list.tceUsdPerDay);
    expect(list.tceUsdPerDay).toBeGreaterThan(0);
  });
});

// ── Stored-path founder fallback (3.75% when cargo.commissionPercent is null) ─────
function makeCargo(commissionPercent: number | null): ParsedCargo {
  return {
    emailId: 'comm-cargo',
    itemIndex: 0,
    originPort: { value: 'Hamburg', confidence: 'confirmed' },
    destinationPort: { value: 'Singapore', confidence: 'confirmed' },
    cargoType: 'BULK',
    laycan: '1-15 Aug 2026',
    freightRateUsd: 25,
    cargoDescription: null,
    weightMt: { value: 50000, confidence: 'confirmed' },
    weightMtMin: null, weightMtMax: null, volumeCbm: null, dimensions: null,
    containerType: null, quantity: null, incoterms: null, preferredDates: null,
    loadingRate: null, dischargeRate: null,
    commissionPercent,
    commissionTerms: null, specialRequirements: null, stowageFactor: null,
    missingInfo: [], originCountry: null, destinationCountry: null,
  } as ParsedCargo;
}

const COMM_VESSEL: ParsedVessel = {
  emailId: 'comm-vessel', itemIndex: 0,
  dwtSummer: { value: 55000, confidence: 'confirmed' },
  vesselName: null, imo: null, flag: null, built: null, classSociety: null,
  pandi: null, dwcc: null, draftMax: null, loa: null, beam: null, grt: null, nrt: null,
  holdsCount: null, hatchesCount: null, grainCapacity: null, grainCapacityUnit: null,
  baleCapacity: null, holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
  geared: null, craneCapacity: null, hatchType: null, vesselType: null,
  openPosition: { value: 'Hamburg', confidence: 'confirmed' },
  openDate: null, direction: null, restrictions: [], lastCargoes: null,
  speedLaden: '13', speedBallast: null, consumption: '28', deckCapacity: null,
  specialFeatures: [],
} as ParsedVessel;

describe('computeStoredMatchEconomics — founder fallback 3.75% when commissionPercent null (#1046)', () => {
  test('null commission → 3.75% TTL deducted (fallback fires)', () => {
    const stored = computeStoredMatchEconomics({ cargo: makeCargo(null), vessel: COMM_VESSEL });
    expect(stored.tce_breakdown).not.toBeNull();
    expect(stored.tce_breakdown!.commission_pct).toBe(3.75);
    expect(stored.tce_breakdown!.commission_usd).toBeGreaterThan(0);
  });

  test('explicit zero commission → no deduction (old behaviour, higher TCE than null)', () => {
    const storedNull = computeStoredMatchEconomics({ cargo: makeCargo(null), vessel: COMM_VESSEL });
    const storedZero = computeStoredMatchEconomics({ cargo: makeCargo(0), vessel: COMM_VESSEL });
    expect(storedZero.tce_breakdown!.commission_usd).toBe(0);
    // Zero-commission keeps the legacy (gross) freight → strictly higher per-day TCE than 3.75% fallback.
    expect(storedZero.tce_usd_per_day!).toBeGreaterThan(storedNull.tce_usd_per_day!);
  });

  test('explicit email rate wins over the 3.75 fallback', () => {
    const stored = computeStoredMatchEconomics({ cargo: makeCargo(2.5), vessel: COMM_VESSEL });
    expect(stored.tce_breakdown!.commission_pct).toBe(2.5);
  });
});
