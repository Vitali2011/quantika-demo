/**
 * RED tests — PATCH /api/matches/[id]
 *
 * Covers (Class 9 — E2E behavioral):
 *   - Feature flag MATCHES_ENABLED=false → 503 (PI4)
 *   - Auth: no session → 401
 *   - PATCH happy path: valid transition → 200 + updated StoredMatch
 *   - Invalid transition → 400
 *   - Match not found → 404
 *   - Missing status field in body → 400
 *   - Invalid status value → 400
 *   - Boundary Class 5: all valid MatchStatus target values
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import { requireSession } from '@/lib/session';
import type { MatchStatus } from '@/lib/matching/matches-repository';

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

function seedMatch(
  db: Database.Database,
  status: MatchStatus = 'shortlist'
): number {
  const res = db
    .prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('c1', 'v1', 75, '{}', status, null, Date.now(), Date.now());
  return res.lastInsertRowid as number;
}

function makeRequest(id: string | number, body: unknown, method = 'PATCH'): NextRequest {
  return new NextRequest(`http://localhost/api/matches/${id}`, {
    method,
    body: JSON.stringify(body),
  });
}

function makeParams(id: string | number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Feature flag
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/[id] — feature flag', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    testDb = db;
    process.env.MATCHES_ENABLED = 'false';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('returns 503 when MATCHES_ENABLED=false (PI4)', async () => {
    const id = seedMatch(db);
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'saved' }),
      makeParams(id)
    );

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/[id] — auth', () => {
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

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const id = seedMatch(db);
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'saved' }),
      makeParams(id)
    );

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Happy path — valid transitions via API
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/[id] — valid transitions', () => {
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

  it('returns 200 and updated StoredMatch for shortlist → saved', async () => {
    const id = seedMatch(db, 'shortlist');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'saved' }),
      makeParams(id)
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(id);
    expect(json.status).toBe('saved');
  });

  it('returns 200 and updated StoredMatch for shortlist → dismissed', async () => {
    const id = seedMatch(db, 'shortlist');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'dismissed' }),
      makeParams(id)
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('dismissed');
  });

  it('returns 200 and updated StoredMatch for shortlist → archived', async () => {
    const id = seedMatch(db, 'shortlist');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'archived' }),
      makeParams(id)
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('archived');
  });

  it('returns 200 for saved → archived', async () => {
    const id = seedMatch(db, 'saved');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'archived' }),
      makeParams(id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('archived');
  });

  it('returns 200 for saved → dismissed', async () => {
    const id = seedMatch(db, 'saved');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'dismissed' }),
      makeParams(id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('dismissed');
  });

  it('returns 200 for dismissed → archived', async () => {
    const id = seedMatch(db, 'dismissed');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'archived' }),
      makeParams(id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('archived');
  });

  it('returns 200 for dismissed → saved', async () => {
    const id = seedMatch(db, 'dismissed');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'saved' }),
      makeParams(id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('saved');
  });

  it('returns 200 for archived → saved', async () => {
    const id = seedMatch(db, 'archived');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'saved' }),
      makeParams(id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('saved');
  });

  it('response includes all StoredMatch fields', async () => {
    const id = seedMatch(db, 'shortlist');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'saved' }),
      makeParams(id)
    );

    const json = await res.json();
    expect(json.id).toBeDefined();
    expect(json.cargo_id).toBe('c1');
    expect(json.vessel_id).toBe('v1');
    expect(typeof json.score).toBe('number');
    expect(typeof json.reason).toBe('string');
    expect(json.status).toBe('saved');
    expect(typeof json.created_at).toBe('number');
    expect(typeof json.updated_at).toBe('number');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Invalid transitions → 400
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/[id] — invalid transitions → 400', () => {
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

  it('shortlist → shortlist returns 400', async () => {
    const id = seedMatch(db, 'shortlist');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(makeRequest(id, { status: 'shortlist' }), makeParams(id));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('saved → shortlist returns 400', async () => {
    const id = seedMatch(db, 'saved');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(makeRequest(id, { status: 'shortlist' }), makeParams(id));
    expect(res.status).toBe(400);
  });

  it('archived → dismissed returns 400', async () => {
    const id = seedMatch(db, 'archived');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(makeRequest(id, { status: 'dismissed' }), makeParams(id));
    expect(res.status).toBe(400);
  });

  it('archived → archived returns 400', async () => {
    const id = seedMatch(db, 'archived');
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(makeRequest(id, { status: 'archived' }), makeParams(id));
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Not found → 404
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/[id] — not found → 404', () => {
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

  it('returns 404 when match id does not exist', async () => {
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(99999, { status: 'saved' }),
      makeParams(99999)
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Validation — missing / invalid status body
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/[id] — body validation', () => {
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

  it('returns 400 when status field is missing', async () => {
    const id = seedMatch(db);
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, {}),
      makeParams(id)
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when status is an invalid enum value (Class 5)', async () => {
    const id = seedMatch(db);
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: 'pending' }),
      makeParams(id)
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when status is empty string (Class 1)', async () => {
    const id = seedMatch(db);
    const { PATCH } = await import('@/app/api/matches/[id]/route');
    const res = await PATCH(
      makeRequest(id, { status: '' }),
      makeParams(id)
    );

    expect(res.status).toBe(400);
  });
});
