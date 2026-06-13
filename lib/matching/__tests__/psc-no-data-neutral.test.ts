/**
 * audit A.2 — honest PSC "no data" instead of fake zero.
 *
 * The demo DB ships with an empty psc_detention_history table, so every vessel
 * with an IMO used to get detentionCount=0 → fit-breakdown rendered
 * "0 detentions" as if the vessel was checked and is clean. The fix: when a
 * vessel has NO inspection rows at all, detentionCount stays undefined → the
 * vetting factor scores neutral and the "N detentions" bracketData is omitted.
 * A real count (including 0 across real inspections) still surfaces.
 *
 * Exercises the REAL analyzePairs path with an in-memory db — mirrors the
 * setup of vetting-wiring.test.ts (Shanghai→Rotterdam grain pair that reliably
 * clears all hard gates).
 */

import Database from 'better-sqlite3';
import migration026 from '@/lib/migrations/026-charterers';
import migration028 from '@/lib/migrations/028-psc-history';
import { upsertInspection } from '@/lib/market/psc-repository';
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

const TODAY = new Date('2026-05-28T00:00:00Z');
const NO_DATA_IMO = '9540015'; // not present in any fixture/seed

function makeMatchableCargo(): ParsedCargo {
  return {
    emailId: 'psc-no-data-cargo',
    itemIndex: 0,
    originPort: { value: 'Shanghai', confidence: 'confirmed' },
    originCountry: 'China',
    destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
    destinationCountry: 'Netherlands',
    cargoDescription: { value: 'Grain', confidence: 'confirmed' },
    weightMt: { value: 50000, confidence: 'confirmed' },
    weightMtMin: 50000,
    weightMtMax: 50000,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: 50000,
    incoterms: null,
    preferredDates: null,
    laycan: '2026-10-01 .. 2026-10-20',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    freightRateUsd: null,
  };
}

function makeMatchableVessel(over: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'psc-no-data-vessel',
    itemIndex: 0,
    vesselName: { value: 'MV NO PSC DATA', confidence: 'confirmed' },
    imo: null,
    flag: 'Marshall Islands',
    built: 2015,
    classSociety: 'DNV',
    pandi: 'Gard',
    dwtSummer: { value: 55000, confidence: 'confirmed' },
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
    geared: false,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'Bulk Carrier',
    openPosition: { value: 'Singapore', confidence: 'confirmed' },
    openDate: { value: '2026-09-15', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '14.0',
    speedBallast: '14.5',
    consumption: '30 mt IFO',
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
    ...over,
  };
}

async function vettingComponentFor(db: Database.Database, suffix: string) {
  const cargo = { ...makeMatchableCargo(), emailId: `psc-no-data-cargo-${suffix}` };
  const vessel = makeMatchableVessel({
    imo: NO_DATA_IMO,
    emailId: `psc-no-data-vessel-${suffix}`,
  });
  const r = await analyzePairs([cargo], [vessel], async () => [], {
    refYear: 2026,
    today: TODAY,
    db,
  });
  const m = r.matches[0] ?? r.lowConfidenceMatches[0];
  expect(m).toBeDefined();
  expect(m!.fitBreakdown).toBeDefined();
  const vetting = m!.fitBreakdown!.components.find((c) => c.factor === 'vetting');
  expect(vetting).toBeDefined();
  return vetting!;
}

describe('PSC no-data neutral — pair-analyzer wiring (audit A.2)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    migration028.up(db);
  });

  afterEach(() => db.close());

  it('vessel IMO with NO psc rows → vetting has no "detentions" bracketData (factor neutral)', async () => {
    const vetting = await vettingComponentFor(db, 'empty');
    expect(vetting.bracketData ?? '').not.toContain('detentions');
  });

  it('after a detained inspection row → vetting bracketData shows the real count', async () => {
    upsertInspection(db, {
      id: 'psc-no-data-i1',
      imo: NO_DATA_IMO,
      inspection_date: '2025-03-01',
      port: 'Rotterdam',
      authority: 'paris-mou',
      deficiencies: 7,
      detained: true,
      source_url: null,
    });
    const vetting = await vettingComponentFor(db, 'detained');
    expect(vetting.bracketData).toContain('1 detentions');
  });
});
