/**
 * Tests for BP-03: TCE endpoint auto-bunker lookup
 *
 * - No bunkerPriceUsdPerMt → auto-lookup from DB
 * - port=SGSIN, grade=VLSFO → seed value 801, source='static-seed', mode='auto'
 * - port=ZZZZZ (not in DB) → 422 bunker_price_unavailable
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
    INSERT INTO bunker_prices VALUES ('SGSIN', 'MGO', 1144, '2026-05-09', 'static-seed', datetime('now'));

    CREATE TABLE eua_prices (
      price_date         TEXT NOT NULL,
      price_eur_per_tco2 REAL NOT NULL,
      contract_type      TEXT NOT NULL DEFAULT 'spot',
      source             TEXT NOT NULL,
      fetched_at         TEXT NOT NULL,
      UNIQUE(price_date, contract_type)
    );
    INSERT INTO eua_prices VALUES ('2026-05-04', 72.65, 'spot', 'eex-auction-static-seed', datetime('now'));
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

const baseBody = {
  vessel: {
    dwt: 30_000,
    valueUsd: 20_000_000,
    speedKts: 13,
    consumptionMtPerDay: 25,
  },
  route: {
    originPort: 'SGSIN',
    destinationPort: 'AEDXB',
    distanceNm: 3000,
  },
  cargo: {
    quantityMt: 25_000,
    freightRateUsdPerMt: 30,
  },
  // no bunkerPriceUsdPerMt — auto-lookup
  euaPriceEur: 0, // manual 0 to skip EUA auto-path
  durationDays: 12,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TCE auto-bunker lookup (bp-03)', () => {
  it('auto-resolves SGSIN VLSFO → 801, mode=auto', async () => {
    const req = makeReq({
      ...baseBody,
      bunkerPort: 'SGSIN',
      bunkerGrade: 'VLSFO',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bunkerPriceSource).toBeDefined();
    expect(body.bunkerPriceSource.value).toBe(801);
    expect(body.bunkerPriceSource.source).toBe('static-seed');
    expect(body.bunkerPriceSource.mode).toBe('auto');
    expect(body.bunkerPriceSource.priceDate).toBe('2026-05-09');
  });

  it('returns 400 bunker_port_required when bunkerPort omitted and no manual price', async () => {
    const req = makeReq(baseBody);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bunker_port_required');
  });

  it('returns 422 when port not in DB (bunker_price_unavailable)', async () => {
    const req = makeReq({
      ...baseBody,
      bunkerPort: 'ZZZZZ',
      bunkerGrade: 'VLSFO',
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('bunker_price_unavailable');
    expect(body.error.details.port).toBe('ZZZZZ');
    expect(body.error.details.grade).toBe('VLSFO');
  });

  it('manual bunkerPriceUsdPerMt bypasses DB, source.mode=manual', async () => {
    const req = makeReq({
      ...baseBody,
      bunkerPriceUsdPerMt: 550,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bunkerPriceSource.value).toBe(550);
    expect(body.bunkerPriceSource.source).toBe('manual');
    expect(body.bunkerPriceSource.mode).toBe('manual');
  });
});
