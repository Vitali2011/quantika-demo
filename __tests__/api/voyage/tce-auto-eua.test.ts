/**
 * Tests for BP-03: TCE endpoint auto-EUA lookup
 *
 * - EU origin (NL) → trigger EUA auto-lookup
 * - non-EU route + no includeEuETS → auto-skip (mode='auto-skip', value=0)
 * - includeEuETS=true even on non-EU route → trigger EUA lookup
 */

import Database from 'better-sqlite3';
import { POST } from '@/app/api/voyage/tce/route';
import { NextRequest } from 'next/server';

// ── In-memory DB setup ────────────────────────────────────────────────────────

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
    INSERT INTO bunker_prices VALUES ('SGSIN', 'VLSFO', 801, '2026-05-09', 'static-seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('NLRTM', 'VLSFO', 791, '2026-05-09', 'static-seed', datetime('now'));

    CREATE TABLE eua_prices (
      price_date         TEXT NOT NULL,
      price_eur_per_tco2 REAL NOT NULL,
      contract_type      TEXT NOT NULL DEFAULT 'spot',
      source             TEXT NOT NULL,
      fetched_at         TEXT NOT NULL,
      UNIQUE(price_date, contract_type)
    );
    -- date('now') keeps the seed within the 7-day freshness gate (#1069); a
    -- hardcoded past date would go stale vs the CI clock and null the lookup.
    INSERT INTO eua_prices VALUES (date('now'), 72.65, 'spot', 'eex-auction-static-seed', datetime('now'));
  `);
});

afterAll(() => {
  db.close();
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

jest.mock('@/lib/port-da/repository', () => ({
  getPortDa: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/economics/canals/index', () => ({
  quoteCanal: jest.fn().mockReturnValue({ totalUsd: 0 }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// NLRTM = NL = EU country. AEDXB = AE = non-EU.
const euRouteBody = {
  vessel: {
    dwt: 30_000,
    valueUsd: 20_000_000,
    speedKts: 13,
    consumptionMtPerDay: 25,
  },
  route: {
    originPort: 'NLRTM',    // NL = EU
    destinationPort: 'AEDXB', // AE = non-EU
    distanceNm: 7500,
  },
  cargo: {
    quantityMt: 25_000,
    freightRateUsdPerMt: 30,
  },
  bunkerPriceUsdPerMt: 791, // manual bunker (NLRTM seed)
  // no euaPriceEur → auto-lookup
  durationDays: 18,
};

// SGSIN = SG = non-EU. AEDXB = AE = non-EU.
const nonEuRouteBody = {
  vessel: {
    dwt: 30_000,
    valueUsd: 20_000_000,
    speedKts: 13,
    consumptionMtPerDay: 25,
  },
  route: {
    originPort: 'SGSIN',   // SG = non-EU
    destinationPort: 'AEDXB', // AE = non-EU
    distanceNm: 3000,
  },
  cargo: {
    quantityMt: 25_000,
    freightRateUsdPerMt: 30,
  },
  bunkerPriceUsdPerMt: 801,
  // no euaPriceEur → trigger check (non-EU route → auto-skip)
  durationDays: 12,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TCE auto-EUA lookup (bp-03)', () => {
  it('EU origin (NLRTM=NL) triggers EUA lookup → value=72.65, mode=auto', async () => {
    const req = makeReq(euRouteBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.euaPriceSource).toBeDefined();
    expect(body.euaPriceSource.value).toBe(72.65);
    expect(body.euaPriceSource.source).toBe('eex-auction-static-seed');
    expect(body.euaPriceSource.mode).toBe('auto');
  });

  it('non-EU route without includeEuETS → mode=auto-skip, value=0', async () => {
    const req = makeReq(nonEuRouteBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.euaPriceSource.mode).toBe('auto-skip');
    expect(body.euaPriceSource.value).toBe(0);
  });

  it('non-EU route + includeEuETS=true → triggers EUA lookup → value=72.65', async () => {
    const req = makeReq({ ...nonEuRouteBody, includeEuETS: true });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.euaPriceSource.mode).toBe('auto');
    expect(body.euaPriceSource.value).toBe(72.65);
  });

  it('manual euaPriceEur bypasses DB, source.mode=manual', async () => {
    const req = makeReq({ ...euRouteBody, euaPriceEur: 55 });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.euaPriceSource.value).toBe(55);
    expect(body.euaPriceSource.source).toBe('manual');
    expect(body.euaPriceSource.mode).toBe('manual');
  });
});
