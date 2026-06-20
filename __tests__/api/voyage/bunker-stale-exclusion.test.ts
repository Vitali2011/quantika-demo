/**
 * FIX #15: stale on-route bunker prices are EXCLUDED from the candidate set
 * (audit-1 LOW, founder decision = enable filtering), not merely logged.
 *
 * A stale price (price_date older than BUNKER_STALE_DAYS) must never enter
 * onRouteWithPrices, so it cannot feed the effective-$/MT ranking nor TCE.
 *
 * Critical invariant: when EVERY on-route candidate is stale, the NLRTM/default
 * fallback path must still yield a bunker port — a match must never be left with
 * no bunker port.
 *
 * Tests call the helpers directly (PI2 behavioral: real getLatestBunkerPrice +
 * real ranking, not a string match).
 */

import Database from 'better-sqlite3';
import {
  resolveOnRouteBunkerCandidates,
  resolveRecommendedBunkerPort,
  BUNKER_STALE_DAYS,
} from '@/lib/economics/bunker-routing';

const STALE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - (BUNKER_STALE_DAYS + 23));
  return d.toISOString().slice(0, 10);
})();
const FRESH_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
})();

// Basin filter: allow only the two Strait-of-Gibraltar hubs for this route.
jest.mock('@/lib/sailing/voyage-basin', () => ({
  isCandidateInVoyageBasins: jest.fn(
    (candidate: string) => candidate === 'GIGIB' || candidate === 'ESCEU',
  ),
}));

// Both GIGIB and ESCEU sit on the TRMAR → MXVER route.
const DISTS: Record<string, number> = {
  'TRMAR|MXVER': 7000, 'MXVER|TRMAR': 7000,
  'TRMAR|GIGIB': 1300, 'GIGIB|TRMAR': 1300,
  'GIGIB|MXVER': 5800, 'MXVER|GIGIB': 5800,
  'TRMAR|ESCEU': 1320, 'ESCEU|TRMAR': 1320,
  'ESCEU|MXVER': 5790, 'MXVER|ESCEU': 5790,
};
jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn((from: string, to: string) => {
    const nm = DISTS[`${from}|${to}`];
    return nm != null ? { nm, exact: true } : null;
  }),
}));

let db: Database.Database;

function seedDb(): Database.Database {
  const d = new Database(':memory:');
  d.exec(`
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
  `);
  return d;
}

afterEach(() => {
  db?.close();
});

describe('FIX #15 stale bunker exclusion', () => {
  it('EXCLUDES a stale on-route candidate, letting the fresh one win', () => {
    db = seedDb();
    // GIGIB stale + cheaper; ESCEU fresh + dearer. Stale must be dropped so the
    // fresh ESCEU wins despite its higher price.
    db.exec(`
      INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 600, '${STALE_DATE}', 'oilmonster', datetime('now'));
      INSERT INTO bunker_prices VALUES ('ESCEU', 'VLSFO', 747, '${FRESH_DATE}', 'oilmonster', datetime('now'));
    `);

    const result = resolveOnRouteBunkerCandidates(db, 'TRMAR', 'MXVER', 'VLSFO');

    const ports = result.candidates.map((c) => c.port);
    expect(ports).not.toContain('GIGIB'); // stale → excluded
    expect(ports).toContain('ESCEU'); // fresh → kept
    expect(result.fallback).toBe(false);
  });

  it('falls back to a bunker port when ALL on-route candidates are stale', () => {
    db = seedDb();
    // Both on-route hubs stale → zero live candidates → NLRTM/default fallback.
    db.exec(`
      INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 600, '${STALE_DATE}', 'oilmonster', datetime('now'));
      INSERT INTO bunker_prices VALUES ('ESCEU', 'VLSFO', 747, '${STALE_DATE}', 'oilmonster', datetime('now'));
    `);

    const onRoute = resolveOnRouteBunkerCandidates(db, 'TRMAR', 'MXVER', 'VLSFO');
    expect(onRoute.candidates).toHaveLength(0);
    expect(onRoute.fallback).toBe(true);

    const recommended = resolveRecommendedBunkerPort(db, 'TRMAR', 'MXVER', 'VLSFO');
    expect(recommended.port).toBeTruthy(); // never left without a bunker port
    expect(recommended.fallback).toBe(true);
    expect(recommended.priceUsdPerMt).toBeGreaterThan(0);
  });
});
