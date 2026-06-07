/**
 * Behavioral tests — PSC detentions lower fit (L3 vetting wiring, Lane B).
 *
 * PI2: calls real analyzePairs with a real in-memory db seeded with PSC fixture
 * rows — no string-match checks, full engine path exercised.
 *
 * Uses the same cargo/vessel pair shape from pair-analyzer-tce-into-fit.test.ts
 * (Shanghai→Rotterdam grain, ~50kt, open Singapore) which reliably produces a
 * scored match (clears all hard gates, has resolvable port distance).
 */

import Database from 'better-sqlite3';
import migration026 from '@/lib/migrations/026-charterers';
import migration028 from '@/lib/migrations/028-psc-history';
import { PSC_FIXTURE } from '@/lib/knowledge/sources/psc/fixture';
import { upsertInspection, getDetentionCount } from '@/lib/market/psc-repository';
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import { resolveChartererTier } from '@/lib/matching/charterer-tier';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

const TODAY = new Date('2026-05-28T00:00:00Z');

function makeMatchableCargo(): ParsedCargo {
  return {
    emailId: 'vetting-wiring-cargo',
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
    emailId: 'vetting-wiring-vessel',
    itemIndex: 0,
    vesselName: { value: 'MV VETTING TEST', confidence: 'confirmed' },
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

describe('vetting wiring — PSC detentions lower fit (behavioral)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration026.up(db);
    migration028.up(db);
    for (const rec of PSC_FIXTURE) upsertInspection(db, rec);
  });

  afterEach(() => db.close());

  it('getDetentionCount fires on a fixture IMO within the 3yr window', () => {
    expect(getDetentionCount(db, '9478999', '2023-01-01')).toBeGreaterThanOrEqual(2);
    expect(getDetentionCount(db, '9156789', '2023-01-01')).toBe(0); // clean IMO
  });

  it('same vessel with a detained IMO scores lower fit than with a clean IMO', async () => {
    const cargo = makeMatchableCargo();
    const detainedVessel = makeMatchableVessel({ imo: '9478999', emailId: 'vessel-detained' });
    const cleanVessel = makeMatchableVessel({ imo: '9156789', emailId: 'vessel-clean' });

    const rDetained = await analyzePairs(
      [cargo],
      [detainedVessel],
      async () => [],
      { refYear: 2026, today: TODAY, db },
    );
    const rClean = await analyzePairs(
      [{ ...cargo, emailId: 'vetting-wiring-cargo-clean' }],
      [cleanVessel],
      async () => [],
      { refYear: 2026, today: TODAY, db },
    );

    const fitDetained =
      rDetained.matches[0]?.fitPercent ?? rDetained.lowConfidenceMatches[0]?.fitPercent;
    const fitClean =
      rClean.matches[0]?.fitPercent ?? rClean.lowConfidenceMatches[0]?.fitPercent;

    expect(fitDetained).toBeDefined();
    expect(fitClean).toBeDefined();
    expect(fitDetained!).toBeLessThan(fitClean!);
  });

  it('resolveChartererTier returns null today (documented gap)', () => {
    expect(resolveChartererTier(db, makeMatchableCargo())).toBeNull();
  });
});
