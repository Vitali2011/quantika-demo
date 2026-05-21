/**
 * Tests — GET /api/matches?status=<value>
 *
 * Verifies that status filter persists correctly: when URL contains ?status=shortlist,
 * the API returns only shortlist matches (same data the client would render on reload).
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
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

function seedMatch(db: Database.Database, status: MatchStatus, cargoId: string): void {
  db.prepare(
    `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(cargoId, 'vessel-1', 75, '{}', status, null, Date.now(), Date.now());
}

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
});

describe('GET /api/matches — ?status filter (filter persistence)', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    migration033Up(db);
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
  });

  afterEach(() => {
    db.close();
    process.env.MATCHES_ENABLED = originalEnv;
  });

  it('?status=shortlist returns only shortlist matches (filter persists on reload)', async () => {
    seedMatch(db, 'shortlist', 'c-shortlist-1');
    seedMatch(db, 'shortlist', 'c-shortlist-2');
    seedMatch(db, 'saved', 'c-saved');
    seedMatch(db, 'dismissed', 'c-dismissed');

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?status=shortlist')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(2);
    json.matches.forEach((m: { status: string }) => {
      expect(m.status).toBe('shortlist');
    });
  });

  it('?status=saved returns only saved matches', async () => {
    seedMatch(db, 'shortlist', 'c-shortlist');
    seedMatch(db, 'saved', 'c-saved-1');
    seedMatch(db, 'saved', 'c-saved-2');
    seedMatch(db, 'archived', 'c-archived');

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?status=saved')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(2);
    json.matches.forEach((m: { status: string }) => {
      expect(m.status).toBe('saved');
    });
  });

  it('no ?status param returns all matches (unfiltered)', async () => {
    seedMatch(db, 'shortlist', 'c-1');
    seedMatch(db, 'saved', 'c-2');
    seedMatch(db, 'archived', 'c-3');

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(3);
  });

  it('invalid ?status value is ignored — returns all matches', async () => {
    seedMatch(db, 'shortlist', 'c-1');
    seedMatch(db, 'saved', 'c-2');

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?status=pending')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(2);
  });

  it('?status=archived returns only archived matches', async () => {
    seedMatch(db, 'shortlist', 'c-shortlist');
    seedMatch(db, 'archived', 'c-archived-1');
    seedMatch(db, 'archived', 'c-archived-2');

    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?status=archived')
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toHaveLength(2);
    json.matches.forEach((m: { status: string }) => {
      expect(m.status).toBe('archived');
    });
  });
});
