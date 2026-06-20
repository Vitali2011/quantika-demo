/**
 * Adversarial regression tests for GET /api/voyage/bunker-recommendation
 * Written by cold-start QA reviewer (test-skill).
 *
 * Tests H1-H5 from attack plan:
 *   H1: off-route exclusion assertion is substantive (not vacuous)
 *   H2: geometric fallback (all ports priced but all off-route → fallback)
 *   H3: MGO grade uses MGO prices for comparison
 *   H4: threshold boundary — detour == threshold → included
 *   H5: fail-open when directNm is null (unknown route)
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/voyage/bunker-recommendation/route';

// ── DB setup ──────────────────────────────────────────────────────────────────

let db: Database.Database;

function createDb(): Database.Database {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE bunker_prices (
      port_unlocode    TEXT NOT NULL,
      fuel_grade       TEXT NOT NULL,
      price_usd_per_mt REAL NOT NULL,
      price_date       TEXT NOT NULL,
      source           TEXT NOT NULL,
      fetched_at       TEXT NOT NULL,
      UNIQUE(port_unlocode, fuel_grade, price_date)
    );
    INSERT INTO bunker_prices VALUES ('NLRTM', 'VLSFO', 791, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 771, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('SGSIN', 'VLSFO', 801, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('AEFJR', 'VLSFO', 880, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('USHOU', 'VLSFO', 806, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('NLRTM', 'MGO',  1192, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('GIGIB', 'MGO',  1172, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('SGSIN', 'MGO',  1144, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('AEFJR', 'MGO',  1482, date('now','-2 day'), 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('USHOU', 'MGO',  1170, date('now','-2 day'), 'seed', datetime('now'));
  `);
  return d;
}

beforeAll(() => { db = createDb(); });
afterAll(() => db.close());

const mockGetPortDistance = jest.fn();

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: (...args: [string, string]) => mockGetPortDistance(...args),
}));

function makeReq(from: string, to: string, grade = 'VLSFO'): NextRequest {
  const url = `http://localhost/api/voyage/bunker-recommendation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&grade=${grade}`;
  return new NextRequest(url, { method: 'GET' });
}

// ── H1: Off-route exclusion — substantive assertion ───────────────────────────

describe('H1 — off-route SGSIN excluded (substantive assertion)', () => {
  beforeEach(() => {
    // Route: TRNBT → GBLIVP (3900 NM)
    // GIGIB: detour = 2100+1600-3900 = -200 NM (on-route)
    // NLRTM: detour = 2400+500-3900  = -1000 NM (on-route)
    // SGSIN: detour = 7100+11000-3900 = 14200 NM (WAY off-route)
    mockGetPortDistance.mockImplementation((from: string, to: string) => {
      const key = `${from}|${to}`;
      const table: Record<string, number> = {
        'TRNBT|GBLIVP': 3900, 'GBLIVP|TRNBT': 3900,
        'TRNBT|GIGIB': 2100, 'GIGIB|TRNBT': 2100,
        'GIGIB|GBLIVP': 1600, 'GBLIVP|GIGIB': 1600,
        'TRNBT|NLRTM': 2400, 'NLRTM|TRNBT': 2400,
        'NLRTM|GBLIVP': 500, 'GBLIVP|NLRTM': 500,
        'TRNBT|SGSIN': 7100, 'SGSIN|TRNBT': 7100,
        'SGSIN|GBLIVP': 11000, 'GBLIVP|SGSIN': 11000,
        'TRNBT|AEFJR': 1800, 'AEFJR|TRNBT': 1800,
        'AEFJR|GBLIVP': 9500, 'GBLIVP|AEFJR': 9500,
        'TRNBT|USHOU': 5600, 'USHOU|TRNBT': 5600,
        'USHOU|GBLIVP': 4500, 'GBLIVP|USHOU': 4500,
      };
      const nm = table[key];
      return nm != null ? { nm, exact: true } : null;
    });
  });

  it('SGSIN is NOT the recommended port (not just absent from a specific string)', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    // Substantive: the port field must not be Singapore
    expect(body.port).not.toBe('SGSIN');
    // Substantive: SGSIN must not appear in the recommendation (it's off-route)
    expect(body.recommendation ?? '').not.toContain('SGSIN');
  });

  it('recommended port is one of the two on-route candidates (GIGIB or NLRTM)', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    expect(['GIGIB', 'NLRTM']).toContain(body.port);
  });

  it('GIGIB wins because it is cheaper (771 < 791)', async () => {
    const res = await GET(makeReq('TRNBT', 'GBLIVP'));
    const body = await res.json();
    expect(body.port).toBe('GIGIB');
    expect(body.priceUsdPerMt).toBe(771);
  });
});

// ── H2: Geometric fallback — all ports priced but all off-route ───────────────

describe('H2 — geometric fallback (all ports priced, all geometrically off-route)', () => {
  beforeEach(() => {
    // Route: 500 NM direct, every candidate has huge detour
    // threshold = max(0.15*500, 200) = max(75, 200) = 200 NM
    // All candidates: detour > 200 NM → all excluded
    mockGetPortDistance.mockImplementation((from: string, to: string) => {
      if (from === 'PORTA' && to === 'PORTB') return { nm: 500, exact: true };
      if (from === 'PORTB' && to === 'PORTA') return { nm: 500, exact: true };
      // All candidate legs: make each candidate add 300+ NM detour
      // leg1 + leg2 - 500 > 200 → leg1 + leg2 > 700
      // So each candidate: leg1=400, leg2=400 → detour = 300 (> 200 threshold)
      const farCandidates = ['NLRTM', 'SGSIN', 'AEFJR', 'USHOU', 'GIGIB'];
      for (const c of farCandidates) {
        if ((from === 'PORTA' && to === c) || (from === c && to === 'PORTA')) return { nm: 400, exact: true };
        if ((from === c && to === 'PORTB') || (from === 'PORTB' && to === c)) return { nm: 400, exact: true };
      }
      return null;
    });
  });

  it('returns fallback=true when all priced ports are geometrically off-route', async () => {
    const res = await GET(makeReq('PORTA', 'PORTB'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.port).toBeNull();
    expect(body.message).toBeTruthy();
    // Must NOT silently default to Singapore
    expect(body.port).not.toBe('SGSIN');
  });
});

// ── H3: MGO grade uses MGO prices for comparison ─────────────────────────────

describe('H3 — MGO grade passthrough', () => {
  beforeEach(() => {
    // Route: PORTA → PORTB, both NLRTM and GIGIB are on-route
    // MGO prices: GIGIB=1172, NLRTM=1192
    // GIGIB should win for MGO (cheaper MGO price)
    mockGetPortDistance.mockImplementation((from: string, to: string) => {
      const table: Record<string, number> = {
        'PORTA|PORTB': 2000, 'PORTB|PORTA': 2000,
        'PORTA|NLRTM': 900, 'NLRTM|PORTA': 900,
        'NLRTM|PORTB': 900, 'PORTB|NLRTM': 900,  // detour = 1800-2000 = -200 (on-route)
        'PORTA|GIGIB': 950, 'GIGIB|PORTA': 950,
        'GIGIB|PORTB': 950, 'PORTB|GIGIB': 950,  // detour = 1900-2000 = -100 (on-route)
        'PORTA|SGSIN': 5000, 'SGSIN|PORTA': 5000,
        'SGSIN|PORTB': 5000, 'PORTB|SGSIN': 5000, // detour = 8000 (off-route)
        'PORTA|AEFJR': 4000, 'AEFJR|PORTA': 4000,
        'AEFJR|PORTB': 4000, 'PORTB|AEFJR': 4000, // detour = 6000 (off-route)
        'PORTA|USHOU': 6000, 'USHOU|PORTA': 6000,
        'USHOU|PORTB': 6000, 'PORTB|USHOU': 6000, // detour = 10000 (off-route)
      };
      const nm = table[`${from}|${to}`];
      return nm != null ? { nm, exact: true } : null;
    });
  });

  it('picks cheapest MGO port (GIGIB=1172) over NLRTM (1192) when grade=MGO', async () => {
    const res = await GET(makeReq('PORTA', 'PORTB', 'MGO'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(false);
    expect(body.port).toBe('GIGIB');
    expect(body.priceUsdPerMt).toBe(1172);
  });

  it('VLSFO recommendation also picks GIGIB (771) over NLRTM (791)', async () => {
    const res = await GET(makeReq('PORTA', 'PORTB', 'VLSFO'));
    const body = await res.json();
    expect(body.port).toBe('GIGIB');
    expect(body.priceUsdPerMt).toBe(771);
  });
});

// ── H4: Threshold boundary — exactly at threshold → included ─────────────────

describe('H4 — threshold boundary (detour == threshold → included)', () => {
  it('port with detour exactly equal to threshold is INCLUDED (not excluded)', async () => {
    // Direct: 1000 NM → threshold = max(150, 200) = 200 NM
    // NLRTM: leg1=600, leg2=600 → detour = 1200-1000 = 200 == threshold → INCLUDED
    // GIGIB: detour = 300 → EXCLUDED
    mockGetPortDistance.mockImplementation((from: string, to: string) => {
      const table: Record<string, number> = {
        'P1|P2': 1000, 'P2|P1': 1000,
        'P1|NLRTM': 600, 'NLRTM|P1': 600,
        'NLRTM|P2': 600, 'P2|NLRTM': 600,  // detour = 200 == threshold → INCLUDED
        'P1|GIGIB': 700, 'GIGIB|P1': 700,
        'GIGIB|P2': 700, 'P2|GIGIB': 700,  // detour = 400 > 200 → EXCLUDED
        'P1|SGSIN': 5000, 'SGSIN|P1': 5000,
        'SGSIN|P2': 5000, 'P2|SGSIN': 5000,
        'P1|AEFJR': 3000, 'AEFJR|P1': 3000,
        'AEFJR|P2': 3000, 'P2|AEFJR': 3000,
        'P1|USHOU': 4000, 'USHOU|P1': 4000,
        'USHOU|P2': 4000, 'P2|USHOU': 4000,
      };
      const nm = table[`${from}|${to}`];
      return nm != null ? { nm, exact: true } : null;
    });

    const res = await GET(makeReq('P1', 'P2'));
    const body = await res.json();
    // NLRTM at exactly the threshold should be included (not excluded)
    expect(body.fallback).toBe(false);
    expect(body.port).toBe('NLRTM'); // only on-route candidate
  });
});

// ── H5: fail-open when directNm = null ────────────────────────────────────────

describe('H5 — fail-open when from/to distance is unknown', () => {
  it('includes all priced candidates when direct route distance is unknown', async () => {
    // from/to unknown → getPortDistance(from, to) returns null → directNm = null
    // All candidates have prices → all should be included (fail-open)
    mockGetPortDistance.mockImplementation((from: string, to: string) => {
      // Only candidate legs are known; the direct route is unknown
      const candidates = ['NLRTM', 'SGSIN', 'AEFJR', 'USHOU', 'GIGIB'];
      for (const c of candidates) {
        if (from === 'UNKN' && to === c) return { nm: 1000, exact: false };
        if (from === c && to === 'UNKN2') return { nm: 1000, exact: false };
      }
      // UNKN → UNKN2 direct: unknown
      return null;
    });

    const res = await GET(makeReq('UNKN', 'UNKN2'));
    const body = await res.json();
    // All 5 candidates have prices and pass (fail-open), optimizer picks cheapest globally
    expect(body.fallback).toBe(false);
    // GIGIB is cheapest VLSFO (771)
    expect(body.port).toBe('GIGIB');
  });
});
