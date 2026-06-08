/**
 * Property-based parity test: list tce_usd_per_day === detail daily_tce_usd (#819).
 *
 * Root-cause verified: before Tasks 1-6, computeEstimatedTce had the correct round-trip
 * denominator BUT EconomicsTab used laden-only estimateVoyageDays → DETAIL diverged.
 * After this wave: both go through buildCanonicalTceInputs → they agree to the dollar.
 *
 * Extended (fix-list-vs-detail A+B+C): real ports + live bunker + war-risk-exclude row.
 * Extended (L2): EU + BlackSea parity rows (#856 — ETS + Bosporus wiring).
 * Extended (Workstream A5): computeStoredMatchEconomics tce_usd_per_day ≡ calculateTCE
 *   daily_tce_usd — the founder's list↔detail parity guard. DA is summed INDEPENDENTLY
 *   via sumMatchPortDaUsd so a DA bug in the helper would be caught (not circular).
 */
import Database from 'better-sqlite3';
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { calculateTCE } from '@/lib/economics/voyage-calculator';
import { computeEstimatedTce, buildMatchEconomics, estimateFreightRate, deriveEtsCoverage, routeTransitsBosporus, quoteBosporusSafe, parseLeadingNumber, parseConsumption } from '@/lib/matching/tce-calculator';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { sumMatchPortDaUsd } from '@/lib/port-da/match-da';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { cfValue } from '@/lib/types';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

interface Sample {
  name: string;
  vesselDwt: number;
  speedKts: number;
  consumptionMtPerDay: number;
  distanceNm: number;
  quantityMt: number;
  cargoType: string;
}

interface ParitySampleL2 {
  name: string;
  loadPort: string;
  dischargePort: string;
  vesselDwt: number;
  speedKts: number;
  consumptionMtPerDay: number;
  distanceNm: number;
  quantityMt: number;
  cargoType: string;
  euaPriceEur: number;
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

describe('L2 parity: EU + BlackSea routes — list (buildMatchEconomics) == detail (route inputs)', () => {
  const L2_SAMPLES: ParitySampleL2[] = [
    // Intra-EU: both GR + IT → coverageFactor 1.0, no Bosporus
    { name: 'Thisvi(GR)→Monfalcone(IT) intra-EU',
      loadPort: 'Thisvi', dischargePort: 'Monfalcone',
      vesselDwt: 18930, speedKts: 12, consumptionMtPerDay: 18,
      distanceNm: 708, quantityMt: 15000, cargoType: 'GRAIN', euaPriceEur: 77 },
    // BlackSea+EU: Reni(UA) non-EU + Constanta(RO) EU → coverageFactor 0.5, no Bosporus (intra-BS)
    { name: 'Reni(UA)→Constanta(RO) one-EU + intra-BlackSea',
      loadPort: 'Reni', dischargePort: 'Constanta',
      vesselDwt: 5000, speedKts: 12, consumptionMtPerDay: 10,
      distanceNm: 590, quantityMt: 4000, cargoType: 'GRAIN', euaPriceEur: 77 },
    // Med→BlackSea+EU: Piraeus(GR, EU) → Constanta(RO, EU) — Bosporus transit + intra-EU coverage 1.0
    { name: 'Piraeus(GR)→Constanta(RO) Bosporus+intra-EU',
      loadPort: 'Piraeus', dischargePort: 'Constanta',
      vesselDwt: 5000, speedKts: 12, consumptionMtPerDay: 10,
      distanceNm: 650, quantityMt: 4000, cargoType: 'GRAIN', euaPriceEur: 77 },
  ];

  test.each(L2_SAMPLES)('$name — list and detail agree to the dollar', (s) => {
    const freight = estimateFreightRate(s.cargoType, s.distanceNm, s.vesselDwt);

    // LIST path: buildMatchEconomics (what pair-analyzer uses for tce_usd_per_day)
    const list = buildMatchEconomics({
      cargoType: s.cargoType,
      distanceNm: s.distanceNm,
      vesselDwt: s.vesselDwt,
      quantityMt: s.quantityMt,
      speedKts: s.speedKts,
      consumptionMt: s.consumptionMtPerDay,
      loadPort: s.loadPort,
      dischargePort: s.dischargePort,
      calculatedAt: '2026-06-08T00:00:00.000Z',
      euaPriceEur: s.euaPriceEur,
    })!;

    // DETAIL path: same exported helpers → same coverage + same canal → same TCE
    const { originEu, destEu, euLegPercent } = deriveEtsCoverage(s.loadPort, s.dischargePort);
    const detailCanalUsd = routeTransitsBosporus(s.loadPort, s.dischargePort)
      ? quoteBosporusSafe(s.vesselDwt)
      : 0;
    const detailInputs = buildCanonicalTceInputs({
      vesselDwt: s.vesselDwt,
      speedKts: s.speedKts,
      consumptionMtPerDay: s.consumptionMtPerDay,
      distanceNm: s.distanceNm,
      quantityMt: s.quantityMt,
      freightRateUsdPerMt: freight.rate,
      bunkerPriceUsdPerMt: DEFAULT_BUNKER_USD_PER_MT,
      originPort: s.loadPort,
      destinationPort: s.dischargePort,
      euaPriceEur: s.euaPriceEur,
      vesselValueUsd: DEFAULT_VESSEL_VALUE_USD,
      euLegPercent,
      originEu,
      destEu,
      canalUsd: detailCanalUsd > 0 ? detailCanalUsd : undefined,
    });
    // excludeWarRiskFromDailyTce matches buildMatchEconomics (which uses empty ports → $0 war risk)
    const detail = calculateTCE({ ...detailInputs, excludeWarRiskFromDailyTce: true });

    expect(detail.daily_tce_usd).toBe(list.tceUsdPerDay);
  });
});

// ── Workstream A5: stored match helper ↔ live detail engine parity ────────────
//
// Guards the founder's exact bug: tce shown on /matches LIST diverged from the
// tce shown on /match/[id] DETAIL because two separate formulas were used.
// After A3/A4 (shared helper), the stored value and the live detail engine MUST
// agree to ±$1 for the same voyage inputs.
//
// Independence requirement: DA is computed via sumMatchPortDaUsd DIRECTLY (not
// borrowed from stored.tce_breakdown.da_usd) so a DA bug in the helper is
// caught rather than masked by circular reuse.

/** Minimal DB with known port DA figures for Hamburg and Singapore. */
function makeParityDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS port_da_estimates (
      port_code TEXT,
      vessel_dwt_min INTEGER,
      vessel_dwt_max INTEGER,
      port_dues_usd REAL,
      pilotage_usd REAL,
      tugs_usd REAL,
      stevedoring_usd_per_mt REAL DEFAULT 0,
      cargo_type TEXT DEFAULT 'general',
      confidence TEXT DEFAULT 'estimated',
      source TEXT DEFAULT 'test'
    );
  `);
  db.prepare(`
    INSERT INTO port_da_estimates
      (port_code, vessel_dwt_min, vessel_dwt_max, port_dues_usd, pilotage_usd, tugs_usd,
       stevedoring_usd_per_mt, cargo_type, confidence, source)
    VALUES
      ('DEHAM', 0, 200000, 20000, 8000, 5000, 0, 'bulk', 'estimated', 'test'),
      ('SGSIN', 0, 200000, 18000, 7000, 5000, 0, 'bulk', 'estimated', 'test'),
      ('DEHAM', 0, 200000, 20000, 8000, 5000, 0, 'general', 'estimated', 'test'),
      ('SGSIN', 0, 200000, 18000, 7000, 5000, 0, 'general', 'estimated', 'test')
  `).run();
  return db;
}

const PARITY_CARGO: ParsedCargo = {
  emailId: 'parity-cargo-a5',
  itemIndex: 0,
  originPort: { value: 'Hamburg', confidence: 'confirmed' },
  destinationPort: { value: 'Singapore', confidence: 'confirmed' },
  cargoType: 'BULK',
  laycan: '1-15 Aug 2025',
  freightRateUsd: 25,
  cargoDescription: null,
  weightMt: { value: 50000, confidence: 'confirmed' },
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  containerType: null,
  quantity: null,
  incoterms: null,
  preferredDates: null,
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: [],
  originCountry: null,
  destinationCountry: null,
} as ParsedCargo;

const PARITY_VESSEL: ParsedVessel = {
  emailId: 'parity-vessel-a5',
  itemIndex: 0,
  dwtSummer: { value: 55000, confidence: 'confirmed' },
  vesselName: null,
  imo: null,
  flag: null,
  built: null,
  classSociety: null,
  pandi: null,
  dwcc: null,
  draftMax: null,
  loa: null,
  beam: null,
  grt: null,
  nrt: null,
  holdsCount: null,
  hatchesCount: null,
  grainCapacity: null,
  grainCapacityUnit: null,
  baleCapacity: null,
  holdDimensions: null,
  hatchDimensions: null,
  tankTopStrength: null,
  geared: null,
  craneCapacity: null,
  hatchType: null,
  vesselType: null,
  openPosition: { value: 'Hamburg', confidence: 'confirmed' },
  openDate: null,
  direction: null,
  restrictions: [],
  lastCargoes: null,
  speedLaden: '13',
  speedBallast: null,
  consumption: '28',
  deckCapacity: null,
  specialFeatures: [],
} as ParsedVessel;

describe('Workstream A5: stored list TCE ↔ live detail TCE parity (CI guard)', () => {
  it('computeStoredMatchEconomics tce_usd_per_day equals calculateTCE daily_tce_usd ±$1 (independent DA)', () => {
    const db = makeParityDb();

    // ── STORED (list) path ────────────────────────────────────────────────────
    const stored = computeStoredMatchEconomics({ cargo: PARITY_CARGO, vessel: PARITY_VESSEL, db });
    expect(stored.tce_usd_per_day).not.toBeNull();
    const storedTce = stored.tce_usd_per_day!;

    // ── DETAIL path — independent oracle ─────────────────────────────────────
    // Mirrors app/api/voyage/tce/route.ts convention (excludeWarRiskFromDailyTce: true).
    // DA is summed INDEPENDENTLY via sumMatchPortDaUsd — NOT borrowed from stored.tce_breakdown.
    const loadPort = cfValue(PARITY_CARGO.originPort)!;
    const dischargePort = cfValue(PARITY_CARGO.destinationPort)!;
    const dist = getPortDistance(loadPort, dischargePort)!;
    const openPosition = cfValue(PARITY_VESSEL.openPosition);
    const ballastResult = openPosition ? getPortDistance(openPosition, loadPort) : null;
    const ballastDistanceNm = ballastResult?.nm ?? undefined;

    const vesselDwt = (cfValue(PARITY_VESSEL.dwtSummer) ?? 0) as number;
    const quantityMt = resolveCargoWeight(PARITY_CARGO) ?? 0;
    const speedKts = parseLeadingNumber(PARITY_VESSEL.speedLaden);
    const consumptionMtPerDay = parseConsumption(PARITY_VESSEL.consumption);

    // DA computed independently from DB — same mechanism the detail API uses.
    // A DA bug in computeStoredMatchEconomics would cause daUsd to differ → parity fails.
    const cargoTypeStr = typeof PARITY_CARGO.cargoType === 'string'
      ? PARITY_CARGO.cargoType
      : (PARITY_CARGO.cargoType as unknown as { value: string })?.value ?? null;
    const daUsd = sumMatchPortDaUsd([loadPort, dischargePort], vesselDwt, cargoTypeStr, db);

    // Canal: Bosporus detection (Hamburg→Singapore does not transit Bosporus, $0)
    const canalUsd = routeTransitsBosporus(loadPort, dischargePort)
      ? quoteBosporusSafe(vesselDwt)
      : 0;

    // ETS coverage
    const { originEu, destEu, euLegPercent } = deriveEtsCoverage(loadPort, dischargePort);

    const canonicalInputs = buildCanonicalTceInputs({
      vesselDwt,
      speedKts,
      consumptionMtPerDay,
      distanceNm: dist.nm,
      quantityMt,
      freightRateUsdPerMt: stored.freight_rate_usd_per_mt!,
      bunkerPriceUsdPerMt: 600, // DEFAULT_BUNKER_USD_PER_MT (matches helper default)
      originPort: loadPort,
      destinationPort: dischargePort,
      euaPriceEur: 65, // DEFAULT_EUA_EUR
      vesselValueUsd: 22_000_000, // DEFAULT_VESSEL_VALUE_USD
      ballastDistanceNm,
      canalUsd: canalUsd > 0 ? canalUsd : undefined,
      daUsd: daUsd > 0 ? daUsd : undefined,
      euLegPercent,
      originEu,
      destEu,
    });

    const detailResult = calculateTCE({
      ...canonicalInputs,
      excludeWarRiskFromDailyTce: true,
    });
    const detailTce = detailResult.daily_tce_usd;

    // ── Parity assertion ±$1 ──────────────────────────────────────────────────
    const delta = Math.abs(storedTce - detailTce);
    console.log(`[A5 parity] stored=${storedTce} detail=${detailTce} delta=${delta}`);
    expect(delta).toBeLessThanOrEqual(1);

    db.close();
  });

  it('DA is non-zero and contributes to stored breakdown (smoke: DA was actually included)', () => {
    const db = makeParityDb();
    const stored = computeStoredMatchEconomics({ cargo: PARITY_CARGO, vessel: PARITY_VESSEL, db });
    expect(stored.tce_breakdown).not.toBeNull();
    expect(stored.tce_breakdown!.da_usd).toBeGreaterThan(0);
    db.close();
  });
});
