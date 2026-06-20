import Database from 'better-sqlite3';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import { FALLBACK_EUA_EUR_PER_TCO2 } from '@/lib/constants';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

describe('GET /api/market/eua-kpi', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    migration024.up(testDb);
  });

  afterEach(() => {
    testDb.close();
    jest.resetModules();
  });

  it('returns fallback value + stale=true when DB has no EUA data', async () => {
    // Freshness gate: no row → getLatestEuaPrice returns null → route degrades
    // to FALLBACK + stale:true (200), not a hard 404. (PR#1069)
    testDb.exec('DELETE FROM eua_prices');
    const { GET } = await import('@/app/api/market/eua-kpi/route');

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(FALLBACK_EUA_EUR_PER_TCO2);
    expect(json.period).toBeNull();
    expect(json.stale).toBe(true);
  });

  it('returns fallback value + stale=true when the only row is stale', async () => {
    // Seed row 2026-05-04 is older than EUA_STALE_DAYS vs the real clock, so the
    // freshness gate drops it → route surfaces FALLBACK + stale:true. (PR#1069)
    const { GET } = await import('@/app/api/market/eua-kpi/route');

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(FALLBACK_EUA_EUR_PER_TCO2);
    expect(json.unit).toBe('€/tCO₂');
    expect(json.period).toBeNull();
    expect(json.stale).toBe(true);
  });

  it('returns most recent FRESH row when multiple dates exist', async () => {
    // A fresh (within-gate) newest row must win over the stale seed and be
    // surfaced with its real value, not the fallback. Use a relative recent date
    // so the assertion is timezone/clock-robust.
    const freshDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    testDb
      .prepare(
        `INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at)
         VALUES (?, ?, 'spot', 'test', datetime('now'))`,
      )
      .run(freshDate, 75.10);

    const { GET } = await import('@/app/api/market/eua-kpi/route');

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(75.10);
    expect(json.period).toBe(freshDate);
    expect(json.stale).toBe(false);
  });
});
