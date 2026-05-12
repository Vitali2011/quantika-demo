import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { upsertRoiMetrics } from '@/lib/analytics/roi-metrics';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

// Bypass auth — these tests cover ROI logic, not auth (see test_roi_auth_regression.test.ts)
jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(() => ({ session: { accessToken: 'test-token' }, sessionId: 'test-session-id' })),
}));

/**
 * Input Contract:
 * - Feature flag ROI_GUARANTEE_ENABLED !== 'true' → 503 with {error: "feature disabled"}
 * - GET /api/analytics/roi → returns RoiSummary
 * - GET with ?days=N → filters by days lookback
 * - GET with invalid ?days → 400 validation error
 */

describe('GET /api/analytics/roi', () => {
  let db: Database.Database;
  const originalEnv = process.env.ROI_GUARANTEE_ENABLED;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
    testDb = db;

    // Clear module cache to force re-import with new env
    jest.resetModules();
  });

  afterEach(() => {
    db.close();
    process.env.ROI_GUARANTEE_ENABLED = originalEnv;
  });

  // RED test: feature flag OFF returns 503
  it('returns 503 when feature flag is disabled', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'false';

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi');
    const res = await GET(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/feature disabled|not enabled/i);
  });

  // RED test: feature flag ON returns 200 with RoiSummary
  it('returns 200 with RoiSummary when feature enabled', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'true';

    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const cohortMonth = recentDate.substring(0, 7);

    upsertRoiMetrics(db, {
      id: 'roi1',
      voyage_id: 'v1',
      deal_date: recentDate,
      cohort_month: cohortMonth,
      freight_usd: null,
      bunker_cost_usd: null,
      demurrage_usd: null,
      despatch_usd: null,
      tce_actual_usd: 35000,
      tce_baseline_usd: 30000,
    });

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('totalVoyages');
    expect(json).toHaveProperty('totalSavingsUsd');
    expect(json).toHaveProperty('avgSavingsPerVoyage');
    expect(json).toHaveProperty('roiMultiple');
    expect(json).toHaveProperty('cohorts');
    expect(json.totalVoyages).toBe(1);
    expect(json.totalSavingsUsd).toBe(5000);
  });

  // RED test: GET with ?days=30 filters results
  it('filters by days query param', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'true';

    // Insert old record (100 days ago)
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    upsertRoiMetrics(db, {
      id: 'roi_old',
      voyage_id: 'v_old',
      deal_date: oldDate,
      cohort_month: oldDate.substring(0, 7),
      freight_usd: null,
      bunker_cost_usd: null,
      demurrage_usd: null,
      despatch_usd: null,
      tce_actual_usd: 35000,
      tce_baseline_usd: 30000,
    });

    // Insert recent record (10 days ago)
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    upsertRoiMetrics(db, {
      id: 'roi_recent',
      voyage_id: 'v_recent',
      deal_date: recentDate,
      cohort_month: recentDate.substring(0, 7),
      freight_usd: null,
      bunker_cost_usd: null,
      demurrage_usd: null,
      despatch_usd: null,
      tce_actual_usd: 40000,
      tce_baseline_usd: 35000,
    });

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=30');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalVoyages).toBe(1); // Only recent record
    expect(json.totalSavingsUsd).toBe(5000);
  });

  // RED test: GET with invalid ?days returns 400
  it('returns 400 for invalid days param', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'true';

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=invalid');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // RED test: GET with negative ?days returns 400
  it('returns 400 for negative days param', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'true';

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=-10');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  // RED test: empty database returns valid zeroes
  it('returns valid summary for empty database', async () => {
    process.env.ROI_GUARANTEE_ENABLED = 'true';

    const { GET } = await import('@/app/api/analytics/roi/route');
    const req = new NextRequest('http://localhost:3000/api/analytics/roi');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalVoyages).toBe(0);
    expect(json.totalSavingsUsd).toBe(0);
    expect(json.roiMultiple).toBe(0);
  });
});
