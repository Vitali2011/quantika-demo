/**
 * WAVE 3 — PATCH freight path uses computeStoredMatchEconomics (canonical TCE).
 *
 * Key invariant: both PATCH branches (manual override + reset) must persist
 * tce_usd_per_day from computeStoredMatchEconomics, never from the stripped
 * computeEstimatedTce (which lacks DA, uses stale stored distance, and includes
 * war-risk in the headline). Closes I4.
 *
 * Test scenario:
 *   load_port=Piraeus, discharge_port=Rotterdam (≈2850nm in distance table).
 *   stored distance_nm=9999 (intentionally wrong — makes old vs new measurably
 *   different: old used stored 9999nm, new uses port-distance 2850nm).
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration042 from '@/lib/migrations/042-matches-fit';
import migration044 from '@/lib/migrations/044-matches-item-index';
import { computeEstimatedTce } from '@/lib/matching/tce-calculator';
import { DEFAULT_BUNKER_USD_PER_MT } from '@/lib/constants';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { requireSession } from '@/lib/session';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

const mockRequireSession = requireSession as jest.Mock;
const SESSION_A = { session: { id: 'sess-a' }, sessionId: 'user-a' };

const CARGO_ID = 'cargo-w3-001';
const VESSEL_ID = 'vessel-w3-001';
const LOAD_PORT = 'Piraeus';
const DISCHARGE_PORT = 'Rotterdam';
const VESSEL_DWT = 50_000;
const STORED_DISTANCE = 9_999;

function freshDb(): Database.Database {
  const d = new Database(':memory:');
  migration032.up(d);
  migration033.up(d);
  migration034.up(d);
  migration035.up(d);
  migration036.up(d);
  migration042.up(d);
  migration044.up(d);
  return d;
}

function seedMatch(database: Database.Database, userId: string): number {
  const res = database.prepare(
    `INSERT INTO matches
       (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
        cargo_type, load_port, discharge_port, vessel_dwt, distance_nm,
        tce_usd_per_day, freight_rate_usd_per_mt, freight_rate_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    CARGO_ID, VESSEL_ID, 75, '{}', 'shortlist',
    userId, Date.now(), Date.now(),
    'GRAIN', LOAD_PORT, DISCHARGE_PORT,
    VESSEL_DWT, STORED_DISTANCE,
    10_000, 15, 'estimated',
  );
  return res.lastInsertRowid as number;
}

async function patch(id: number, body: unknown) {
  const { PATCH } = await import('@/app/api/matches/[id]/route');
  const req = new NextRequest(`http://localhost/api/matches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return PATCH(req, { params: Promise.resolve({ id: String(id) }) });
}

function makeCargoProxy(): ParsedCargo {
  const cf = <T>(v: T | null) => (v != null ? { value: v, confidence: 'interpreted' as const } : null);
  return {
    emailId: CARGO_ID,
    itemIndex: 0,
    originPort: cf(LOAD_PORT),
    destinationPort: cf(DISCHARGE_PORT),
    cargoType: null as unknown as 'BULK',
    cargoDescription: null,
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    freightRateUsd: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    originCountry: null,
    destinationCountry: null,
  };
}

function makeVesselProxy(): ParsedVessel {
  const cf = <T>(v: T | null) => (v != null ? { value: v, confidence: 'interpreted' as const } : null);
  return {
    emailId: VESSEL_ID,
    itemIndex: 0,
    vesselName: null,
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: cf(VESSEL_DWT),
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
    openPosition: null,
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
  };
}

beforeEach(() => {
  mockRequireSession.mockReturnValue(SESSION_A);
});

describe('WAVE 3 — PATCH uses canonical computeStoredMatchEconomics', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    delete process.env.MATCHES_ENABLED;
  });

  it('PI2-manual-override: tce_usd_per_day from PATCH matches computeStoredMatchEconomics, differs from computeEstimatedTce', async () => {
    const id = seedMatch(db, 'user-a');
    const res = await patch(id, { freight_rate_usd_per_mt: 25 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.freight_rate_source).toBe('manual');
    expect(body.freight_rate_usd_per_mt).toBe(25);

    // Canonical path (new): port-distance-based, war-risk excluded from headline
    const canonical = computeStoredMatchEconomics({
      cargo: makeCargoProxy(),
      vessel: makeVesselProxy(),
      db,
      freightOverrideUsdPerMt: 25,
    });
    expect(canonical.tce_usd_per_day).not.toBeNull();
    expect(body.tce_usd_per_day).toBeCloseTo(canonical.tce_usd_per_day!, 0);

    // Old stripped path used stored distance_nm=9999 — measurably different
    const oldTce = computeEstimatedTce(
      { rate: 25, source: 'manual', confidence: 1 },
      STORED_DISTANCE,
      VESSEL_DWT,
      0,
      undefined, undefined, undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
    ).tce_usd_per_day;
    expect(body.tce_usd_per_day).not.toBeCloseTo(oldTce, 0);
  });

  it('PI2-reset: reset_freight_rate recomputes via canonical path — source=estimated, finite TCE', async () => {
    const id = seedMatch(db, 'user-a');
    const res = await patch(id, { reset_freight_rate: true });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.freight_rate_source).toBe('estimated');
    expect(body.freight_rate_usd_per_mt).toBeGreaterThan(0);
    expect(Number.isFinite(body.tce_usd_per_day)).toBe(true);

    // TCE from canonical (port-based 2850nm) differs from old stripped (stored 9999nm)
    const oldEstTce = computeEstimatedTce(
      { rate: body.freight_rate_usd_per_mt, source: 'estimated', confidence: 0.6 },
      STORED_DISTANCE,
      VESSEL_DWT,
      0,
      undefined, undefined, undefined, undefined, undefined, DEFAULT_BUNKER_USD_PER_MT,
    ).tce_usd_per_day;
    expect(body.tce_usd_per_day).not.toBeCloseTo(oldEstTce, 0);
  });
});
