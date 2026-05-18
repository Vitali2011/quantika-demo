/**
 * RED tests — GET /api/matches + POST /api/matches
 *
 * Covers (Class 9 — E2E behavioral via NextRequest/NextResponse):
 *   - Feature flag MATCHES_ENABLED=false → 503 (PI4)
 *   - Auth: no session → 401
 *   - GET happy path: returns { matches: StoredMatch[] }
 *   - GET: status filter, sort_by, sort_dir, limit, offset query params
 *   - POST happy path: returns 201 + StoredMatch
 *   - POST: missing cargo_id → 400
 *   - POST: missing vessel_id → 400
 *   - POST: empty cargo_id → 400
 *   - POST: empty vessel_id → 400
 *   - Boundary Class 5: status values in GET filter
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
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

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/matches
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /api/matches', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  // PI4 — feature flag OFF
  it('returns 503 when MATCHES_ENABLED=false', async () => {
    process.env.MATCHES_ENABLED = 'false';

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // Auth
  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(401);
  });

  // Happy path
  it('returns 200 with { matches: [] } when no matches exist', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toEqual([]);
  });

  it('returns matches array with StoredMatch shape', async () => {
    // Seed a match directly in the DB
    db.prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('cargo-1', 'vessel-1', 80, '{}', 'shortlist', null, Date.now(), Date.now());

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(1);
    const m = json.matches[0];
    expect(m.id).toBeDefined();
    expect(m.cargo_id).toBe('cargo-1');
    expect(m.vessel_id).toBe('vessel-1');
    expect(m.score).toBe(80);
    expect(m.status).toBe('shortlist');
  });

  // Query params — status filter
  it('filters by ?status=shortlist', async () => {
    db.prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('c1', 'v1', 80, '{}', 'shortlist', null, Date.now(), Date.now());
    db.prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('c2', 'v2', 70, '{}', 'saved', null, Date.now(), Date.now());

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?status=shortlist')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0].status).toBe('shortlist');
  });

  // Boundary Class 5 — all valid status values accepted as query filter
  it.each(['shortlist', 'saved', 'dismissed', 'archived'])(
    'accepts ?status=%s as filter without error',
    async (status) => {
      const { GET } = await import('@/app/api/matches/route');
      const res = await GET(
        new NextRequest(`http://localhost/api/matches?status=${status}`)
      );
      // No server error — 200 is expected even if empty
      expect(res.status).toBe(200);
    }
  );

  // Query params — sort_by / sort_dir
  it('accepts sort_by=score&sort_dir=asc without error', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?sort_by=score&sort_dir=asc')
    );
    expect(res.status).toBe(200);
  });

  it('accepts sort_by=created_at&sort_dir=desc without error', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?sort_by=created_at&sort_dir=desc')
    );
    expect(res.status).toBe(200);
  });

  // Query params — limit / offset
  it('accepts limit and offset params', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?limit=5&offset=0')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.matches)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/matches
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /api/matches', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  // PI4 — feature flag OFF
  it('returns 503 when MATCHES_ENABLED=false', async () => {
    process.env.MATCHES_ENABLED = 'false';

    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ cargo_id: 'c1', vessel_id: 'v1' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // Auth
  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ cargo_id: 'c1', vessel_id: 'v1' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  // Happy path
  it('returns 201 with a StoredMatch when cargo_id and vessel_id provided', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ cargo_id: 'CARGO-1', vessel_id: 'VESSEL-1' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeDefined();
    expect(json.cargo_id).toBe('CARGO-1');
    expect(json.vessel_id).toBe('VESSEL-1');
    expect(json.status).toBe('shortlist');
  });

  it('persists the created match to DB (GET returns it)', async () => {
    const { POST, GET } = await import('@/app/api/matches/route');
    await POST(
      new NextRequest('http://localhost/api/matches', {
        method: 'POST',
        body: JSON.stringify({ cargo_id: 'CARGO-2', vessel_id: 'VESSEL-2' }),
      })
    );

    const res = await GET(new NextRequest('http://localhost/api/matches'));
    const json = await res.json();
    expect(json.matches.some((m: { cargo_id: string }) => m.cargo_id === 'CARGO-2')).toBe(true);
  });

  // Validation — Boundary Class 1: missing / empty fields

  it('returns 400 when cargo_id is missing', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ vessel_id: 'VESSEL-1' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when vessel_id is missing', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ cargo_id: 'CARGO-1' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when cargo_id is empty string (Class 1)', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ cargo_id: '', vessel_id: 'VESSEL-1' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when vessel_id is empty string (Class 1)', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({ cargo_id: 'CARGO-1', vessel_id: '' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when body is completely empty', async () => {
    const { POST } = await import('@/app/api/matches/route');
    const req = new NextRequest('http://localhost/api/matches', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});
