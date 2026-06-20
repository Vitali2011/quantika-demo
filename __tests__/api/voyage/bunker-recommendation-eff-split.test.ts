/**
 * Issue 2 (basin-nodist fix): recommendation and savingsUsd must be based on
 * the min-effectiveUsdPerMt winner, not min raw VLSFO price.
 *
 * Scenario: CYLMS (Limassol, Cyprus — EU ETS, CY prefix) priced at $595.
 *           ESCEU (Ceuta — excluded from EU ETS, NON_EU_ETS_OVERRIDE) priced at $609.
 *           With an EUA price in the DB, CYLMS accrues a large carbon surcharge
 *           (~$238/MT at 70 EUR/tCO2 × EUR_TO_USD × Cf × lift), making its
 *           effectiveUsdPerMt >> ESCEU's.
 *
 * Expected: port = ESCEU (min eff), recommendation mentions ESCEU, not CYLMS.
 * Old bug:  recommendation said CYLMS (min raw price 595).
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
    CREATE TABLE eua_prices (
      price_date         TEXT NOT NULL,
      price_eur_per_tco2 REAL NOT NULL,
      contract_type      TEXT NOT NULL DEFAULT 'spot',
      source             TEXT NOT NULL,
      fetched_at         TEXT NOT NULL
    );
    -- CYLMS: cheapest raw price but EU ETS carbon cost applies (CY prefix = Cyprus = EU)
    INSERT INTO bunker_prices VALUES ('CYLMS', 'VLSFO', 595, '2026-06-02', 'seed', datetime('now'));
    -- ESCEU: higher raw price but NON_EU_ETS_OVERRIDE → no carbon → lower effective $/MT
    INSERT INTO bunker_prices VALUES ('ESCEU', 'VLSFO', 609, '2026-06-02', 'seed', datetime('now'));
    -- EUA at 70 EUR/tCO2 — carbon surcharge on CYLMS ≈ 70*1.08*3.151*500/500 ≈ 238 USD/MT.
    -- date('now') keeps it within the 7-day freshness gate (#1069); a hardcoded
    -- past date would go stale vs the CI clock and null the lookup → no carbon.
    INSERT INTO eua_prices VALUES (date('now'), 70, 'spot', 'seed', datetime('now'));
  `);
});

afterAll(() => db.close());

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

// Null distances — no detour math; only carbon cost differentiates candidates.
jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn(() => null),
}));

function makeReq(from: string, to: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/voyage/bunker-recommendation?from=${from}&to=${to}&grade=VLSFO`,
    { method: 'GET' },
  );
}

describe('Issue 2 — recommendation uses min-eff winner, not min-price', () => {
  // ROCND (BlackSea) → ESLPA (AtlanticNorth): corridor = {BlackSea,EastMed,WestMed,AtlanticNorth}
  // CYLMS=EastMed, ESCEU=WestMed — both in corridor.

  it('port field = ESCEU (min-eff), not CYLMS (min-price)', async () => {
    const res = await GET(makeReq('ROCND', 'ESLPA'));
    const body = await res.json();
    expect(body.fallback).toBe(false);
    expect(body.port).toBe('ESCEU');
    expect(body.port).not.toBe('CYLMS');
  });

  it('recommendation text starts with ESCEU (min-eff winner, not min-price)', async () => {
    const res = await GET(makeReq('ROCND', 'ESLPA'));
    const body = await res.json();
    // Recommendation opens with the winner (ESCEU), not min-price (CYLMS).
    // CYLMS may still appear as the comparison ("vs CYLMS") — that's correct.
    expect(body.recommendation).toMatch(/^Bunker at ESCEU/);
  });

  it('savingsUsd > 0 (ESCEU eff < CYLMS eff)', async () => {
    const res = await GET(makeReq('ROCND', 'ESLPA'));
    const body = await res.json();
    expect(body.savingsUsd).toBeGreaterThan(0);
  });

  it('candidates[0] (min-eff) = ESCEU; CYLMS has higher effectiveUsdPerMt', async () => {
    const res = await GET(makeReq('ROCND', 'ESLPA'));
    const body = await res.json();
    const ports = body.candidates.map((c: { port: string }) => c.port);
    expect(ports[0]).toBe('ESCEU');
    const cylms = body.candidates.find((c: { port: string }) => c.port === 'CYLMS');
    const esceu = body.candidates.find((c: { port: string }) => c.port === 'ESCEU');
    expect(esceu.effectiveUsdPerMt).toBeLessThan(cylms.effectiveUsdPerMt);
  });

  it('CYLMS raw price (595) < ESCEU raw price (609) — confirms it is min-price not min-eff', async () => {
    const res = await GET(makeReq('ROCND', 'ESLPA'));
    const body = await res.json();
    const cylms = body.candidates.find((c: { port: string }) => c.port === 'CYLMS');
    const esceu = body.candidates.find((c: { port: string }) => c.port === 'ESCEU');
    expect(cylms.priceUsdPerMt).toBeLessThan(esceu.priceUsdPerMt);
  });
});
