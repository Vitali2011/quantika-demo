/**
 * Tests — GET /api/matches/[id] (session-isolated match detail)
 *
 * PI2 behavioral tests: real DB calls via in-memory SQLite.
 * Covers:
 *   - valid id + correct session → 200 with match
 *   - missing id → 404
 *   - wrong session id → 404 (session isolation #399)
 *   - invalid id format → 400
 *   - no session → 401
 *   - slug lookup → 200 / 404 (stable cross-session IDs #631)
 *   - feature disabled → 503
 *   - PATCH freight rate override (manual) + reset-to-auto (Wave #7)
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import { estimateFreightRate } from '@/lib/matching/tce-calculator';
import { requireSession } from '@/lib/session';
import { toMatchSlug } from '@/lib/matching/match-slug';

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
const SESSION_B = { session: { id: 'sess-b' }, sessionId: 'user-b' };

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  return db;
}

function seedMatch(
  db: Database.Database,
  userId: string,
  opts: { cargo_type?: string; load_port?: string; discharge_port?: string } = {},
): number {
  const res = db
    .prepare(
      `INSERT INTO matches
         (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
          cargo_type, load_port, discharge_port)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'cargo-1',
      'vessel-1',
      80,
      '{}',
      'shortlist',
      userId,
      Date.now(),
      Date.now(),
      opts.cargo_type ?? 'grain',
      opts.load_port ?? 'UAODS',
      opts.discharge_port ?? 'NLRTM',
    );
  return res.lastInsertRowid as number;
}

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/matches/${id}`);
}

beforeEach(() => {
  mockRequireSession.mockReturnValue(SESSION_A);
});

describe('GET /api/matches/[id] — auth', () => {
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

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'No session' }, { status: 401 }),
    );
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest('1'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/matches/[id] — feature flag', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'false';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('returns 503 when MATCHES_ENABLED=false', async () => {
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest('1'), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(503);
  });
});

describe('GET /api/matches/[id] — PI2 behavioral (valid / missing / wrong-session)', () => {
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

  it('PI2-valid: returns 200 with match data for correct session', async () => {
    const id = seedMatch(db, 'user-a', { cargo_type: 'coal', load_port: 'GBHUL' });
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest(String(id)), { params: Promise.resolve({ id: String(id) }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
    expect(body.cargo_type).toBe('coal');
    expect(body.load_port).toBe('GBHUL');
    expect(body.user_id).toBe('user-a');
  });

  it('PI2-missing: returns 404 when match id does not exist', async () => {
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest('99999'), { params: Promise.resolve({ id: '99999' }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('PI2-wrong-session: returns 404 when match belongs to different session (#399)', async () => {
    // Match owned by user-b
    const id = seedMatch(db, 'user-b');
    // But request is authenticated as user-a
    mockRequireSession.mockReturnValueOnce(SESSION_A);

    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest(String(id)), { params: Promise.resolve({ id: String(id) }) });

    expect(res.status).toBe(404);
  });

  it('PI2-cross: user-b can access their own match when authenticated as user-b', async () => {
    const id = seedMatch(db, 'user-b');
    mockRequireSession.mockReturnValueOnce(SESSION_B);

    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest(String(id)), { params: Promise.resolve({ id: String(id) }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_id).toBe('user-b');
  });

  it('returns 400 for non-numeric id', async () => {
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest('abc'), { params: Promise.resolve({ id: 'abc' }) });

    expect(res.status).toBe(400);
  });

  it('returns 400 for id=0', async () => {
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest('0'), { params: Promise.resolve({ id: '0' }) });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/matches/[id] — slug lookup (#631 stable match IDs)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    mockRequireSession.mockReturnValue(SESSION_A);
  });

  afterEach(() => {
    db.close();
    delete process.env.MATCHES_ENABLED;
  });

  it('PI2-slug: returns 200 when looked up by stable slug', async () => {
    seedMatch(db, 'user-a', { cargo_type: 'iron ore', load_port: 'BRVIX' });
    const slug = toMatchSlug('cargo-1', 'vessel-1');
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest(slug), { params: Promise.resolve({ id: slug }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cargo_id).toBe('cargo-1');
    expect(body.vessel_id).toBe('vessel-1');
  });

  it('PI2-slug-missing: returns 404 for unknown slug', async () => {
    const slug = toMatchSlug('unknown-cargo', 'unknown-vessel');
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest(slug), { params: Promise.resolve({ id: slug }) });

    expect(res.status).toBe(404);
  });

  it('PI2-slug-wrong-session: returns 404 for slug owned by other session', async () => {
    seedMatch(db, 'user-b');
    const slug = toMatchSlug('cargo-1', 'vessel-1');
    mockRequireSession.mockReturnValueOnce(SESSION_A);
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest(slug), { params: Promise.resolve({ id: slug }) });

    expect(res.status).toBe(404);
  });

  it('PI2-slug-stable: same slug works after match row would have new autoincrement id', async () => {
    // Simulate reseed: insert matches in different DB, same cargo+vessel → new autoincrement id
    const slug = toMatchSlug('cargo-1', 'vessel-1');
    // Insert a different match first (bumps autoincrement)
    db.prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES ('other-cargo', 'other-vessel', 50, '{}', 'shortlist', 'user-a', 0, 0)`,
    ).run();
    // Now insert our target match — autoincrement id is 2 now instead of 1
    seedMatch(db, 'user-a');
    const { GET } = await import('@/app/api/matches/[id]/route');
    const res = await GET(makeGetRequest(slug), { params: Promise.resolve({ id: slug }) });

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/matches/[id] — freight rate override + reset (Wave #7)', () => {
  let db: Database.Database;

  function freshDbFreight(): Database.Database {
    const d = new Database(':memory:');
    migration032.up(d);
    migration033.up(d);
    migration034.up(d);
    migration035.up(d);
    migration036.up(d);
    return d;
  }

  function seedFreightMatch(
    database: Database.Database,
    userId: string,
    opts: {
      cargo_type?: string;
      vessel_dwt?: number;
      distance_nm?: number;
      rate?: number;
      source?: string;
    } = {},
  ): number {
    const res = database
      .prepare(
        `INSERT INTO matches
           (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
            cargo_type, load_port, discharge_port, vessel_dwt, distance_nm, tce_usd_per_day,
            freight_rate_usd_per_mt, freight_rate_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cargo-1',
        'vessel-1',
        80,
        '{}',
        'shortlist',
        userId,
        Date.now(),
        Date.now(),
        opts.cargo_type ?? 'GRAIN',
        'NLRTM',
        'DEHAM',
        opts.vessel_dwt ?? 50000,
        opts.distance_nm ?? 3000,
        10000,
        opts.rate ?? 99,
        opts.source ?? 'manual',
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

  beforeEach(() => {
    db = freshDbFreight();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    mockRequireSession.mockReturnValue(SESSION_A);
  });

  afterEach(() => {
    db.close();
    delete process.env.MATCHES_ENABLED;
  });

  it('manual override sets source=manual and the supplied rate', async () => {
    const id = seedFreightMatch(db, 'user-a', { source: 'estimated', rate: 14 });
    const res = await patch(id, { freight_rate_usd_per_mt: 25 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.freight_rate_source).toBe('manual');
    expect(body.freight_rate_usd_per_mt).toBe(25);
    expect(Number.isFinite(body.tce_usd_per_day)).toBe(true);
  });

  it('rejects a non-positive manual rate with 400', async () => {
    const id = seedFreightMatch(db, 'user-a', {});
    expect((await patch(id, { freight_rate_usd_per_mt: 0 })).status).toBe(400);
    expect((await patch(id, { freight_rate_usd_per_mt: -3 })).status).toBe(400);
  });

  it('reset_freight_rate clears a sticky manual override → estimate tier', async () => {
    const id = seedFreightMatch(db, 'user-a', {
      source: 'manual',
      rate: 99,
      cargo_type: 'GRAIN',
      vessel_dwt: 50000,
      distance_nm: 3000,
    });
    const res = await patch(id, { reset_freight_rate: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.freight_rate_source).toBe('estimated');
    // Canonical path uses port distance (NLRTM→DEHAM ≈ 250nm), not stored 3000nm.
    // estimateFreightRate('GRAIN', 250, 50000) is the new expected rate.
    const est = estimateFreightRate('GRAIN', 250, 50000);
    expect(body.freight_rate_usd_per_mt).toBe(est.rate);
    expect(body.freight_rate_usd_per_mt).not.toBe(99);
    expect(Number.isFinite(body.tce_usd_per_day)).toBe(true);
  });

  it('reset on a match owned by another session → 404', async () => {
    const id = seedFreightMatch(db, 'user-b', {});
    mockRequireSession.mockReturnValueOnce(SESSION_A);
    expect((await patch(id, { reset_freight_rate: true })).status).toBe(404);
  });
});
