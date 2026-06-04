/**
 * A2.2: /api/voyage/tce — missing bunkerPort → 400 bunker_port_required
 *
 * PI2 behavioral: calls POST route directly.
 * Real value shapes per plan §5.1:
 *   - bunkerPort=null (absent)     → 400
 *   - bunkerPort=''  (empty)       → 400
 *   - bunkerPort='sgsin' (lower)   → 200 (resolved to 'SGSIN', price found)
 *   - bunkerPort='XXXXX' (unknown) → 422 bunker_price_unavailable
 *   - manual bunkerPriceUsdPerMt   → 200 (bypasses bunkerPort check)
 */

import Database from 'better-sqlite3';
import { POST } from '@/app/api/voyage/tce/route';
import { NextRequest } from 'next/server';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE bunker_prices (
      port_unlocode TEXT NOT NULL, fuel_grade TEXT NOT NULL,
      price_usd_per_mt REAL NOT NULL, price_date TEXT NOT NULL,
      source TEXT NOT NULL, fetched_at TEXT NOT NULL,
      UNIQUE(port_unlocode, fuel_grade, price_date)
    );
    INSERT INTO bunker_prices VALUES ('SGSIN', 'VLSFO', 801, '2026-06-04', 'oilmonster', datetime('now'));
    INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 747, '2026-06-04', 'oilmonster', datetime('now'));

    CREATE TABLE eua_prices (
      price_date TEXT NOT NULL, price_eur_per_tco2 REAL NOT NULL,
      contract_type TEXT NOT NULL DEFAULT 'spot', source TEXT NOT NULL,
      fetched_at TEXT NOT NULL, UNIQUE(price_date, contract_type)
    );
    INSERT INTO eua_prices VALUES ('2026-06-04', 68.0, 'spot', 'eex', datetime('now'));
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

const baseBody = {
  vessel: { dwt: 30_000, valueUsd: 20_000_000, speedKts: 13, consumptionMtPerDay: 25 },
  route: { originPort: 'SGSIN', destinationPort: 'AEDXB', distanceNm: 3000 },
  cargo: { quantityMt: 25_000, freightRateUsdPerMt: 30 },
  euaPriceEur: 0,
  durationDays: 12,
};

describe('A2.2 — bunkerPort validation', () => {
  it('missing bunkerPort (omitted) → 400 bunker_port_required', async () => {
    const res = await POST(makeReq(baseBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bunker_port_required');
  });

  it('bunkerPort="" (empty string) → 400 bunker_port_required', async () => {
    // empty string fails the regex validator first (handled by zod 400 validation)
    const res = await POST(makeReq({ ...baseBody, bunkerPort: '' }));
    expect(res.status).toBe(400);
  });

  it('bunkerPort="sgsin" (lowercase) → 200, resolves to SGSIN price', async () => {
    const res = await POST(makeReq({ ...baseBody, bunkerPort: 'sgsin' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bunkerPriceSource.value).toBe(801);
    expect(body.bunkerPriceSource.mode).toBe('auto');
  });

  it('bunkerPort="XXXXX" (unknown LOCODE) → 422 bunker_price_unavailable', async () => {
    const res = await POST(makeReq({ ...baseBody, bunkerPort: 'XXXXX' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('bunker_price_unavailable');
    expect(body.error.details.port).toBe('XXXXX');
  });

  it('manual bunkerPriceUsdPerMt bypasses bunkerPort requirement → 200', async () => {
    const res = await POST(makeReq({ ...baseBody, bunkerPriceUsdPerMt: 620 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bunkerPriceSource.mode).toBe('manual');
    expect(body.bunkerPriceSource.value).toBe(620);
  });

  it('bunkerPort="GIGIB" → 200, uses GIGIB price', async () => {
    const res = await POST(makeReq({ ...baseBody, bunkerPort: 'GIGIB' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bunkerPriceSource.value).toBe(747);
  });
});
