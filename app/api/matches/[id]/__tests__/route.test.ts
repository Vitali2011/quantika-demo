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
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
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
