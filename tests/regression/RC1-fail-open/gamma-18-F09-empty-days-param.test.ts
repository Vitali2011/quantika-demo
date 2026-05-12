// Regression Lock: QA adversarial 2026-05-12
// Class: A (Empty/falsy) | Severity: MEDIUM
// Finding: F-09 — Empty days query parameter behavior unclear
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { GET } from '@/app/api/analytics/roi/route';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
    getSession: () => ({ userId: 'test-user', createdAt: Date.now() }),
  })),
}));

describe('regression gamma-18-F09: empty days query parameter', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    runMigrations(testDb, allMigrations);
    process.env.ROI_GUARANTEE_ENABLED = 'true';
  });

  afterEach(() => {
    testDb.close();
    delete process.env.ROI_GUARANTEE_ENABLED;
  });

  it('GET /api/analytics/roi?days= (empty string) should default to 90 or return 400', async () => {
    // ATTACK: Empty string parameter (URL: ?days=)
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=', { headers: { Cookie: 'session_id=test-token' } });

    const res = await GET(req);
    const json = await res.json();

    // Expected: Either default to 90 (treat as null) or return 400
    // Current behavior: parseInt('', 10) = NaN → returns 400 per route.ts:33
    // This is CORRECT behavior — test verifies it doesn't silently succeed
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid.*days/i);
  });

  it('GET /api/analytics/roi?days=0 should include all data', async () => {
    // Per spec:103, days=0 should include all data (no date filter)
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=0', { headers: { Cookie: 'session_id=test-token' } });

    const res = await GET(req);
    const json = await res.json();

    // Should succeed (0 is valid per spec:103)
    expect(res.status).toBe(200);
    expect(json).toHaveProperty('totalVoyages');
  });
});
