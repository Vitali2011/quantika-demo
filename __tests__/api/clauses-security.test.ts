/**
 * Security tests for GET /api/knowledge/clauses (C2 finding, 2026-06-10 audit)
 *
 * Covers:
 *  - Unauthenticated request rejected (requireSession gate)
 *  - Malformed FTS5 operators return 400, not 500 (DoS/crash vector)
 *  - Rate-limited session returns 429
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import migration029 from '@/lib/migrations/029-bimco-rag';
import { NextRequest, NextResponse } from 'next/server';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: { check: jest.fn() },
}));

import { requireSession } from '@/lib/session';
import { aiRateLimiter } from '@/lib/rate-limit';
import { GET } from '@/app/api/knowledge/clauses/route';

const mockRequireSession = requireSession as jest.MockedFunction<typeof requireSession>;
const mockRateCheck = aiRateLimiter.check as jest.Mock;

function makeRequest(search = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/knowledge/clauses${search}`);
}

const AUTHED = { session: {} as any, sessionId: 'test-session' };

describe('GET /api/knowledge/clauses — security (C2)', () => {
  let db: Database.Database;

  beforeAll(() => {
    process.env.BIMCO_RAG_ENABLED = 'true';
  });

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    migration029.up(db);
    testDb = db;

    // Default: authenticated, rate limit allowed
    mockRequireSession.mockReturnValue(AUTHED);
    mockRateCheck.mockReturnValue({ allowed: true, retryAfterMs: 0 });
  });

  afterEach(() => {
    db.close();
    jest.clearAllMocks();
  });

  // AUTH-01: unauthenticated request must be rejected
  it('returns 401 when no session cookie present', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'No session' }, { status: 401 }),
    );

    const res = await GET(makeRequest('?q=laytime'));
    expect(res.status).toBe(401);
  });

  // FTS5-01: NEAR operator without closing paren must return 400 not 500
  it('returns 400 for malformed FTS5 NEAR operator (was SQLITE_ERROR → 500)', async () => {
    const res = await GET(makeRequest('?q=NEAR(laytime'));
    expect(res.status).toBe(400);
  });

  // FTS5-02: bare prefix wildcard must return 400 not 500
  it('returns 400 for bare FTS5 wildcard prefix "*laytime"', async () => {
    const res = await GET(makeRequest('?q=*laytime'));
    expect(res.status).toBe(400);
  });

  // FTS5-03: dangling boolean operator must return 400
  it('returns 400 for dangling FTS5 boolean "AND laytime"', async () => {
    const res = await GET(makeRequest('?q=AND+laytime'));
    expect(res.status).toBe(400);
  });

  // FTS5-04: valid plain-text query still returns 200 with results (escaping must not break valid search)
  it('returns 200 for valid plain-text search after FTS5 escaping', async () => {
    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'Laytime shall commence upon NOR tender',
      JSON.stringify({ charterParty: 'GENCON 2022', clauseNumber: '8' }),
    );

    const res = await GET(makeRequest('?q=laytime'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.length).toBeGreaterThan(0);
  });

  // RATE-01: rate-limited session returns 429
  it('returns 429 when rate limit exceeded', async () => {
    mockRateCheck.mockReturnValueOnce({ allowed: false, retryAfterMs: 30_000 });

    const res = await GET(makeRequest('?q=laytime'));
    expect(res.status).toBe(429);
  });
});
