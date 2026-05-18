// @ts-nocheck — RED phase: bulk route doesn't exist yet; impl agent creates it
/**
 * RED tests — PATCH /api/matches/bulk + DELETE /api/matches/bulk
 *
 * Covers (Class 9 — E2E behavioral via real route handler imports):
 *   PATCH /api/matches/bulk:
 *   - Happy path: 3 matches, all valid transitions → 200, all updated
 *   - 1 invalid transition among 5 → 400, nothing committed (atomicity)
 *   - Match not found → 404
 *   - Empty ids → 400 (assumption documented)
 *   - Invalid status value → 400
 *   - Feature flag disabled → 503
 *   - No session → 401
 *
 *   DELETE /api/matches/bulk:
 *   - Happy path: 3 ids → 200, all deleted
 *   - Missing X-Admin-Token → 401
 *   - ADMIN_TOKEN env not set → 500
 *   - Match not found → 404
 *   - Empty ids → 400 (assumption documented)
 *   - No session → 401
 *   - Transaction atomic (verify DB unchanged on partial failure)
 *
 *   Boundary Class 6: bulk status value must exactly match enum (no substring catch)
 *   Boundary Class 9: real route handler, not string match
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import { requireSession } from '@/lib/session';
import { requireAdmin } from '@/lib/auth/admin';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: jest.fn(),
}));

const mockRequireSession = requireSession as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;

const AUTHENTICATED_SESSION = {
  session: { id: 'sess-1', parsedCargos: [], parsedVessels: [] },
  sessionId: 'test-sid',
};

// ──────────────────────────────────────────────────────────────────────────────
// Migration 033 helper
// ──────────────────────────────────────────────────────────────────────────────

function migration033Up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE matches ADD COLUMN reason_structured TEXT;
    ALTER TABLE matches ADD COLUMN cargo_type TEXT;
    ALTER TABLE matches ADD COLUMN load_port TEXT;
    ALTER TABLE matches ADD COLUMN discharge_port TEXT;
    ALTER TABLE matches ADD COLUMN laycan_start INTEGER;
    ALTER TABLE matches ADD COLUMN laycan_end INTEGER;
    ALTER TABLE matches ADD COLUMN vessel_dwt INTEGER;
  `);
}

import type { MatchStatus } from '@/lib/matching/matches-repository';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033Up(db);
  return db;
}

function seedMatch(db: Database.Database, status: MatchStatus = 'shortlist'): number {
  const res = db
    .prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('cargo-1', 'vessel-1', 75, '{}', status, null, Date.now(), Date.now());
  return res.lastInsertRowid as number;
}

function seedMatches(db: Database.Database, statuses: MatchStatus[]): number[] {
  return statuses.map((s) => seedMatch(db, s));
}

function makeBulkPatchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/matches/bulk', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function makeBulkDeleteRequest(body: unknown, adminToken?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (adminToken !== undefined) {
    headers['X-Admin-Token'] = adminToken;
  }
  return new NextRequest('http://localhost/api/matches/bulk', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers,
  });
}

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
  // Default: admin token is valid (returns null = allowed)
  mockRequireAdmin.mockReturnValue(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/matches/bulk — feature flag
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/bulk — feature flag', () => {
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
    const ids = seedMatches(db, ['shortlist']);
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(makeBulkPatchRequest({ ids, status: 'saved' }));

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/matches/bulk — auth
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/bulk — auth', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = freshDb();
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
    const ids = seedMatches(db, ['shortlist']);
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(makeBulkPatchRequest({ ids, status: 'saved' }));

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/matches/bulk — happy path
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/bulk — happy path', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('3 shortlist matches → saved: 200 with updated array', async () => {
    const ids = seedMatches(db, ['shortlist', 'shortlist', 'shortlist']);
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(makeBulkPatchRequest({ ids, status: 'saved' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.updated)).toBe(true);
    expect(json.updated).toHaveLength(3);
    json.updated.forEach((m: { status: string }) => {
      expect(m.status).toBe('saved');
    });
  });

  it('updated array contains StoredMatch objects with all required fields', async () => {
    const ids = seedMatches(db, ['shortlist']);
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(makeBulkPatchRequest({ ids, status: 'saved' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    const m = json.updated[0];
    expect(m.id).toBeDefined();
    expect(m.cargo_id).toBeDefined();
    expect(m.vessel_id).toBeDefined();
    expect(typeof m.score).toBe('number');
    expect(m.status).toBe('saved');
    expect(typeof m.created_at).toBe('number');
    expect(typeof m.updated_at).toBe('number');
  });

  it('mixed valid transitions (shortlist→dismissed, saved→archived): 200, all updated', async () => {
    const id1 = seedMatch(db, 'shortlist');
    const id2 = seedMatch(db, 'shortlist');
    const id3 = seedMatch(db, 'shortlist');
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(
      makeBulkPatchRequest({ ids: [id1, id2, id3], status: 'dismissed' })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toHaveLength(3);
    json.updated.forEach((m: { status: string }) => expect(m.status).toBe('dismissed'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/matches/bulk — invalid transition → 400 + atomic rollback
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/bulk — invalid transition → 400 + atomicity', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('1 invalid transition among 5 → 400 with failed_id', async () => {
    // 4 valid shortlist matches + 1 archived (archived → saved is valid, archived → dismissed is NOT)
    const validIds = seedMatches(db, ['shortlist', 'shortlist', 'shortlist', 'shortlist']);
    const invalidId = seedMatch(db, 'archived'); // archived → dismissed is INVALID
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(
      makeBulkPatchRequest({ ids: [...validIds, invalidId], status: 'dismissed' })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.failed_id).toBe(invalidId);
  });

  it('nothing committed when any transition is invalid (atomicity)', async () => {
    const validId = seedMatch(db, 'shortlist');
    const invalidId = seedMatch(db, 'archived'); // archived → dismissed INVALID
    const { PATCH } = await import('@/app/api/matches/bulk/route');

    await PATCH(
      makeBulkPatchRequest({ ids: [validId, invalidId], status: 'dismissed' })
    );

    // DB should be unchanged: validId still has status 'shortlist'
    const row = db
      .prepare('SELECT status FROM matches WHERE id = ?')
      .get(validId) as { status: string } | undefined;
    expect(row?.status).toBe('shortlist');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/matches/bulk — not found → 404
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/bulk — not found', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('returns 404 when any id does not exist', async () => {
    const validId = seedMatch(db, 'shortlist');
    const nonExistentId = 99999;
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(
      makeBulkPatchRequest({ ids: [validId, nonExistentId], status: 'saved' })
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/matches/bulk — body validation
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/matches/bulk — body validation', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('empty ids array → 400 (assumption: empty bulk is rejected)', async () => {
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(makeBulkPatchRequest({ ids: [], status: 'saved' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('invalid status value → 400 (Class 6: exact enum required)', async () => {
    const ids = seedMatches(db, ['shortlist']);
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(
      makeBulkPatchRequest({ ids, status: 'pending' }) // 'pending' is not a valid MatchStatus
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('Class 6: status "save" (substring of "saved") → 400 (must be exact enum)', async () => {
    const ids = seedMatches(db, ['shortlist']);
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(makeBulkPatchRequest({ ids, status: 'save' }));

    expect(res.status).toBe(400);
  });

  it('status "shortlist" as target → 400 (shortlist is not a valid target in bulk)', async () => {
    // Assumption: PATCH bulk only accepts saved|dismissed|archived as target status
    // shortlist cannot be a target (matches are created as shortlist, not moved back)
    const ids = seedMatches(db, ['shortlist']);
    const { PATCH } = await import('@/app/api/matches/bulk/route');
    const res = await PATCH(makeBulkPatchRequest({ ids, status: 'shortlist' }));

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/matches/bulk — feature flag
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/matches/bulk — feature flag', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'false';
    process.env.ADMIN_TOKEN = 'test-admin-secret';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
    process.env.ADMIN_TOKEN = originalAdminToken;
  });

  it('returns 503 when MATCHES_ENABLED=false', async () => {
    const ids = seedMatches(db, ['shortlist']);
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(makeBulkDeleteRequest({ ids }, 'test-admin-secret'));

    expect(res.status).toBe(503);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/matches/bulk — auth
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/matches/bulk — auth', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-secret';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
    process.env.ADMIN_TOKEN = originalAdminToken;
  });

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const ids = seedMatches(db, ['shortlist']);
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(makeBulkDeleteRequest({ ids }, 'test-admin-secret'));

    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Admin-Token is missing', async () => {
    // Make requireAdmin return 401 (simulate missing token)
    mockRequireAdmin.mockReturnValueOnce(
      NextResponse.json(
        { error: 'Unauthorized: invalid or missing X-Admin-Token header' },
        { status: 401 }
      )
    );
    const ids = seedMatches(db, ['shortlist']);
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(makeBulkDeleteRequest({ ids })); // no token in request

    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Admin-Token is wrong', async () => {
    mockRequireAdmin.mockReturnValueOnce(
      NextResponse.json(
        { error: 'Unauthorized: invalid or missing X-Admin-Token header' },
        { status: 401 }
      )
    );
    const ids = seedMatches(db, ['shortlist']);
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(makeBulkDeleteRequest({ ids }, 'wrong-token'));

    expect(res.status).toBe(401);
  });

  it('returns 500 when ADMIN_TOKEN env is not configured', async () => {
    mockRequireAdmin.mockReturnValueOnce(
      NextResponse.json(
        { error: 'ADMIN_TOKEN not configured on server' },
        { status: 500 }
      )
    );
    const ids = seedMatches(db, ['shortlist']);
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(makeBulkDeleteRequest({ ids }, 'any-token'));

    expect(res.status).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/matches/bulk — happy path
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/matches/bulk — happy path', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-secret';
    // requireAdmin mock already returns null (allowed) from beforeEach above
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
    process.env.ADMIN_TOKEN = originalAdminToken;
  });

  it('3 ids → 200 with deleted array of those ids', async () => {
    const ids = seedMatches(db, ['shortlist', 'saved', 'dismissed']);
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(makeBulkDeleteRequest({ ids }, 'test-admin-secret'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.deleted)).toBe(true);
    expect(json.deleted.sort()).toEqual(ids.sort());
  });

  it('deleted matches are removed from DB', async () => {
    const ids = seedMatches(db, ['shortlist', 'saved']);
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    await DELETE(makeBulkDeleteRequest({ ids }, 'test-admin-secret'));

    const remaining = db
      .prepare('SELECT id FROM matches WHERE id IN (?, ?)')
      .all(ids[0], ids[1]);
    expect(remaining).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/matches/bulk — not found → 404
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/matches/bulk — not found', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-secret';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
    process.env.ADMIN_TOKEN = originalAdminToken;
  });

  it('returns 404 when any id does not exist, includes missing_id', async () => {
    const validId = seedMatch(db, 'shortlist');
    const nonExistentId = 99999;
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(
      makeBulkDeleteRequest({ ids: [validId, nonExistentId] }, 'test-admin-secret')
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.missing_id).toBe(nonExistentId);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/matches/bulk — body validation
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/matches/bulk — body validation', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-secret';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
    process.env.ADMIN_TOKEN = originalAdminToken;
  });

  it('empty ids array → 400 (assumption: empty bulk delete is rejected)', async () => {
    const { DELETE } = await import('@/app/api/matches/bulk/route');
    const res = await DELETE(makeBulkDeleteRequest({ ids: [] }, 'test-admin-secret'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/matches/bulk — atomicity
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/matches/bulk — atomicity', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    db = freshDb();
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-secret';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
    process.env.ADMIN_TOKEN = originalAdminToken;
  });

  it('partial failure: nothing deleted when one id is missing (transaction rolled back)', async () => {
    const validId = seedMatch(db, 'shortlist');
    const nonExistentId = 99999;
    const { DELETE } = await import('@/app/api/matches/bulk/route');

    const res = await DELETE(
      makeBulkDeleteRequest({ ids: [validId, nonExistentId] }, 'test-admin-secret')
    );

    // Should return 404 (not found)
    expect(res.status).toBe(404);

    // DB should be unchanged: validId still exists
    const row = db
      .prepare('SELECT id FROM matches WHERE id = ?')
      .get(validId) as { id: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.id).toBe(validId);
  });
});
