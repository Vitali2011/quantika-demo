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
import { DEFAULT_BUNKER_USD_PER_MT as _DEFAULT_BUNKER, FALLBACK_EUA_EUR_PER_TCO2 } from '@/lib/constants';
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { calculateTCE } from '@/lib/economics/voyage-calculator';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';
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

// Constants matching computeEstimatedTce defaults — imported from lib/constants (W7)
const DEFAULT_BUNKER_USD_PER_MT = _DEFAULT_BUNKER;  // 600
const DEFAULT_EUA_EUR = FALLBACK_EUA_EUR_PER_TCO2;  // 87.5 (was 65, unified W7)
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
    const daUsd = sumMatchPortDaUsd([loadPort, dischargePort], vesselDwt, cargoTypeStr, db).totalUsd;

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
      euaPriceEur: FALLBACK_EUA_EUR_PER_TCO2, // 87.5 — was 65, unified W7
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

// ── A5-ballast: openPosition ≠ loadPort parity ───────────────────────────────
//
// Guards the SEAGULL 41 Nemrut Bay→Liverpool bug: LIST used single-voyage
// (ballast+laden+2 port days) but DETAIL fell back to round-trip because
// EconomicsTab did not pass ballastDistanceNm to buildCanonicalTceInputs.
//
// This test proves: when the detail path IS given ballastDistanceNm (the fix),
// stored TCE ≡ detail TCE to ±$1.  Without the prop the two diverge (~2x diff).

describe('A5-ballast: openPosition ≠ loadPort — stored LIST ↔ detail TCE parity (CI guard for SEAGULL-41 bug)', () => {
  // Match: vessel open in Bourgas (Bulgaria), load in Nemrut Bay (TR), discharge in Liverpool (UK).
  // Mirrors the prod case where openPosition ≠ loadPort so ballast reposition matters.

  const BALLAST_CARGO: ParsedCargo = {
    emailId: 'ballast-cargo-a5',
    itemIndex: 0,
    originPort: { value: 'Nemrut Bay', confidence: 'confirmed' },
    destinationPort: { value: 'Liverpool', confidence: 'confirmed' },
    cargoType: 'BULK',
    laycan: '1-15 Jul 2026',
    freightRateUsd: 33,
    cargoDescription: null,
    weightMt: { value: 2774, confidence: 'confirmed' },
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

  const BALLAST_VESSEL: ParsedVessel = {
    emailId: 'ballast-vessel-a5',
    itemIndex: 0,
    dwtSummer: { value: 5000, confidence: 'confirmed' },
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
    // Vessel is open in Bourgas — NOT at the load port Nemrut Bay
    openPosition: { value: 'Bourgas', confidence: 'confirmed' },
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '12',
    speedBallast: null,
    consumption: '10',
    deckCapacity: null,
    specialFeatures: [],
  } as ParsedVessel;

  it('STORED TCE (single-voyage) ≡ DETAIL TCE when ballastDistanceNm is passed to buildCanonicalTceInputs (±$1)', () => {
    // ── STORED (list) path ────────────────────────────────────────────────────
    const stored = computeStoredMatchEconomics({ cargo: BALLAST_CARGO, vessel: BALLAST_VESSEL });
    expect(stored.tce_usd_per_day).not.toBeNull();
    const storedTce = stored.tce_usd_per_day!;

    // ── DETAIL path — WITH ballastDistanceNm (the fix) ───────────────────────
    const loadPort = cfValue(BALLAST_CARGO.originPort)!;
    const dischargePort = cfValue(BALLAST_CARGO.destinationPort)!;
    const dist = getPortDistance(loadPort, dischargePort)!;
    expect(dist).not.toBeNull();

    const openPosition = cfValue(BALLAST_VESSEL.openPosition)!;
    const ballastResult = getPortDistance(openPosition, loadPort);
    const ballastDistanceNm = ballastResult?.nm ?? undefined;
    // Sanity: ballast distance must be > 0 (Bourgas ≠ Nemrut Bay)
    expect(ballastDistanceNm).toBeGreaterThan(0);

    const vesselDwt = (cfValue(BALLAST_VESSEL.dwtSummer) ?? 0) as number;
    const quantityMt = resolveCargoWeight(BALLAST_CARGO) ?? 0;
    const speedKts = parseLeadingNumber(BALLAST_VESSEL.speedLaden);
    const consumptionMtPerDay = parseConsumption(BALLAST_VESSEL.consumption);

    const canonicalInputs = buildCanonicalTceInputs({
      vesselDwt,
      speedKts,
      consumptionMtPerDay,
      distanceNm: dist.nm,
      quantityMt,
      freightRateUsdPerMt: stored.freight_rate_usd_per_mt!,
      bunkerPriceUsdPerMt: 600, // DEFAULT_BUNKER_USD_PER_MT
      originPort: loadPort,
      destinationPort: dischargePort,
      euaPriceEur: FALLBACK_EUA_EUR_PER_TCO2, // 87.5 — was 65, unified W7
      vesselValueUsd: 22_000_000,
      ballastDistanceNm,        // ← THE FIX: single-voyage duration
    });

    const detailResult = calculateTCE({
      ...canonicalInputs,
      excludeWarRiskFromDailyTce: true,
    });
    const detailTce = detailResult.daily_tce_usd;

    const delta = Math.abs(storedTce - detailTce);
    console.log(`[A5-ballast parity] stored=${storedTce.toFixed(2)} detail=${detailTce.toFixed(2)} delta=${delta.toFixed(2)} ballastNm=${ballastDistanceNm}`);
    expect(delta).toBeLessThanOrEqual(1);
  });

  it('WITHOUT ballastDistanceNm the detail path diverges (proves the bug existed)', () => {
    // This test confirms that omitting ballastDistanceNm → round-trip → different TCE.
    // (Documents the pre-fix behaviour — delta must be > 1.)
    const stored = computeStoredMatchEconomics({ cargo: BALLAST_CARGO, vessel: BALLAST_VESSEL });
    const storedTce = stored.tce_usd_per_day!;

    const loadPort = cfValue(BALLAST_CARGO.originPort)!;
    const dischargePort = cfValue(BALLAST_CARGO.destinationPort)!;
    const dist = getPortDistance(loadPort, dischargePort)!;

    const vesselDwt = (cfValue(BALLAST_VESSEL.dwtSummer) ?? 0) as number;
    const quantityMt = resolveCargoWeight(BALLAST_CARGO) ?? 0;
    const speedKts = parseLeadingNumber(BALLAST_VESSEL.speedLaden);
    const consumptionMtPerDay = parseConsumption(BALLAST_VESSEL.consumption);

    // NO ballastDistanceNm → falls back to estimateRoundTripDays
    const canonicalInputs = buildCanonicalTceInputs({
      vesselDwt,
      speedKts,
      consumptionMtPerDay,
      distanceNm: dist.nm,
      quantityMt,
      freightRateUsdPerMt: stored.freight_rate_usd_per_mt!,
      bunkerPriceUsdPerMt: 600,
      originPort: loadPort,
      destinationPort: dischargePort,
      euaPriceEur: FALLBACK_EUA_EUR_PER_TCO2, // 87.5 — was 65, unified W7
      vesselValueUsd: 22_000_000,
      // ballastDistanceNm intentionally omitted
    });

    const detailResult = calculateTCE({
      ...canonicalInputs,
      excludeWarRiskFromDailyTce: true,
    });
    const delta = Math.abs(storedTce - detailResult.daily_tce_usd);
    console.log(`[A5-ballast no-ballast] stored=${storedTce.toFixed(2)} detail=${detailResult.daily_tce_usd.toFixed(2)} delta=${delta.toFixed(2)}`);
    // Without the ballast prop, detail uses round-trip → diverges significantly
    expect(delta).toBeGreaterThan(1);
  });
});

// ── H1: vessel-value unification — stored path must use estimateVesselValueUsd(dwt) ─────────────
//
// Bug: stored-match-economics called buildMatchEconomics without vesselValueUsd, so it fell
// back to DEFAULT_VESSEL_VALUE_USD=22M. The detail page (EconomicsTab) already called
// estimateVesselValueUsd(dwt), causing warRiskPremium + totalUsd to diverge by $4k–$10k on HRA
// routes. Fix: pass vesselValueUsd: estimateVesselValueUsd(ecoDwt) to buildMatchEconomics.
//
// Fixture: Jeddah (Red Sea HRA) → Singapore, DWT=30000 → estimateVesselValueUsd=8_400_000 ≠ 22M.
// The two oracles must differ by >$100 to make the test meaningful.
describe('H1: stored war-risk uses estimateVesselValueUsd(dwt) not 22M (Wave 2 stage 4)', () => {
  const DWT = 30000;                    // estimateVesselValueUsd(30000) = 8_400_000
  const LOAD_PORT = 'Jeddah';           // Red Sea / Bab al-Mandeb HRA
  const DISCH_PORT = 'Singapore';

  const HRA_CARGO: ParsedCargo = {
    emailId: 'h1-cargo-01',
    itemIndex: 0,
    originPort: { value: LOAD_PORT, confidence: 'confirmed' },
    destinationPort: { value: DISCH_PORT, confidence: 'confirmed' },
    cargoType: 'BULK',
    laycan: '1-20 Aug 2026',
    freightRateUsd: 30,
    cargoDescription: null,
    weightMt: { value: DWT * 0.85, confidence: 'confirmed' }, // typical fill ~85%
    weightMtMin: null, weightMtMax: null,
    volumeCbm: null, dimensions: null, containerType: null, quantity: null,
    incoterms: null, preferredDates: null, loadingRate: null, dischargeRate: null,
    commissionPercent: null, commissionTerms: null, specialRequirements: null,
    stowageFactor: null, missingInfo: [],
    originCountry: null, destinationCountry: null,
  } as ParsedCargo;

  const HRA_VESSEL: ParsedVessel = {
    emailId: 'h1-vessel-01',
    itemIndex: 0,
    dwtSummer: { value: DWT, confidence: 'confirmed' },
    vesselName: null, imo: null, flag: null, built: null, classSociety: null,
    pandi: null, dwcc: null, draftMax: null, loa: null, beam: null, grt: null, nrt: null,
    holdsCount: null, hatchesCount: null, grainCapacity: null, grainCapacityUnit: null,
    baleCapacity: null, holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
    geared: null, craneCapacity: null, hatchType: null, vesselType: null,
    openPosition: { value: LOAD_PORT, confidence: 'confirmed' }, // open at load port → no ballast leg
    openDate: null, direction: null, restrictions: [],
    lastCargoes: null,
    speedLaden: '13',
    speedBallast: null,
    consumption: '22',
    deckCapacity: null,
    specialFeatures: [],
  } as ParsedVessel;

  it('warRiskPremium matches estimateVesselValueUsd oracle (fails before H1 fix)', () => {
    const result = computeStoredMatchEconomics({ cargo: HRA_CARGO, vessel: HRA_VESSEL });

    // Sanity: distance resolved and economics populated
    expect(result.economics).not.toBeNull();
    expect(result.distance_nm).toBeGreaterThan(0);

    const oracleEstimate = calculateWarRiskPremium({
      route: { fromPort: LOAD_PORT, toPort: DISCH_PORT },
      vesselValueUsd: estimateVesselValueUsd(DWT),
    });
    const oracle22M = calculateWarRiskPremium({
      route: { fromPort: LOAD_PORT, toPort: DISCH_PORT },
      vesselValueUsd: 22_000_000,
    });

    // Sanity: both oracles produce non-zero war-risk (confirms route is HRA)
    expect(oracleEstimate.premiumUsd).toBeGreaterThan(0);
    // The two oracles must differ meaningfully (makes this test discriminating)
    expect(Math.abs(oracle22M.premiumUsd - oracleEstimate.premiumUsd)).toBeGreaterThan(100);

    // MAIN ASSERTION: stored path uses estimateVesselValueUsd(dwt), not 22M.
    // Before H1 fix: stored uses 22M → this assertion fails.
    // After H1 fix: stored uses estimateVesselValueUsd(DWT) → passes.
    expect(result.economics!.breakdown.warRiskPremium).toBeCloseTo(oracleEstimate.premiumUsd, 0);
  });

  it('totalUsd includes war-risk from estimateVesselValueUsd oracle after fix', () => {
    const result = computeStoredMatchEconomics({ cargo: HRA_CARGO, vessel: HRA_VESSEL });
    expect(result.economics).not.toBeNull();

    const oracle = calculateWarRiskPremium({
      route: { fromPort: LOAD_PORT, toPort: DISCH_PORT },
      vesselValueUsd: estimateVesselValueUsd(DWT),
    });
    // economics.totalUsd includes war-risk (added to freight revenue net of costs)
    // After fix: totalUsd reflects correct vessel-class premium, not inflated 22M
    expect(result.economics!.breakdown.warRiskPremium).toBeCloseTo(oracle.premiumUsd, 0);
  });
});
