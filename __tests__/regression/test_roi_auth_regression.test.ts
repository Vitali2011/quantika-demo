/**
 * Regression lock: /api/analytics/roi requireSession guard
 *
 * Finding F1 from test-skill adversarial QA (2026-05-12):
 * The security fix (commit e2a433a) added requireSession() to /api/analytics/roi,
 * but the original TDD tests mock session-store and never test the 401 path.
 *
 * This regression test locks: unauthenticated requests MUST return 401
 * even when ROI_GUARANTEE_ENABLED=true.
 *
 * If requireSession is accidentally removed in a future wave, this test fails.
 * DO NOT mock lib/session here — the whole point is to test real auth rejection.
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
    // getSession always returns null = no valid sessions in test DB
    getSession: (_id: string) => null,
    expireOldSessions: () => {},
  })),
}));

// IMPORTANT: Do NOT mock lib/session — we want real requireSession to run.
// The session store IS mocked for DB access, but getSession returns null
// for any cookie value = simulates no valid sessions.

describe('REGRESSION: /api/analytics/roi — auth guard (F1)', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    runMigrations(testDb, allMigrations);
    jest.resetModules();
  });

  afterEach(() => {
    testDb.close();
    delete process.env.ROI_GUARANTEE_ENABLED;
  });

  it('returns 401 when no session cookie and feature flag is ON', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'true';

    const { GET } = await import('@/app/api/analytics/roi/route');

    // Request with NO session_id cookie
    const req = new NextRequest('http://localhost:3000/api/analytics/roi');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 401 when session_id cookie has a fake/unknown value', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'true';

    const { GET } = await import('@/app/api/analytics/roi/route');

    // Request with a random/tampered session_id not in the DB
    const req = new NextRequest('http://localhost:3000/api/analytics/roi', {
      headers: {
        Cookie: 'session_id=aaaabbbbccccdddd0000111122223333',
      },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 401 (not 503) when unauthenticated and feature flag is OFF', async () => {
    // Ordering regression: auth must run before feature-flag check.
    // Before fix: unauthenticated users got 503 "Feature not enabled" leaking feature state.
    process.env.ROI_GUARANTEE_ENABLED = 'false';

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
