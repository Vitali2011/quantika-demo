/**
 * Security tests — GET /api/matches user isolation (#399)
 *
 * Verifies that session scoping is enforced at the API level:
 *   - Matches from session A are invisible to session B (cross-session leak)
 *   - cargo_type filter + session → only that session's matches returned
 *   - cargo_type filter without session → 401
 *   - No filter without session → 401
 *   - PI2 behavioral: real NextRequest/GET calls, not string-match
 *
 * Boundary classes:
 *   - Class 9 (E2E behavioral): GET called via real route handler
 *   - Class 2 (Security authorization): session scope enforced on every filter combination
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

function seedMatch(
  db: Database.Database,
  fields: {
    cargo_id: string;
    user_id: string;
    cargo_type?: string | null;
    score?: number;
  }
): void {
  db.prepare(
    `INSERT INTO matches
      (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
       cargo_type, load_port, discharge_port, laycan_start, laycan_end, vessel_dwt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    fields.cargo_id,
    'vessel-1',
    fields.score ?? 75,
    '{}',
    'shortlist',
    fields.user_id,
    Date.now(),
    Date.now(),
    fields.cargo_type ?? null,
    null,
    null,
    null,
    null,
    null
  );
}

describe('GET /api/matches — user isolation (security)', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    migration033Up(db);
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    mockRequireSession.mockReturnValue({
      session: { id: 'session-A' },
      sessionId: 'session-A',
    });
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('no session → 401 (PI2: real GET call)', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'No session' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(401);
  });

  it('no session with cargo_type filter → 401 (auth enforced before filter)', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'No session' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?cargo_type=grain')
    );

    expect(res.status).toBe(401);
  });

  it('session A sees only session A matches (no filter)', async () => {
    seedMatch(db, { cargo_id: 'c-session-a', user_id: 'session-A' });
    seedMatch(db, { cargo_id: 'c-session-b', user_id: 'session-B' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.matches.map((m: { cargo_id: string }) => m.cargo_id);
    expect(ids).toContain('c-session-a');
    expect(ids).not.toContain('c-session-b');
  });

  it('cargo_type filter + session A → only session A grain matches (cross-session leak prevented)', async () => {
    seedMatch(db, { cargo_id: 'a-grain', user_id: 'session-A', cargo_type: 'grain' });
    seedMatch(db, { cargo_id: 'b-grain', user_id: 'session-B', cargo_type: 'grain' });
    seedMatch(db, { cargo_id: 'a-coal', user_id: 'session-A', cargo_type: 'coal' });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?cargo_type=grain')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.matches.map((m: { cargo_id: string }) => m.cargo_id);

    expect(ids).toContain('a-grain');
    expect(ids).not.toContain('b-grain');
    expect(ids).not.toContain('a-coal');
  });

  it('session B sees no matches when only session A has data', async () => {
    seedMatch(db, { cargo_id: 'c-session-a', user_id: 'session-A' });

    mockRequireSession.mockReturnValueOnce({
      session: { id: 'session-B' },
      sessionId: 'session-B',
    });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(0);
  });

  it('cargo_type filter + session B → empty (session B has no grain matches)', async () => {
    seedMatch(db, { cargo_id: 'a-grain', user_id: 'session-A', cargo_type: 'grain' });

    mockRequireSession.mockReturnValueOnce({
      session: { id: 'session-B' },
      sessionId: 'session-B',
    });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?cargo_type=grain')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(0);
  });

  it('multiple filters (cargo_type + score_min) + session → only session matches satisfying all filters', async () => {
    seedMatch(db, { cargo_id: 'a-grain-high', user_id: 'session-A', cargo_type: 'grain', score: 80 });
    seedMatch(db, { cargo_id: 'a-grain-low', user_id: 'session-A', cargo_type: 'grain', score: 40 });
    seedMatch(db, { cargo_id: 'b-grain-high', user_id: 'session-B', cargo_type: 'grain', score: 90 });

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?cargo_type=grain&score_min=70')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    const ids = json.matches.map((m: { cargo_id: string }) => m.cargo_id);

    expect(ids).toContain('a-grain-high');
    expect(ids).not.toContain('a-grain-low');
    expect(ids).not.toContain('b-grain-high');
  });
});
