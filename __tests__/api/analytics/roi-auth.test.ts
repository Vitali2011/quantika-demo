/**
 * U5 / #679 — HONEST ROI auth guard (replaces tests/regression/.../gamma-18-F10).
 *
 * The prior regression lock had TWO defects:
 *   1. It lived under `tests/regression/`, which jest.config.mjs ignores
 *      (testPathIgnorePatterns) — so it NEVER RAN. Zero protection.
 *   2. Even if run, it `jest.mock`'d `@/lib/session` so `requireSession` was the
 *      MOCK, not the real guard. Deleting `requireSession(request)` from the
 *      route would still leave the test green (the mock simply never fires, the
 *      route returns data → the over-mocked test's 401 expectation came from the
 *      mock's own re-implemented logic, not the SUT).
 *
 * This test runs under `__tests__/` (jest DOES run it), exercises the REAL
 * `requireSession` against a REAL in-memory session store, and calls the REAL
 * route handler. Mutation contract: remove `requireSession(request)` (or its
 * `instanceof NextResponse` early-return) from app/api/analytics/roi/route.ts
 * and the "unauthenticated → 401" / "unknown session → 401" cases go RED while
 * the authenticated case still passes.
 */

import { NextRequest } from 'next/server';

// IMPORTANT: do NOT mock @/lib/session — that is the SUT guard. The global jest
// setup points SESSIONS_DB_PATH at ':memory:', so getStore() builds a fresh real
// SQLite-backed store with the real schema.

describe('GET /api/analytics/roi — real requireSession auth guard', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ROI_GUARANTEE_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.ROI_GUARANTEE_ENABLED;
  });

  it('returns 401 for an unauthenticated request (no session cookie) via the REAL guard', async () => {
    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=90');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('No session');
  });

  it('returns 401 when the session_id cookie points to a non-existent session', async () => {
    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=90', {
      headers: { Cookie: 'session_id=this-session-does-not-exist' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Session expired');
  });

  it('does NOT leak feature state to unauthenticated callers (auth precedes flag check)', async () => {
    // Even with the feature flag OFF, an unauthenticated request must get 401,
    // never the 503 "Feature not enabled" — proving auth is checked FIRST.
    delete process.env.ROI_GUARANTEE_ENABLED;
    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with real ROI data for an authenticated request (valid session in the real store)', async () => {
    const { getStore } = await import('@/lib/session-store');
    const { createSession } = await import('@/lib/session');
    // Create a real session in the real in-memory store.
    const sessionId = createSession('test-access-token');
    expect(getStore().getSession(sessionId)).toBeTruthy();

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=90', {
      headers: { Cookie: `session_id=${sessionId}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Real getRoiSummary runs against the empty roi_metrics table → zeroes.
    expect(body).toHaveProperty('totalVoyages');
    expect(body.totalVoyages).toBe(0);
  });
});
