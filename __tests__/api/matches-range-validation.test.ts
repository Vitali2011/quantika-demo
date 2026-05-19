/**
 * Tests — GET /api/matches reverse-range validation (M-2 hardening).
 *
 * Reversed ranges (min > max) used to silently return an empty list, hiding
 * the user's mistake. They must now return 400 with an explanatory error.
 *
 * Out-of-domain score_min (<0 or >100) is also caught at the API boundary.
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import { requireSession } from '@/lib/session';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: () => testDb })),
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

beforeEach(() => {
  mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
});

describe('GET /api/matches — reverse range validation', () => {
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

  it('dwt_min > dwt_max → 400', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches?dwt_min=10&dwt_max=5'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/dwt_min/);
    expect(json.error).toMatch(/dwt_max/);
  });

  it('dwt_min === dwt_max → 200 (boundary OK)', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches?dwt_min=50000&dwt_max=50000'));
    expect(res.status).toBe(200);
  });

  it('laycan_from > laycan_to → 400', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?laycan_from=2026-12-31&laycan_to=2026-01-01')
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/laycan/);
  });

  it('laycan_from === laycan_to → 200 (boundary OK)', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?laycan_from=2026-06-01&laycan_to=2026-06-01')
    );
    expect(res.status).toBe(200);
  });

  it('score_min > 100 → 400', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches?score_min=150'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/score_min/);
  });

  it('score_min < 0 → 400', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(new NextRequest('http://localhost/api/matches?score_min=-5'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/score_min/);
  });

  it('score_min === 0 and score_min === 100 → 200 (boundary OK)', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res0 = await GET(new NextRequest('http://localhost/api/matches?score_min=0'));
    expect(res0.status).toBe(200);

    const res100 = await GET(new NextRequest('http://localhost/api/matches?score_min=100'));
    expect(res100.status).toBe(200);
  });

  it('valid forward range still works (regression)', async () => {
    const { GET } = await import('@/app/api/matches/route');
    const res = await GET(
      new NextRequest('http://localhost/api/matches?dwt_min=10000&dwt_max=80000&score_min=50')
    );
    expect(res.status).toBe(200);
  });
});
