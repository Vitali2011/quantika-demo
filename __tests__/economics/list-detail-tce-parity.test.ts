/**
 * Property-based parity test: list tce_usd_per_day === detail daily_tce_usd (#819).
 *
 * Root-cause verified: before Tasks 1-6, computeEstimatedTce had the correct round-trip
 * denominator BUT EconomicsTab used laden-only estimateVoyageDays → DETAIL diverged.
 * After this wave: both go through buildCanonicalTceInputs → they agree to the dollar.
 *
 * Extended (fix-list-vs-detail A+B+C): real ports + live bunker + war-risk-exclude row.
 */
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { calculateTCE } from '@/lib/economics/voyage-calculator';
import { computeEstimatedTce } from '@/lib/matching/tce-calculator';
import { estimateFreightRate } from '@/lib/matching/tce-calculator';

interface Sample {
  name: string;
  vesselDwt: number;
  speedKts: number;
  consumptionMtPerDay: number;
  distanceNm: number;
  quantityMt: number;
  cargoType: string;
}

const SAMPLES: Sample[] = [
  { name: '44101 Marmara→Constanta',   vesselDwt: 3000,  speedKts: 12, consumptionMtPerDay: 8,  distanceNm: 400,   quantityMt: 2500,  cargoType: 'GRAIN' },
  { name: '44100 Odesa→Aliaga',         vesselDwt: 5000,  speedKts: 12, consumptionMtPerDay: 10, distanceNm: 650,   quantityMt: 4000,  cargoType: 'GRAIN' },
  { name: 'Mid-range Antwerp→Lagos',    vesselDwt: 35000, speedKts: 13, consumptionMtPerDay: 22, distanceNm: 4200,  quantityMt: 30000, cargoType: 'GRAIN' },
  { name: 'Long-haul Santos→Qingdao',   vesselDwt: 82000, speedKts: 14, consumptionMtPerDay: 32, distanceNm: 11200, quantityMt: 75000, cargoType: 'GRAIN' },
];

// Constants matching computeEstimatedTce defaults (see tce-calculator.ts)
const DEFAULT_BUNKER_USD_PER_MT = 600;
const DEFAULT_EUA_EUR = 65;
const DEFAULT_VESSEL_VALUE_USD = 22_000_000;

describe('LIST tce_usd_per_day === DETAIL daily_tce_usd (parity, #819)', () => {
  test.each(SAMPLES)('$name — list and detail agree to the dollar', (s) => {
    const freight = estimateFreightRate(s.cargoType, s.distanceNm, s.vesselDwt);

    // LIST path: computeEstimatedTce (what persistSessionMatches writes to tce_usd_per_day)
    const list = computeEstimatedTce(
      { rate: freight.rate, source: freight.source, confidence: freight.confidence },
      s.distanceNm, s.vesselDwt, s.quantityMt, s.speedKts, s.consumptionMtPerDay,
    );

    // DETAIL path: buildCanonicalTceInputs → calculateTCE
    // Uses the SAME defaults as computeEstimatedTce (empty ports, DEFAULT_BUNKER, etc.)
    // so the only potential divergence is the durationDays denominator.
    const inputs = buildCanonicalTceInputs({
      vesselDwt: s.vesselDwt,
      speedKts: s.speedKts,
      consumptionMtPerDay: s.consumptionMtPerDay,
      distanceNm: s.distanceNm,
      quantityMt: s.quantityMt,
      freightRateUsdPerMt: freight.rate,
      bunkerPriceUsdPerMt: DEFAULT_BUNKER_USD_PER_MT,
      originPort: '',
      destinationPort: '',
      euaPriceEur: DEFAULT_EUA_EUR,
      vesselValueUsd: DEFAULT_VESSEL_VALUE_USD,
    });
    const detail = calculateTCE(inputs);

    expect(detail.daily_tce_usd).toBe(list.tce_usd_per_day);
  });

  test('44101-class Marmara→Constanta is HONEST-POSITIVE after Option A fix', () => {
    const s = SAMPLES[0];
    const freight = estimateFreightRate(s.cargoType, s.distanceNm, s.vesselDwt);
    const tce = computeEstimatedTce(
      { rate: freight.rate, source: freight.source, confidence: freight.confidence },
      s.distanceNm, s.vesselDwt, s.quantityMt, s.speedKts, s.consumptionMtPerDay,
    );
    expect(tce.tce_usd_per_day).toBeGreaterThan(0); // no phantom −$1k (pre-fix Tier-3 depressed)
  });

  test('44100-class Odesa→Aliaga is HONEST-POSITIVE', () => {
    const s = SAMPLES[1];
    const freight = estimateFreightRate(s.cargoType, s.distanceNm, s.vesselDwt);
    const tce = computeEstimatedTce(
      { rate: freight.rate, source: freight.source, confidence: freight.confidence },
      s.distanceNm, s.vesselDwt, s.quantityMt, s.speedKts, s.consumptionMtPerDay,
    );
    expect(tce.tce_usd_per_day).toBeGreaterThan(0);
  });

  test('SEAGULL71-like Marmara→Constanta — real ports + live bunker(766) + war-risk-exclude: list==detail', () => {
    // Acceptance row: SEAGULL71 proxy — real HRA ports, live bunker, excludeWarRisk flag on detail path.
    // LIST path uses computeEstimatedTce with empty ports (war-risk $0) + live bunker
    // DETAIL path uses calculateTCE with real ports + excludeWarRiskFromDailyTce=true + same live bunker
    const LIVE_BUNKER = 766;
    const s = { vesselDwt: 3000, speedKts: 12, consumptionMtPerDay: 8, distanceNm: 254, quantityMt: 2500 };
    const freight = estimateFreightRate('GRAIN', s.distanceNm, s.vesselDwt);

    // LIST: live bunker, empty ports (war-risk $0 by design)
    const list = computeEstimatedTce(
      { rate: freight.rate, source: freight.source, confidence: freight.confidence },
      s.distanceNm, s.vesselDwt, s.quantityMt, s.speedKts, s.consumptionMtPerDay,
      undefined, undefined, undefined, LIVE_BUNKER,
    );

    // DETAIL: real ports, same live bunker, war-risk excluded from per-day
    const detailInputs = buildCanonicalTceInputs({
      vesselDwt: s.vesselDwt,
      speedKts: s.speedKts,
      consumptionMtPerDay: s.consumptionMtPerDay,
      distanceNm: s.distanceNm,
      quantityMt: s.quantityMt,
      freightRateUsdPerMt: freight.rate,
      bunkerPriceUsdPerMt: LIVE_BUNKER,
      originPort: 'Marmara',
      destinationPort: 'Constanta',
      euaPriceEur: DEFAULT_EUA_EUR,
      vesselValueUsd: DEFAULT_VESSEL_VALUE_USD,
    });
    const detail = calculateTCE({ ...detailInputs, excludeWarRiskFromDailyTce: true });

    expect(detail.daily_tce_usd).toBe(list.tce_usd_per_day);
    // Sanity: war-risk IS computed and surfaced in breakdown
    expect(detail.breakdown.war_risk_usd).toBeGreaterThanOrEqual(0);
  });
});
