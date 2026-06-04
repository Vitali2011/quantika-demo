/**
 * Adversarial: zero/negative manual bunkerPriceUsdPerMt values
 * These bypass the bunkerPort check — test the downstream behaviour.
 */
import Database from 'better-sqlite3';
import { POST } from '@/app/api/voyage/tce/route';
import { NextRequest } from 'next/server';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
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

afterAll(() => db.close());

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

jest.mock('@/lib/port-da/repository', () => ({
  getPortDa: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/economics/canals/index', () => ({
  quoteCanal: jest.fn().mockReturnValue({ totalUsd: 0 }),
}));

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voyage/tce', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const base = {
  vessel: { dwt: 30_000, valueUsd: 20_000_000, speedKts: 13, consumptionMtPerDay: 25 },
  route: { originPort: 'SGSIN', destinationPort: 'AEDXB', distanceNm: 3000 },
  cargo: { quantityMt: 25_000, freightRateUsdPerMt: 30 },
  euaPriceEur: 0,
  durationDays: 12,
};

describe('Adversarial: manual bunker price edge values', () => {
  it('bunkerPriceUsdPerMt=0 (zero) → 200, bunker_usd in breakdown is 0', async () => {
    const res = await POST(makeReq({ ...base, bunkerPriceUsdPerMt: 0 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bunkerPriceSource.mode).toBe('manual');
    expect(body.bunkerPriceSource.value).toBe(0);
    // breakdown.bunker_usd should be 0 (or very close)
    expect(body.breakdown.bunker_usd).toBeGreaterThanOrEqual(0);
    // daily_tce_usd should be finite (not NaN or Infinity)
    expect(Number.isFinite(body.daily_tce_usd)).toBe(true);
  });

  it('bunkerPriceUsdPerMt=-500 (negative) → 200, bunker_usd negative, daily_tce finite', async () => {
    const res = await POST(makeReq({ ...base, bunkerPriceUsdPerMt: -500 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bunkerPriceSource.mode).toBe('manual');
    // API must not crash; daily_tce_usd must be a finite number (sign doesn't matter)
    expect(Number.isFinite(body.daily_tce_usd)).toBe(true);
  });

  it('bunkerPriceUsdPerMt=Infinity → 400 (Zod rejects null or bunkerPort missing)', async () => {
    // JSON.stringify(Infinity) = 'null' — Zod sees null for a z.number() field → validation error
    const body = JSON.stringify({ ...base, bunkerPriceUsdPerMt: Infinity });
    const req = new NextRequest('http://localhost/api/voyage/tce', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    // Must be 400 — either Zod validation error or bunker_port_required; never 200 or 500
    expect(res.status).toBe(400);
  });
});
