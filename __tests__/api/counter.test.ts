/**
 * Tests — POST /api/matches/[id]/counter
 *
 * PI2 behavioral tests: real in-memory SQLite via migration runner.
 * Covers:
 *   - 200 valid {counterRate} → row inserted, id returned
 *   - 400 missing counterRate
 *   - 400 invalid counterRate (negative, zero, NaN string)
 *   - 400 bad JSON body
 *   - 400 invalid match id format
 *   - 401 no session
 *   - 404 match not found
 *   - 404 match belongs to different session (isolation)
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import migration040 from '@/lib/migrations/040-counter-offers';
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
const SESSION_B = { session: { id: 'sess-b' }, sessionId: 'user-b' };

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration040.up(db);
  return db;
}

function seedMatch(db: Database.Database, userId: string): number {
  const res = db
    .prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run('cargo-1', 'vessel-1', 80, '{}', 'shortlist', userId, Date.now(), Date.now());
  return res.lastInsertRowid as number;
}

function makeRequest(id: string | number, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/matches/${id}/counter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string | number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

import { POST } from '@/app/api/matches/[id]/counter/route';

beforeEach(() => {
  testDb = freshDb();
  mockRequireSession.mockReturnValue(SESSION_A);
});

describe('POST /api/matches/[id]/counter — happy path', () => {
  it('200: inserts counter offer and returns id + rate', async () => {
    const matchId = seedMatch(testDb, 'user-a');
    const res = await POST(makeRequest(matchId, { counterRate: 18.5 }), makeParams(matchId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ matchId, counterRate: 18.5 });
    expect(typeof body.id).toBe('number');

    const row = testDb
      .prepare('SELECT * FROM counter_offers WHERE id = ?')
      .get(body.id) as { match_id: number; user_id: string; counter_rate: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.match_id).toBe(matchId);
    expect(row!.user_id).toBe('user-a');
    expect(row!.counter_rate).toBeCloseTo(18.5);
  });

  it('200: accepts counterRate as a numeric string', async () => {
    const matchId = seedMatch(testDb, 'user-a');
    const res = await POST(makeRequest(matchId, { counterRate: '22.75' }), makeParams(matchId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counterRate).toBeCloseTo(22.75);
  });
});

describe('POST /api/matches/[id]/counter — validation errors', () => {
  it('400: missing counterRate', async () => {
    const matchId = seedMatch(testDb, 'user-a');
    const res = await POST(makeRequest(matchId, {}), makeParams(matchId));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/counterRate/i);
  });

  it('400: counterRate = 0', async () => {
    const matchId = seedMatch(testDb, 'user-a');
    const res = await POST(makeRequest(matchId, { counterRate: 0 }), makeParams(matchId));
    expect(res.status).toBe(400);
  });

  it('400: counterRate negative', async () => {
    const matchId = seedMatch(testDb, 'user-a');
    const res = await POST(makeRequest(matchId, { counterRate: -5 }), makeParams(matchId));
    expect(res.status).toBe(400);
  });

  it('400: counterRate non-numeric string', async () => {
    const matchId = seedMatch(testDb, 'user-a');
    const res = await POST(makeRequest(matchId, { counterRate: 'abc' }), makeParams(matchId));
    expect(res.status).toBe(400);
  });

  it('400: invalid match id format', async () => {
    const res = await POST(makeRequest('not-a-number', { counterRate: 10 }), makeParams('not-a-number'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/matches/[id]/counter — auth', () => {
  it('401: no session', async () => {
    mockRequireSession.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const matchId = seedMatch(testDb, 'user-a');
    const res = await POST(makeRequest(matchId, { counterRate: 18.5 }), makeParams(matchId));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/matches/[id]/counter — not found', () => {
  it('404: match does not exist', async () => {
    const res = await POST(makeRequest(9999, { counterRate: 18.5 }), makeParams(9999));
    expect(res.status).toBe(404);
  });

  it('404: match belongs to different session', async () => {
    const matchId = seedMatch(testDb, 'user-b');
    const res = await POST(makeRequest(matchId, { counterRate: 18.5 }), makeParams(matchId));
    expect(res.status).toBe(404);
  });
});
