/**
 * A1: bunker price freshness watchdog (log-only, no DB write).
 *
 * PI2 behavioral: calls the GET route handler directly, not just the helper.
 *
 * Test shapes:
 *  - stale price (>7 days old) → console.warn contains 'bunker_price_stale' + port
 *  - fresh price (≤7 days old) → no 'bunker_price_stale' warn
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/voyage/bunker-recommendation/route';

// Dynamic dates so the test stays valid after 2026-06-04
const STALE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
})();
const FRESH_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
})();

let db: Database.Database;

function makeReq(from: string, to: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/voyage/bunker-recommendation?from=${from}&to=${to}`,
    { method: 'GET' },
  );
}

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

// Basin filter: allow GIGIB for this test route
jest.mock('@/lib/sailing/voyage-basin', () => ({
  isCandidateInVoyageBasins: jest.fn((candidate: string) => candidate === 'GIGIB'),
}));

// Port distances for TRMAR → MXVER route with GIGIB on-route
const DISTS: Record<string, number> = {
  'TRMAR|MXVER': 7000, 'MXVER|TRMAR': 7000,
  'TRMAR|GIGIB': 1300, 'GIGIB|TRMAR': 1300,
  'GIGIB|MXVER': 5800, 'MXVER|GIGIB': 5800,
};
jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn((from: string, to: string) => {
    const nm = DISTS[`${from}|${to}`];
    return nm != null ? { nm, exact: true } : null;
  }),
}));

afterEach(() => {
  db?.close();
});

describe('A1 bunker freshness watchdog', () => {
  it('logs bunker_price_stale when on-route price is older than 7 days', async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE bunker_prices (
        port_unlocode TEXT NOT NULL, fuel_grade TEXT NOT NULL,
        price_usd_per_mt REAL NOT NULL, price_date TEXT NOT NULL,
        source TEXT NOT NULL, fetched_at TEXT NOT NULL,
        UNIQUE(port_unlocode, fuel_grade, price_date)
      );
      CREATE TABLE eua_prices (
        price_date TEXT, price_eur_per_tco2 REAL, contract_type TEXT,
        source TEXT, fetched_at TEXT
      );
      INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 747, '${STALE_DATE}', 'oilmonster', datetime('now'));
    `);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await GET(makeReq('TRMAR', 'MXVER'));

    const staleWarns = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('bunker_price_stale'),
    );
    expect(staleWarns.length).toBeGreaterThanOrEqual(1);
    expect(staleWarns[0][0]).toContain('GIGIB');
    warnSpy.mockRestore();
  });

  it('does NOT log stale warning when on-route price is fresh (≤7 days)', async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE bunker_prices (
        port_unlocode TEXT NOT NULL, fuel_grade TEXT NOT NULL,
        price_usd_per_mt REAL NOT NULL, price_date TEXT NOT NULL,
        source TEXT NOT NULL, fetched_at TEXT NOT NULL,
        UNIQUE(port_unlocode, fuel_grade, price_date)
      );
      CREATE TABLE eua_prices (
        price_date TEXT, price_eur_per_tco2 REAL, contract_type TEXT,
        source TEXT, fetched_at TEXT
      );
      INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 747, '${FRESH_DATE}', 'oilmonster', datetime('now'));
    `);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await GET(makeReq('TRMAR', 'MXVER'));

    const staleWarns = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('bunker_price_stale'),
    );
    expect(staleWarns).toHaveLength(0);
    warnSpy.mockRestore();
  });
});
