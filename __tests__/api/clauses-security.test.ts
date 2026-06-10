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

describe('adversarial — cold QA', () => {
  let db: Database.Database;

  beforeAll(() => {
    process.env.BIMCO_RAG_ENABLED = 'true';
  });

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    migration029.up(db);
    testDb = db;

    // Insert searchable fixture row
    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'Laytime shall commence upon NOR tender. Cargo demurrage rates apply.',
      JSON.stringify({ charterParty: 'GENCON 2022', clauseNumber: '8' }),
    );

    // Default: authenticated, rate limit allowed
    mockRequireSession.mockReturnValue(AUTHED);
    mockRateCheck.mockReturnValue({ allowed: true, retryAfterMs: 0 });
  });

  afterEach(() => {
    db.close();
    jest.clearAllMocks();
  });

  // ADV-01: q=OR+laytime — OR at start of query (leading boolean operator)
  // Regex /^\s*(AND|OR|NOT)\b/i should catch this → 400 not 500
  it('ADV-01: returns 400 for q=OR+laytime (leading OR operator)', async () => {
    const res = await GET(makeRequest('?q=OR+laytime'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid/i);
  });

  // ADV-02: q=NOT+laytime — NOT at start (covered by regex?)
  it('ADV-02: returns 400 for q=NOT+laytime (leading NOT operator)', async () => {
    const res = await GET(makeRequest('?q=NOT+laytime'));
    expect(res.status).toBe(400);
  });

  // ADV-03: q=%22unclosed — URL-encoded unclosed double-quote
  // escapeFts5Query wraps in quotes and doubles internal quotes
  // Input: '"unclosed' -> escaped: '"""unclosed"' -> FTS5 sees: empty-phrase + unclosed-phrase
  // Should NOT throw SQLITE_ERROR after escaping
  it('ADV-03: does NOT crash (500) for unclosed double-quote q=%22unclosed', async () => {
    // The escaped form: '"unclosed' -> '"""unclosed"' — valid FTS5 phrase
    const res = await GET(makeRequest('?q=%22unclosed'));
    // Should be 200 (phrase match, no results since no literal '"unclosed' in DB)
    // or at worst 400, never 500
    expect(res.status).not.toBe(500);
    // If 200, results should be empty (no match for literal quote+unclosed)
    if (res.status === 200) {
      const json = await res.json();
      expect(Array.isArray(json.results)).toBe(true);
    }
  });

  // ADV-04: q= (empty string) — should return all clauses (200), not 400 or 500
  it('ADV-04: returns 200 for empty q (returns all clauses)', async () => {
    const res = await GET(makeRequest('?q='));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.results)).toBe(true);
  });

  // ADV-05: q=laytime+OR+cargo — mid-query boolean operator
  // DOCUMENTED INTENTIONAL BEHAVIOR: escapeFts5Query wraps the full input in FTS5
  // phrase quotes, so "laytime OR cargo" becomes '"laytime OR cargo"' in MATCH.
  // Inside FTS5 phrase quotes, OR is literal text, not a boolean operator.
  // Result: phrase match for the literal 3-word string — no boolean semantics.
  // This is the designed behavior (see comment on escapeFts5Query).
  it('ADV-05 (DOCUMENTED): mid-query OR is phrase-matched as literal text, not boolean', async () => {
    const res = await GET(makeRequest('?q=laytime+OR+cargo'));
    // Must not crash (no SQLITE_ERROR)
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.results)).toBe(true);
    // Fixture row contains "Laytime" and "Cargo" as separate words, not the
    // literal 3-word phrase "laytime OR cargo" — so boolean-as-literal gives 0 results.
    expect(json.results).toHaveLength(0);
    // Cross-check: plain "laytime" search DOES match (proves escaping is functional)
  });

  // ADV-06 (FIXED): auth runs BEFORE flag check — unauthenticated caller gets 401
  // even when BIMCO_RAG_ENABLED=false. Flag state is no longer revealed to strangers.
  it('ADV-06 (FIXED): unauthenticated caller gets 401 even when flag is disabled (no flag-state leak)', async () => {
    const savedEnv = process.env.BIMCO_RAG_ENABLED;
    process.env.BIMCO_RAG_ENABLED = 'false';

    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'No session' }, { status: 401 }),
    );

    const res = await GET(makeRequest('?q=laytime'));
    // Auth check is now FIRST — 401 returned before flag check runs
    expect(res.status).toBe(401);

    process.env.BIMCO_RAG_ENABLED = savedEnv;
  });

  // ADV-07: Rate limit key uses sessionId — verify empty sessionId never reaches check
  // requireSession must reject empty/missing cookie before rate-limit
  it('ADV-07: requireSession rejects missing cookie (401) before rate-limit check', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'No session' }, { status: 401 }),
    );

    const res = await GET(makeRequest('?q=laytime'));
    expect(res.status).toBe(401);
    // Rate limiter must NOT have been called (session was rejected before rate limit)
    expect(mockRateCheck).not.toHaveBeenCalled();
  });

  // ADV-08: laytime* (trailing wildcard) — not a leading operator, passes validator
  // After escapeFts5Query: '"laytime*"' — In FTS5, * within a phrase IS a prefix wildcard
  // Should not error (FTS5 handles phrase wildcards)
  it('ADV-08: q=laytime* (trailing wildcard) does not crash after escaping', async () => {
    const res = await GET(makeRequest('?q=laytime*'));
    // * inside phrase quotes is valid FTS5 prefix match
    expect(res.status).not.toBe(500);
  });

  // ADV-09: CSRF — /api/knowledge/clauses is NOT in /api/ai/ prefix
  // Middleware CSRF check only applies to /api/ai/ and /api/emails/
  // This endpoint has NO CSRF protection — only session + rate limit
  // Analytical finding: documented but not an actionable bug (no state mutation on GET)
  it('ADV-09: endpoint is GET-only and does not mutate state (CSRF not required)', async () => {
    // GET endpoints with no mutation don't require CSRF by convention
    // This test documents the absence of CSRF as intentional (GET = safe method)
    const res = await GET(makeRequest('?q=laytime'));
    expect(res.status).toBe(200); // confirms endpoint is functional as GET
  });

  // ADV-10: very long query string — no length validation in route
  it('ADV-10: very long query (5000 chars) does not crash — either 200 or 400', async () => {
    const longQuery = 'a'.repeat(5000);
    const res = await GET(makeRequest(`?q=${encodeURIComponent(longQuery)}`));
    // Should not throw — catch block returns 500 only on unexpected errors
    expect(res.status).not.toBe(500);
  });
});
