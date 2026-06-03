/**
 * Tests for Spec-03: ETS auto-derive euLegPercent
 *
 * When includeEuETS=true and no euLegPercent is provided, the route
 * auto-derives the EU leg percentage from origin/destination country.
 * Response includes `etsResolution` with mode and reason.
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
    INSERT INTO bunker_prices VALUES ('NLRTM', 'VLSFO', 791, '2026-05-09', 'static-seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('DEHAM', 'VLSFO', 795, '2026-05-09', 'static-seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('USNYC', 'VLSFO', 820, '2026-05-09', 'static-seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('SGSIN', 'VLSFO', 801, '2026-05-09', 'static-seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('AEDXB', 'VLSFO', 780, '2026-05-09', 'static-seed', datetime('now'));

    CREATE TABLE eua_prices (
      price_date         TEXT NOT NULL,
      price_eur_per_tco2 REAL NOT NULL,
      contract_type      TEXT NOT NULL DEFAULT 'spot',
      source             TEXT NOT NULL,
      fetched_at         TEXT NOT NULL,
      UNIQUE(price_date, contract_type)
    );
    INSERT INTO eua_prices VALUES ('2026-05-09', 72.65, 'spot', 'eex-seed', datetime('now'));
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

const baseVessel = {
  dwt: 30_000,
  valueUsd: 20_000_000,
  speedKts: 13,
  consumptionMtPerDay: 25,
};

const baseCargo = {
  quantityMt: 25_000,
  freightRateUsdPerMt: 30,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Spec-03: ETS auto-derive euLegPercent', () => {
  it('NLRTM → DEHAM (both EU): euLegPercent=1.0, ets_usd>0, mode=auto-derived, reason contains EU', async () => {
    const req = makeReq({
      vessel: baseVessel,
      route: {
        originPort: 'NLRTM',       // NL = EU
        destinationPort: 'DEHAM',  // DE = EU
        distanceNm: 500,
      },
      cargo: baseCargo,
      bunkerPriceUsdPerMt: 791,
      euaPriceEur: 72.65,
      includeEuETS: true,
      // euLegPercent intentionally omitted → should auto-derive
      durationDays: 3,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.etsResolution).toBeDefined();
    expect(body.etsResolution.euLegPercent).toBe(1.0);
    expect(body.etsResolution.mode).toBe('auto-derived');
    expect(body.etsResolution.reason).toMatch(/EU/i);
    expect(body.breakdown.ets_usd).toBeGreaterThan(0);
  });

  it('NLRTM → USNYC (one EU leg): euLegPercent=1.0, ets_usd>0, mode=auto-derived (50% coverage via factor)', async () => {
    const req = makeReq({
      vessel: baseVessel,
      route: {
        originPort: 'NLRTM',       // NL = EU
        destinationPort: 'USNYC',  // US = non-EU
        distanceNm: 3600,
      },
      cargo: baseCargo,
      bunkerPriceUsdPerMt: 791,
      euaPriceEur: 72.65,
      includeEuETS: true,
      // euLegPercent omitted → auto-derive
      durationDays: 10,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.etsResolution).toBeDefined();
    expect(body.etsResolution.euLegPercent).toBe(1.0);
    expect(body.etsResolution.mode).toBe('auto-derived');
    expect(body.breakdown.ets_usd).toBeGreaterThan(0);
  });

  it('SGSIN → AEDXB (no EU leg): ets_usd=0, mode=not-applicable', async () => {
    const req = makeReq({
      vessel: baseVessel,
      route: {
        originPort: 'SGSIN',       // SG = non-EU
        destinationPort: 'AEDXB',  // AE = non-EU
        distanceNm: 1500,
      },
      cargo: baseCargo,
      bunkerPriceUsdPerMt: 801,
      euaPriceEur: 72.65,
      includeEuETS: true,
      // euLegPercent omitted → auto-derive → no EU leg
      durationDays: 5,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.etsResolution).toBeDefined();
    expect(body.etsResolution.mode).toBe('not-applicable');
    // ets_usd should be 0 when no EU leg
    expect(body.breakdown.ets_usd ?? 0).toBe(0);
  });

  it('manual euLegPercent=0.3 → uses 0.3, mode=manual', async () => {
    const req = makeReq({
      vessel: baseVessel,
      route: {
        originPort: 'NLRTM',
        destinationPort: 'DEHAM',
        distanceNm: 500,
      },
      cargo: baseCargo,
      bunkerPriceUsdPerMt: 791,
      euaPriceEur: 72.65,
      includeEuETS: true,
      euLegPercent: 0.3,   // caller-provided → must be used as-is
      durationDays: 3,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.etsResolution).toBeDefined();
    expect(body.etsResolution.euLegPercent).toBe(0.3);
    expect(body.etsResolution.mode).toBe('manual');
  });

  it('includeEuETS=false → etsResolution skipped (backward compat)', async () => {
    const req = makeReq({
      vessel: baseVessel,
      route: {
        originPort: 'NLRTM',
        destinationPort: 'DEHAM',
        distanceNm: 500,
      },
      cargo: baseCargo,
      bunkerPriceUsdPerMt: 791,
      euaPriceEur: 0,
      includeEuETS: false,
      durationDays: 3,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    // When includeEuETS=false, no auto-derive happens
    // etsResolution may be absent or mode='not-applicable'
    if (body.etsResolution) {
      expect(body.etsResolution.mode).toBe('not-applicable');
    }
    expect(body.breakdown?.ets_usd ?? 0).toBe(0);
  });
});
