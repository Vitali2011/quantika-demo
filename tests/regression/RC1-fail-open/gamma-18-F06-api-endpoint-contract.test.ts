// Regression Lock: QA adversarial 2026-05-12
// Class: 9 (End-to-end property) | Severity: HIGH
// Finding: F-06 — API endpoint must enforce response contract
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

describe('regression gamma-18-F06: API endpoint response contract', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    runMigrations(testDb, allMigrations);
    process.env.ROI_GUARANTEE_ENABLED = 'true';
  });

  afterEach(() => {
    testDb.close();
    delete process.env.ROI_GUARANTEE_ENABLED;
  });

  it('GET /api/analytics/roi must return all required fields', async () => {
    // Arrange — empty DB
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=90', { headers: { Cookie: 'session_id=test-token' } });

    // Act
    const res = await GET(req);
    const json = await res.json();

    // Assert — Class 9: End-to-end property check
    // Must have all required keys per RoiSummary interface
    expect(json).toHaveProperty('totalVoyages');
    expect(json).toHaveProperty('totalSavingsUsd');
    expect(json).toHaveProperty('avgSavingsPerVoyage');
    expect(json).toHaveProperty('roiMultiple');
    expect(json).toHaveProperty('cohorts');

    // Type checks
    expect(typeof json.totalVoyages).toBe('number');
    expect(typeof json.totalSavingsUsd).toBe('number');
    expect(typeof json.avgSavingsPerVoyage).toBe('number');
    expect(typeof json.roiMultiple).toBe('number');
    expect(Array.isArray(json.cohorts)).toBe(true);
  });

  it('GET /api/analytics/roi with feature flag disabled must return 503', async () => {
    // ATTACK: Feature flag disabled
    process.env.ROI_GUARANTEE_ENABLED = 'false';

    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=90', { headers: { Cookie: 'session_id=test-token' } });
    const res = await GET(req);
    const json = await res.json();

    // Must return 503 per route.ts:17-19
    expect(res.status).toBe(503);
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/feature|enabled/i);
  });

  it('GET /api/analytics/roi?days=abc must return 400', async () => {
    // ATTACK: Invalid days parameter
    const req = new NextRequest('http://localhost:3000/api/analytics/roi?days=abc', { headers: { Cookie: 'session_id=test-token' } });
    const res = await GET(req);
    const json = await res.json();

    // Must return 400 per route.ts:33-35
    expect(res.status).toBe(400);
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/invalid.*days/i);
  });
});
