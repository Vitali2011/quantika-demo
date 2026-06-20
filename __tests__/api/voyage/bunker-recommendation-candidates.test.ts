/**
 * Behavioral tests for GET /api/voyage/bunker-recommendation — Delta-Step 2.
 *
 * Covers:
 *   (e) response includes candidates[] with per-port math fields
 *   (f) candidates sorted by effectiveUsdPerMt ASC
 *   (g) backward-compat: port/priceUsdPerMt/recommendation/savingsUsd still present
 *   (h) fallback response includes candidates: [] (empty array, not undefined)
 *   (i) on-route filter still works with 23-hub pool
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/voyage/bunker-recommendation/route';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE bunker_prices (
      port_unlocode    TEXT NOT NULL,
      fuel_grade       TEXT NOT NULL,
      price_usd_per_mt REAL NOT NULL,
      price_date       TEXT NOT NULL,
      source           TEXT NOT NULL,
      fetched_at       TEXT NOT NULL,
      UNIQUE(port_unlocode, fuel_grade, price_date)
    );
    -- Three on-route hubs priced; 20 others have no price → automatically excluded
    INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 771, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('NLRTM', 'VLSFO', 791, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('SGSIN', 'VLSFO', 801, date('now','-2 day'), 'seed', datetime('now'));
  `);
});

afterAll(() => db.close());

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

// Route: Nemrut Bay (TR) → Liverpool (GB) — 3900 NM
// GIGIB: detour = 2100+1600-3900 = -200 NM (on-route)
// NLRTM: detour = 2400+500-3900  = -1000 NM (on-route)
// SGSIN: detour = 18100 NM (way off-route) → excluded
// All other 20 candidates have no price in DB → excluded
const MOCK_DISTANCES: Record<string, number> = {
  'TRNBT|GBLIVP': 3900, 'GBLIVP|TRNBT': 3900,
  'TRNBT|GIGIB': 2100, 'GIGIB|TRNBT': 2100,
  'GIGIB|GBLIVP': 1600, 'GBLIVP|GIGIB': 1600,
  'TRNBT|NLRTM': 2400, 'NLRTM|TRNBT': 2400,
  'NLRTM|GBLIVP': 500,  'GBLIVP|NLRTM': 500,
  'TRNBT|SGSIN': 7100, 'SGSIN|TRNBT': 7100,
  'SGSIN|GBLIVP': 11000, 'GBLIVP|SGSIN': 11000,
};

jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn((from: string, to: string) => {
    const nm = MOCK_DISTANCES[`${from}|${to}`];
    return nm != null ? { nm, exact: true } : null;
  }),
}));

function makeReq(from: string, to: string, grade = 'VLSFO'): NextRequest {
  return new NextRequest(
    `http://localhost/api/voyage/bunker-recommendation?from=${from}&to=${to}&grade=${grade}`,
    { method: 'GET' },
  );
}

describe('GET /api/voyage/bunker-recommendation — candidates[]', () => {
  it('(e) response includes candidates[] with required per-port fields', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.candidates)).toBe(true);
    expect(body.candidates.length).toBeGreaterThanOrEqual(1);
    const c = body.candidates[0];
    expect(c).toHaveProperty('port');
    expect(c).toHaveProperty('grade');
    expect(c).toHaveProperty('priceUsdPerMt');
    expect(c).toHaveProperty('deviationNm');
    expect(c).toHaveProperty('deviationHours');
    expect(c).toHaveProperty('deviationFuelUsd');
    expect(c).toHaveProperty('timeCostUsd');
    expect(c).toHaveProperty('effectiveUsdPerMt');
    expect(c).toHaveProperty('onRoute');
  });

  it('(f) candidates sorted by effectiveUsdPerMt ASC', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    const prices = body.candidates.map((c: { effectiveUsdPerMt: number }) => c.effectiveUsdPerMt);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it('(g) backward-compat fields present: port, priceUsdPerMt, recommendation, savingsUsd', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    expect(body.fallback).toBe(false);
    expect(typeof body.port).toBe('string');
    expect(typeof body.priceUsdPerMt).toBe('number');
    expect(typeof body.recommendation).toBe('string');
    expect(typeof body.savingsUsd).toBe('number');
  });

  it('(g) best backward-compat port is GIGIB (cheapest raw VLSFO: 771)', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    expect(body.port).toBe('GIGIB');
    expect(body.priceUsdPerMt).toBe(771);
  });

  it('(h) fallback response includes empty candidates array', async () => {
    const emptyDb = new Database(':memory:');
    emptyDb.exec(`
      CREATE TABLE bunker_prices (
        port_unlocode TEXT, fuel_grade TEXT, price_usd_per_mt REAL,
        price_date TEXT, source TEXT, fetched_at TEXT,
        UNIQUE(port_unlocode, fuel_grade, price_date)
      );
    `);
    const { getStore } = jest.requireMock('@/lib/session-store') as { getStore: jest.Mock };
    getStore.mockReturnValueOnce({ getDb: () => emptyDb });

    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(Array.isArray(body.candidates)).toBe(true);
    expect(body.candidates).toHaveLength(0);
    emptyDb.close();
  });

  it('(i) SGSIN excluded (off-route); only GIGIB + NLRTM in candidates', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports).not.toContain('SGSIN');
    expect(ports).toContain('GIGIB');
    expect(ports).toContain('NLRTM');
    expect(body.candidates).toHaveLength(2);
  });

  it('(j) candidates[0].onRoute is true', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    body.candidates.forEach((c: { onRoute: boolean }) => {
      expect(c.onRoute).toBe(true);
    });
  });
});
