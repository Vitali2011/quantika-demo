/**
 * Integration: seed fixture into in-memory DB through the real psc-repository,
 * then call GET /api/vessels/[imo]/psc-history and assert the response is
 * filtered + shaped correctly. The route's network adapter is stubbed to
 * keep the test hermetic.
 */
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import migration028 from '@/lib/migrations/028-psc-history';
import { upsertInspection } from '@/lib/market/psc-repository';
import { PSC_FIXTURE } from '@/lib/knowledge/sources/psc/fixture';

let testDb: Database.Database;

jest.mock('@/lib/db/index', () => ({
  getDb: jest.fn(() => testDb),
}));

jest.mock('@/lib/knowledge/sources/psc/psc-adapter', () => ({
  fetchPscHistory: jest.fn(async () => []),
}));

function makeReq(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('GET /api/vessels/[imo]/psc-history (fixture integration)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, PSC_DETENTION_ENABLED: 'true' };
    testDb = new Database(':memory:');
    migration028.up(testDb);
    for (const rec of PSC_FIXTURE) {
      upsertInspection(testDb, rec);
    }
  });

  afterEach(() => {
    testDb.close();
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('returns only records for the requested IMO', async () => {
    const targetImo = '9322180';
    const expectedCount = PSC_FIXTURE.filter((r) => r.imo === targetImo).length;
    expect(expectedCount).toBeGreaterThan(0); // sanity on the fixture

    const { GET } = await import('@/app/api/vessels/[imo]/psc-history/route');
    const res = await GET(makeReq(`/api/vessels/${targetImo}/psc-history`), {
      params: Promise.resolve({ imo: targetImo }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(expectedCount);
    for (const row of body) {
      expect(row.imo).toBe(targetImo);
    }
  });

  it('returns rows sorted by inspection_date DESC', async () => {
    const targetImo = '9478999';
    const { GET } = await import('@/app/api/vessels/[imo]/psc-history/route');
    const res = await GET(makeReq(`/api/vessels/${targetImo}/psc-history`), {
      params: Promise.resolve({ imo: targetImo }),
    });

    expect(res.status).toBe(200);
    const body: Array<{ inspection_date: string }> = await res.json();
    expect(body.length).toBeGreaterThan(1);
    for (let i = 1; i < body.length; i++) {
      expect(body[i - 1].inspection_date >= body[i].inspection_date).toBe(true);
    }
  });

  it('returns the canonical PscRecord shape per row', async () => {
    const { GET } = await import('@/app/api/vessels/[imo]/psc-history/route');
    const res = await GET(makeReq('/api/vessels/9322180/psc-history'), {
      params: Promise.resolve({ imo: '9322180' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    const row = body[0];
    expect(row).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        imo: '9322180',
        inspection_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        authority: expect.stringMatching(/^(paris-mou|tokyo-mou|uscg|other)$/),
        deficiencies: expect.any(Number),
        detained: expect.any(Boolean),
      }),
    );
  });

  it('returns an empty array for an IMO not in the fixture', async () => {
    const { GET } = await import('@/app/api/vessels/[imo]/psc-history/route');
    const res = await GET(makeReq('/api/vessels/9999999/psc-history'), {
      params: Promise.resolve({ imo: '9999999' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
