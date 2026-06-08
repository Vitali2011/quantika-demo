/**
 * Parity test — persist-session-matches.ts A4 fix
 *
 * Verifies that persistSessionMatches stores tce_usd_per_day that equals
 * computeStoredMatchEconomics for the same cargo/vessel pair (DA included).
 * Pre-A4, the path called computeEstimatedTce without da_usd, so stored TCE
 * was higher than the helper value.
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { listMatches } from '@/lib/matching/matches-repository';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

const CARGO_EMAIL_ID = 'persist-da-parity-cargo';
const VESSEL_EMAIL_ID = 'persist-da-parity-vessel';

/** Minimal port_da_estimates table with non-zero entries. */
function addPortDaFixture(db: Database.Database): void {
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
}

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  addPortDaFixture(db);
  return db;
}

const CARGO: ParsedCargo = {
  emailId: CARGO_EMAIL_ID,
  itemIndex: 0,
  originPort: { value: 'Hamburg', confidence: 'confirmed' },
  destinationPort: { value: 'Singapore', confidence: 'confirmed' },
  cargoType: 'BULK',
  laycan: '1-15 Jul 2025',
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
};

const VESSEL: ParsedVessel = {
  emailId: VESSEL_EMAIL_ID,
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
};

const SESSION_MATCH: Match = {
  cargoEmailId: CARGO_EMAIL_ID,
  cargoItemIndex: 0,
  vesselEmailId: VESSEL_EMAIL_ID,
  vesselItemIndex: 0,
  score: 80,
  matchLevel: 'good',
  matchReasons: ['DWT fits'],
  issues: [],
};

describe('persistSessionMatches — port-DA parity (A4)', () => {
  it('stores tce_usd_per_day equal to computeStoredMatchEconomics (DA included)', () => {
    const db = freshDb();

    persistSessionMatches(db, 'da-persist-session', [SESSION_MATCH], [CARGO], [VESSEL]);

    const [stored] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(stored).toBeDefined();
    expect(stored.tce_usd_per_day).not.toBeNull();

    // Reference value from the shared helper (single source of truth)
    const ref = computeStoredMatchEconomics({ cargo: CARGO, vessel: VESSEL, db });
    expect(ref.tce_usd_per_day).not.toBeNull();
    expect(ref.tce_breakdown!.da_usd).toBeGreaterThan(0);

    // The stored value must equal the helper value (DA included)
    expect(stored.tce_usd_per_day).toBe(ref.tce_usd_per_day);
  });
});
