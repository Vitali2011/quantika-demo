/**
 * Regression: list TCE == detail TCE (cross-path parity)
 *
 * Asserts that computeStoredMatchEconomics (the single source of truth for
 * the matches table `tce_usd_per_day` column) and calculateTCE (the detail
 * page's direct engine call) agree within ±$1 for the same voyage inputs.
 *
 * Both sides use excludeWarRiskFromDailyTce: true (the detail-page convention,
 * app/api/voyage/tce/route.ts:373) so war-zone routes do not diverge.
 *
 * Run with: npx jest tests/regression/test_tce_list_detail_parity.test.ts --maxWorkers=1
 * (excluded from the default jest testPathIgnorePatterns — run explicitly)
 */

import Database from 'better-sqlite3';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { calculateTCE } from '@/lib/economics/voyage-calculator';
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { parseLeadingNumber, parseConsumption, deriveEtsCoverage } from '@/lib/matching/tce-calculator';
import { cfValue } from '@/lib/types';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

/** Minimal DB with port_da_estimates rows for the test ports. */
function makeDb(): Database.Database {
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
  // Hamburg (DEHAM) + Singapore (SGSIN) with known DA figures for both cargo types
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

const CARGO: ParsedCargo = {
  emailId: 'parity-cargo',
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

const VESSEL: ParsedVessel = {
  emailId: 'parity-vessel',
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

describe('List TCE ↔ Detail TCE parity (Workstream A5)', () => {
  it('computeStoredMatchEconomics tce_usd_per_day equals calculateTCE daily_tce_usd ±$1', () => {
    const db = makeDb();

    // ── STORED (list) path ────────────────────────────────────────────────────
    const stored = computeStoredMatchEconomics({ cargo: CARGO, vessel: VESSEL, db });
    expect(stored.tce_usd_per_day).not.toBeNull();
    expect(stored.tce_breakdown).not.toBeNull();
    expect(stored.tce_breakdown!.da_usd).toBeGreaterThan(0); // DA is included

    const storedTce = stored.tce_usd_per_day!;

    // ── DETAIL path — reproduce app/api/voyage/tce/route.ts convention ───────
    // Use the same freight rate, distance, duration, DA, canal, ETS as the helper
    // so we're comparing the same voyage, not a divergent approximation.
    const loadPort = cfValue(CARGO.originPort)!;
    const dischargePort = cfValue(CARGO.destinationPort)!;
    const dist = getPortDistance(loadPort, dischargePort)!;
    const openPosition = cfValue(VESSEL.openPosition);
    const ballastResult = openPosition ? getPortDistance(openPosition, loadPort) : null;
    const ballastDistanceNm = ballastResult?.nm ?? undefined;

    const vesselDwt = (cfValue(VESSEL.dwtSummer) ?? 0) as number;
    const quantityMt = resolveCargoWeight(CARGO) ?? 0;
    const speedKts = parseLeadingNumber(VESSEL.speedLaden);
    const consumptionMtPerDay = parseConsumption(VESSEL.consumption);

    // DA: same ports and DWT as the helper — must match stored.tce_breakdown.da_usd
    const daUsd = stored.tce_breakdown!.da_usd;
    const canalUsd = stored.tce_breakdown!.canal_usd;

    // ETS: same EU-leg derivation as helper (deriveEtsCoverage)
    const { originEu, destEu, euLegPercent } = deriveEtsCoverage(loadPort, dischargePort);

    // Duration: same buildCanonicalTceInputs computation as inside the helper
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
      euaPriceEur: 65, // DEFAULT_EUA_EUR
      vesselValueUsd: 22_000_000, // DEFAULT_VESSEL_VALUE_USD
      ballastDistanceNm,
      canalUsd,
      daUsd,
      euLegPercent,
      originEu,
      destEu,
    });

    // Detail-page convention: excludeWarRiskFromDailyTce: true
    const detailResult = calculateTCE({
      ...canonicalInputs,
      excludeWarRiskFromDailyTce: true,
    });
    const detailTce = detailResult.daily_tce_usd;

    // ── Parity assertion ±$1 ──────────────────────────────────────────────────
    const delta = Math.abs(storedTce - detailTce);
    expect(delta).toBeLessThanOrEqual(1);

    // Log for visibility
    console.log(`[A5 parity] stored=${storedTce} detail=${detailTce} delta=${delta}`);
  });

  it('DA is non-zero in stored breakdown (smoke: DA was actually included)', () => {
    const db = makeDb();
    const stored = computeStoredMatchEconomics({ cargo: CARGO, vessel: VESSEL, db });
    expect(stored.tce_breakdown!.da_usd).toBeGreaterThan(0);
  });
});
