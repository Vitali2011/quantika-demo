/**
 * Bug 1 (round-2) — DWT-based consumption curve.
 *
 * Acceptance: coaster 3 200 DWT Nemrut→Liverpool gives ~70–100 t (not 224 capped).
 * Unit tests validate each DWT class midpoint and the SEAGULL 78 scenario.
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { consFromDwt } from '@/app/api/voyage/bunker-recommendation/route';
import { GET } from '@/app/api/voyage/bunker-recommendation/route';

// ── Unit tests: consFromDwt ────────────────────────────────────────────────

describe('consFromDwt — DWT → t/day consumption curve', () => {
  it('0 DWT (unknown) → 28 t/day (Supramax fallback)', () => {
    expect(consFromDwt(0)).toBe(28);
  });

  it('3 200 DWT (coaster/MPP) → 6 t/day', () => {
    expect(consFromDwt(3_200)).toBe(6);
  });

  it('5 000 DWT (coaster upper edge) → 6 t/day', () => {
    expect(consFromDwt(5_000)).toBe(6);
  });

  it('7 500 DWT (small general) → 10 t/day', () => {
    expect(consFromDwt(7_500)).toBe(10);
  });

  it('10 000 DWT (small upper edge) → 10 t/day', () => {
    expect(consFromDwt(10_000)).toBe(10);
  });

  it('20 000 DWT (handysize mid) → 18 t/day', () => {
    expect(consFromDwt(20_000)).toBe(18);
  });

  it('35 000 DWT (handysize upper edge) → 18 t/day', () => {
    expect(consFromDwt(35_000)).toBe(18);
  });

  it('50 000 DWT (supramax mid) → 28 t/day', () => {
    expect(consFromDwt(50_000)).toBe(28);
  });

  it('70 000 DWT (panamax mid) → 33 t/day', () => {
    expect(consFromDwt(70_000)).toBe(33);
  });

  it('85 000 DWT (panamax upper edge) → 33 t/day', () => {
    expect(consFromDwt(85_000)).toBe(33);
  });

  it('100 000 DWT (capesize) → 40 t/day', () => {
    expect(consFromDwt(100_000)).toBe(40);
  });

  it('negative DWT treated as unknown → 28 t/day', () => {
    expect(consFromDwt(-100)).toBe(28);
  });
});

// ── Integration: SEAGULL 78 scenario (Bug 1 acceptance) ───────────────────

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
    INSERT INTO bunker_prices VALUES ('GIGIB', 'VLSFO', 771, '2026-06-02', 'seed', datetime('now'));
    INSERT INTO bunker_prices VALUES ('NLRTM', 'VLSFO', 791, '2026-06-02', 'seed', datetime('now'));
  `);
});

afterAll(() => db.close());

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDb: () => db })),
}));

jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn(() => null),
}));

jest.mock('@/lib/market/eua-repository', () => ({
  getLatestEuaPrice: jest.fn(() => null),
}));

describe('SEAGULL 78 — 3 200 DWT coaster, Nemrut Bay → Liverpool', () => {
  it('liftTonnes ~70–100 t (not 224 capped) when cons param absent, dwt=3200, days=10', async () => {
    const url =
      'http://localhost/api/voyage/bunker-recommendation' +
      '?from=ROCND&to=GBLIV&grade=VLSFO&dwt=3200&speedKn=10&voyageDays=10';
    const res = await GET(new NextRequest(url, { method: 'GET' }));
    const body = await res.json();
    // consFromDwt(3200) = 6 t/day; lift = (10+5)*6 = 90 t; cap = 3200*0.07 = 224 t → not capped
    expect(body.liftTonnes).toBe(90);
    expect(body.liftTonnes).toBeGreaterThanOrEqual(70);
    expect(body.liftTonnes).toBeLessThanOrEqual(100);
    expect(body.liftCapped).toBe(false);
    expect(body.capacityMt).toBe(224);
  });

  it('when explicit consMtPerDay=22 provided → uses explicit (not DWT curve)', async () => {
    const url =
      'http://localhost/api/voyage/bunker-recommendation' +
      '?from=ROCND&to=GBLIV&grade=VLSFO&dwt=3200&speedKn=10&consMtPerDay=22&voyageDays=10';
    const res = await GET(new NextRequest(url, { method: 'GET' }));
    const body = await res.json();
    // explicit 22 t/day → (10+5)*22 = 330 t; cap = 224 → capped
    expect(body.liftCapped).toBe(true);
    expect(body.liftTonnes).toBe(224);
  });
});
