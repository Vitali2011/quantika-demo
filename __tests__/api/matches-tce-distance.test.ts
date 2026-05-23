/**
 * PI2 behavioral tests — tce_usd_per_day + distance_nm in /api/matches.
 *
 * Covers:
 *   - GET /api/matches returns tce_usd_per_day and distance_nm fields per match
 *   - GET: tce_usd_per_day is null when not set (NULL fallback)
 *   - GET: distance_nm is numeric when set
 *   - POST /api/matches: accepts distance_nm and returns it in response
 *   - POST /api/matches: non-finite tce_usd_per_day is coerced to null
 *   - createMatch repository: stores distance_nm and retrieves correctly
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import { createMatch, getMatch } from '@/lib/matching/matches-repository';
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

const AUTHENTICATED_SESSION = {
  session: { id: 'sess-1', parsedCargos: [], parsedVessels: [] },
  sessionId: 'test-sid',
};

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  return db;
}

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
  process.env.MATCHES_ENABLED = 'true';
});

// ──────────────────────────────────────────────────────────────────────────────
// Repository unit tests
// ──────────────────────────────────────────────────────────────────────────────

describe('createMatch — tce + distance fields', () => {
  it('stores distance_nm and retrieves it', () => {
    const db = freshDb();
    const created = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 80,
      reason: 'test',
      user_id: 'user-1',
      distance_nm: 3200,
      tce_usd_per_day: null,
    });
    const fetched = getMatch(db, created.id);
    expect(fetched?.distance_nm).toBe(3200);
    expect(fetched?.tce_usd_per_day).toBeNull();
  });

  it('stores tce_usd_per_day and retrieves it', () => {
    const db = freshDb();
    const created = createMatch(db, {
      cargo_id: 'c2',
      vessel_id: 'v2',
      score: 70,
      reason: 'test',
      user_id: 'user-1',
      distance_nm: null,
      tce_usd_per_day: 15000,
    });
    const fetched = getMatch(db, created.id);
    expect(fetched?.tce_usd_per_day).toBe(15000);
    expect(fetched?.distance_nm).toBeNull();
  });

  it('defaults both fields to null when omitted', () => {
    const db = freshDb();
    const created = createMatch(db, {
      cargo_id: 'c3',
      vessel_id: 'v3',
      score: 60,
      reason: 'test',
      user_id: 'user-1',
    });
    const fetched = getMatch(db, created.id);
    expect(fetched?.distance_nm).toBeNull();
    expect(fetched?.tce_usd_per_day).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/matches — behavioral (PI2: real client.get() via NextRequest)
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/matches — tce + distance fields in response', () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('returns tce_usd_per_day=null and distance_nm=null when not set', async () => {
    createMatch(testDb, {
      cargo_id: 'cargo-1',
      vessel_id: 'vessel-1',
      score: 80,
      reason: 'test',
      user_id: 'test-sid',
      tce_usd_per_day: null,
      distance_nm: null,
    });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].tce_usd_per_day).toBeNull();
    expect(json.matches[0].distance_nm).toBeNull();
  });

  it('returns distance_nm when set', async () => {
    createMatch(testDb, {
      cargo_id: 'cargo-2',
      vessel_id: 'vessel-2',
      score: 75,
      reason: 'test',
      user_id: 'test-sid',
      tce_usd_per_day: null,
      distance_nm: 2850,
    });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].distance_nm).toBe(2850);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/matches — behavioral
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /api/matches — tce + distance fields', () => {
  beforeEach(() => {
    testDb = freshDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it('accepts distance_nm in POST body and returns it', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const res = await POST(
      new NextRequest('http://localhost/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo_id: 'cargo-post',
          vessel_id: 'vessel-post',
          score: 70,
          reason: 'post test',
          distance_nm: 4100,
          tce_usd_per_day: null,
        }),
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.distance_nm).toBe(4100);
    expect(json.tce_usd_per_day).toBeNull();
  });

  it('coerces non-finite tce_usd_per_day to null', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const res = await POST(
      new NextRequest('http://localhost/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo_id: 'cargo-inf',
          vessel_id: 'vessel-inf',
          score: 65,
          reason: 'inf test',
          tce_usd_per_day: 'not-a-number',
          distance_nm: null,
        }),
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.tce_usd_per_day).toBeNull();
  });
});
