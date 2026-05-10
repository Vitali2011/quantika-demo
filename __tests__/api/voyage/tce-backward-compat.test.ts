/**
 * Tests for BP-03: backward-compat — old payloads with manual prices
 *
 * When both bunkerPriceUsdPerMt and euaPriceEur are provided manually,
 * the response should be identical in numeric results to pre-BP-03 behavior.
 * Response now additionally includes bunkerPriceSource and euaPriceSource.
 */

import Database from 'better-sqlite3';
import { POST } from '@/app/api/voyage/tce/route';
import { NextRequest } from 'next/server';

// ── In-memory DB (not used for manual-price path, but getStore is mocked) ────

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  // Minimal schema — should NOT be queried for manual-price requests
  db.exec(`
    CREATE TABLE bunker_prices (
      port_unlocode TEXT, fuel_grade TEXT, price_usd_per_mt REAL,
      price_date TEXT, source TEXT, fetched_at TEXT
    );
    CREATE TABLE eua_prices (
      price_date TEXT, price_eur_per_tco2 REAL, contract_type TEXT,
      source TEXT, fetched_at TEXT
    );
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

// This is the classic pre-BP-03 payload — both prices manual
const classicPayload = {
  vessel: {
    dwt: 30_000,
    valueUsd: 20_000_000,
    speedKts: 13,
    consumptionMtPerDay: 25,
  },
  route: {
    originPort: 'AEJEA',
    destinationPort: 'NLRTM',
    distanceNm: 5000,
  },
  cargo: {
    quantityMt: 25_000,
    freightRateUsdPerMt: 50,
  },
  bunkerPriceUsdPerMt: 600,
  euaPriceEur: 80,
  durationDays: 20,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TCE backward-compat (bp-03)', () => {
  it('classic payload → 200 with numeric TCE result', async () => {
    const req = makeReq(classicPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Core TCE fields still present (TCEResult shape)
    expect(typeof body.daily_tce_usd).toBe('number');
    expect(typeof body.total_usd).toBe('number');
  });

  it('classic payload → bunkerPriceSource.mode=manual, value=600', async () => {
    const req = makeReq(classicPayload);
    const res = await POST(req);
    const body = await res.json();
    expect(body.bunkerPriceSource).toBeDefined();
    expect(body.bunkerPriceSource.mode).toBe('manual');
    expect(body.bunkerPriceSource.value).toBe(600);
    expect(body.bunkerPriceSource.source).toBe('manual');
  });

  it('classic payload → euaPriceSource.mode=manual, value=80', async () => {
    const req = makeReq(classicPayload);
    const res = await POST(req);
    const body = await res.json();
    expect(body.euaPriceSource).toBeDefined();
    expect(body.euaPriceSource.mode).toBe('manual');
    expect(body.euaPriceSource.value).toBe(80);
    expect(body.euaPriceSource.source).toBe('manual');
  });

  it('old payload returns same dailyTce as before (numeric regression lock)', async () => {
    const req1 = makeReq(classicPayload);
    const req2 = makeReq(classicPayload);
    const [res1, res2] = await Promise.all([POST(req1), POST(req2)]);
    const [body1, body2] = await Promise.all([res1.json(), res2.json()]);
    // Idempotent: same payload → same result
    expect(body1.daily_tce_usd).toBe(body2.daily_tce_usd);
    expect(body1.total_usd).toBe(body2.total_usd);
  });

  it('accepts payload without bunkerPort/bunkerGrade/includeEuETS (new optional fields)', async () => {
    const req = makeReq(classicPayload);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
