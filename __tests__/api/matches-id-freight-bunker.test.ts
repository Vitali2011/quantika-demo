/**
 * C1 bunker-patch regression test — PATCH freight paths must use live bunker price.
 *
 * TDD: written RED first. Tests fail before fix because PATCH handler omits
 * bunkerPriceUsdPerMt when calling computeStoredMatchEconomics.
 */
import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import migration032 from '@/lib/migrations/032-matches';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import { requireSession } from '@/lib/session';

// Mock computeStoredMatchEconomics so we can spy on the bunkerPriceUsdPerMt arg.
// The return value is a minimal valid result — the handler only needs tce_usd_per_day
// and freight_rate_usd_per_mt to proceed.
jest.mock('@/lib/matching/stored-match-economics', () => ({
  computeStoredMatchEconomics: jest.fn(() => ({
    tce_usd_per_day: 50_000,
    freight_rate_usd_per_mt: 25,
    freight_rate_source: 'manual',
    distance_nm: 5_000,
    economics: null,
    tce_breakdown: null,
    consumption_estimated: false,
    ballast_distance_nm: null,
  })),
}));

// Import AFTER jest.mock (mock is hoisted, so the import sees the mock).
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: () => testDb })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

const mockRequireSession = requireSession as jest.Mock;

function seedMatch(db: Database.Database): number {
  const res = db
    .prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('c1', 'v1', 75, '{}', 'shortlist', 'test-sid', Date.now(), Date.now());
  return res.lastInsertRowid as number;
}

function makeRequest(id: string | number, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/matches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function makeParams(id: string | number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('PATCH /api/matches/[id] — freight paths pass live bunker price (C1)', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration023.up(db);
    migration032.up(db);
    migration035.up(db);
    migration036.up(db);
    // Seed NLRTM VLSFO = 791 (live price; default fallback in lib/constants is 600).
    db.prepare(
      `INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at)
       VALUES ('NLRTM', 'VLSFO', 791, date('now'), 'test', datetime('now'))`
    ).run();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    mockRequireSession.mockReturnValue({
      session: { id: 'sess-1', parsedCargos: [], parsedVessels: [] },
      sessionId: 'test-sid',
    });
    (computeStoredMatchEconomics as jest.Mock).mockClear();
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('freight_rate_usd_per_mt PATCH calls computeStoredMatchEconomics with live bunker price 791', async () => {
    const id = seedMatch(db);
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(makeRequest(id, { freight_rate_usd_per_mt: 25 }), makeParams(id));
    expect(res.status).toBe(200);
    expect(computeStoredMatchEconomics).toHaveBeenCalledWith(
      expect.objectContaining({ bunkerPriceUsdPerMt: 791 }),
    );
  });

  it('reset_freight_rate PATCH calls computeStoredMatchEconomics with live bunker price 791', async () => {
    const id = seedMatch(db);
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(makeRequest(id, { reset_freight_rate: true }), makeParams(id));
    expect(res.status).toBe(200);
    expect(computeStoredMatchEconomics).toHaveBeenCalledWith(
      expect.objectContaining({ bunkerPriceUsdPerMt: 791 }),
    );
  });
});
