/**
 * Tests — GET /api/matches/export/pdf
 *
 * Covers (Class 9 — E2E behavioral via NextRequest/Response route import):
 *   - Auth: no session → 401
 *   - Feature flag MATCHES_ENABLED=false → 503
 *   - Happy path (empty matches) → 200, Content-Type: application/pdf
 *   - Happy path (with matches) → response body starts with PDF magic bytes %PDF
 *   - Content-Disposition header present with attachment filename
 *   - Filter: ?status=saved → only saved matches in PDF (verified via Content-Length delta)
 */

import Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import migration032 from '@/lib/migrations/032-matches';
import { createMatch } from '@/lib/matching/matches-repository';
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

const AUTHENTICATED_SESSION = {
  session: { id: 'sess-1', parsedCargos: [], parsedVessels: [] },
  sessionId: 'test-sid',
};

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('GET /api/matches/export/pdf', () => {
  let db: Database.Database;
  const originalEnv = process.env.MATCHES_ENABLED;
  // Import once — no resetModules needed; listMatches reads db at call time
  let GET: (req: NextRequest) => Promise<Response | NextResponse>;

  beforeAll(async () => {
    const mod = await import('@/app/api/matches/export/pdf/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    testDb = db;
    process.env.MATCHES_ENABLED = 'true';
    mockRequireSession.mockReturnValue(AUTHENTICATED_SESSION);
  });

  afterEach(() => {
    process.env.MATCHES_ENABLED = originalEnv;
    db.close();
  });

  it('returns 401 when no session', async () => {
    mockRequireSession.mockReturnValueOnce(
      NextResponse.json({ error: 'No session' }, { status: 401 })
    );
    const res = await GET(makeRequest('/api/matches/export/pdf'));
    expect(res.status).toBe(401);
  });

  it('returns 503 when MATCHES_ENABLED=false', async () => {
    process.env.MATCHES_ENABLED = 'false';
    const res = await GET(makeRequest('/api/matches/export/pdf'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 200 with application/pdf content-type on empty match list', async () => {
    const res = await GET(makeRequest('/api/matches/export/pdf'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('returns PDF magic bytes (%PDF) in response body', async () => {
    createMatch(db, {
      cargo_id: 'CARGO-001',
      vessel_id: 'VESSEL-001',
      score: 85,
      reason: 'Good geographic fit',
      user_id: 'test-sid',
    });

    const res = await GET(makeRequest('/api/matches/export/pdf'));
    expect(res.status).toBe(200);

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('returns content-disposition header with attachment filename', async () => {
    const res = await GET(makeRequest('/api/matches/export/pdf'));
    const disposition = res.headers.get('content-disposition');
    expect(disposition).toMatch(/^attachment; filename="quantika-matches-/);
    expect(disposition).toMatch(/\.pdf"$/);
  });

  it('returns larger PDF body when matches present vs empty list', async () => {
    const emptyRes = await GET(makeRequest('/api/matches/export/pdf'));
    const emptySize = (await emptyRes.arrayBuffer()).byteLength;

    for (let i = 0; i < 3; i++) {
      createMatch(db, {
        cargo_id: `CARGO-${i}`,
        vessel_id: `VESSEL-${i}`,
        score: 70 + i * 5,
        reason: `Reason ${i}`,
        user_id: 'test-sid',
        load_port: 'NLRTM',
        discharge_port: 'CNSHA',
        cargo_type: 'grain',
        vessel_dwt: 50000 + i * 5000,
      });
    }

    const fullRes = await GET(makeRequest('/api/matches/export/pdf'));
    const fullSize = (await fullRes.arrayBuffer()).byteLength;

    expect(fullSize).toBeGreaterThan(emptySize);
  });

  it('filters by status param — filtered PDF smaller than unfiltered', async () => {
    createMatch(db, {
      cargo_id: 'CARGO-SAVED',
      vessel_id: 'VESSEL-SAVED',
      score: 90,
      reason: '',
      status: 'saved',
      user_id: 'test-sid',
    });
    createMatch(db, {
      cargo_id: 'CARGO-SHORTLIST',
      vessel_id: 'VESSEL-SHORTLIST',
      score: 60,
      reason: '',
      status: 'shortlist',
      user_id: 'test-sid',
    });

    const filteredRes = await GET(makeRequest('/api/matches/export/pdf?status=saved'));
    expect(filteredRes.status).toBe(200);
    const filteredSize = (await filteredRes.arrayBuffer()).byteLength;

    const allRes = await GET(makeRequest('/api/matches/export/pdf'));
    expect(allRes.status).toBe(200);
    const allSize = (await allRes.arrayBuffer()).byteLength;

    // 1-match PDF should be smaller than 2-match PDF
    expect(filteredSize).toBeLessThan(allSize);
  });
});
